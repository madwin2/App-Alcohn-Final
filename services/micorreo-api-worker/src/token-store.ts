import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { rawFetch, parseJsonBody } from './http-client.js';
import type { TokenResult } from './types.js';

type CachedToken = {
  token: string;
  expiresAt: string;
  issuedAt: string;
  expiresRaw: string;
  apiBaseUrl: string;
};

const SKEW_MS = 5 * 60 * 1000;

let memory: CachedToken | null = null;

function tokenFile(): string {
  return path.join(loadConfig().artifactsDir, '.token.json');
}

export function parseExpireDate(raw: string, fallback = new Date()): Date {
  const text = raw.trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text) && !/[zZ]|[+-]\d{2}/.test(text)) {
    return new Date(`${text.replace(' ', 'T')}-03:00`);
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return fallback;
}

function toResult(cached: CachedToken): TokenResult {
  const expiresAt = new Date(cached.expiresAt);
  const issuedAt = new Date(cached.issuedAt);
  return {
    token: cached.token,
    expiresAt,
    expiresRaw: cached.expiresRaw,
    issuedAt,
    ttlMinutes: Math.max(0, (expiresAt.getTime() - issuedAt.getTime()) / 60_000),
  };
}

function stillValid(cached: CachedToken, force: boolean): boolean {
  if (force) return false;
  if (cached.apiBaseUrl !== loadConfig().apiBaseUrl) return false;
  return new Date(cached.expiresAt).getTime() - Date.now() > SKEW_MS;
}

async function readDisk(): Promise<CachedToken | null> {
  try {
    const raw = await readFile(tokenFile(), 'utf8');
    const parsed = JSON.parse(raw) as CachedToken;
    if (!parsed.token || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDisk(cached: CachedToken): Promise<void> {
  const file = tokenFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(cached, null, 2)}\n`, 'utf8');
}

export async function fetchNewToken(): Promise<TokenResult> {
  const config = loadConfig();
  const basic = Buffer.from(`${config.apiUser}:${config.apiPassword}`).toString('base64');
  const response = await rawFetch({
    method: 'POST',
    path: '/token',
    headers: { Authorization: `Basic ${basic}` },
    dumpName: 'token',
  });

  const parsed = parseJsonBody<Record<string, unknown>>(response.rawBody, '/token') ?? {};
  const token = typeof parsed.token === 'string' ? parsed.token : '';
  if (!token) {
    throw new Error('La API no devolvió token en POST /token.');
  }
  const expiresRaw =
    (typeof parsed.expire === 'string' && parsed.expire) ||
    (typeof parsed.expires === 'string' && parsed.expires) ||
    '';
  const issuedAt = new Date();
  const expiresAt = parseExpireDate(expiresRaw, new Date(issuedAt.getTime() + 2.5 * 60 * 60 * 1000));
  const cached: CachedToken = {
    token,
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    expiresRaw,
    apiBaseUrl: config.apiBaseUrl,
  };
  memory = cached;
  await writeDisk(cached);
  return toResult(cached);
}

export function invalidateToken(): void {
  memory = null;
}

export async function getToken(force = false): Promise<string> {
  if (memory && stillValid(memory, force)) return memory.token;
  if (!memory) {
    const disk = await readDisk();
    if (disk && stillValid(disk, force)) {
      memory = disk;
      return disk.token;
    }
  }
  const fresh = await fetchNewToken();
  return fresh.token;
}

export async function getTokenInfo(force = false): Promise<TokenResult> {
  await getToken(force);
  if (!memory) throw new Error('No hay token en cache.');
  return toResult(memory);
}

export function maskToken(token: string): string {
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
}
