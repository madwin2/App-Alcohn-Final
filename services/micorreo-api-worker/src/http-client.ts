import http from 'node:http';
import https from 'node:https';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { MiCorreoApiError } from './errors.js';
import type { RawHttpResponse } from './types.js';

export type HttpMethod = 'GET' | 'POST';

export type RawFetchOptions = {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  dumpName?: string;
  throwOnError?: boolean;
};

function sanitizeDumpName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'request';
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function buildUrl(baseUrl: string, apiPath: string, query?: RawFetchOptions['query']): URL {
  const base = baseUrl.replace(/\/+$/, '');
  const normalized = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const url = new URL(`${base}${normalized}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function headerObject(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

function redactSecrets(value: string, secrets: string[]): string {
  let out = value;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join('***REDACTED***');
  }
  return out;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^authorization$/i.test(key)) {
      const kind = value.split(' ')[0] ?? 'Auth';
      out[key] = `${kind} ***REDACTED***`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function redactDeep(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') return redactSecrets(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, secrets));
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (/password|token|authorization/i.test(k) && typeof v === 'string') {
        out[k] = v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : '***REDACTED***';
      } else {
        out[k] = redactDeep(v, secrets);
      }
    }
    return out;
  }
  return value;
}

function parseBodyForDump(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…[truncated]` : trimmed;
  }
}

async function dumpArtifact(payload: unknown, dumpName: string): Promise<void> {
  const config = loadConfig();
  const dir = path.join(config.artifactsDir, 'responses');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${nowStamp()}-${sanitizeDumpName(dumpName)}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
}

function secrets(): string[] {
  const config = loadConfig();
  return [config.apiPassword, config.accountPassword, config.apiUser, config.accountEmail].filter(Boolean);
}

function requestOnce(
  url: URL,
  method: HttpMethod,
  headers: Record<string, string>,
  bodyText: string | undefined,
  timeoutMs: number,
): Promise<RawHttpResponse> {
  const transport = url.protocol === 'http:' ? http : https;
  const requestHeaders: Record<string, string> = { ...headers };
  if (bodyText !== undefined) {
    if (bodyText.length > 0) {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] ?? 'application/json';
    }
    requestHeaders['Content-Length'] = String(Buffer.byteLength(bodyText));
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      { method, headers: requestHeaders },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: headerObject(res.headers),
            rawBody: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout de ${timeoutMs}ms al llamar ${url.pathname}`));
    });
    req.on('error', reject);
    if (bodyText !== undefined) req.write(bodyText);
    req.end();
  });
}

function looksLikeHtmlChallenge(rawBody: string): boolean {
  const trimmed = rawBody.trim().slice(0, 80).toLowerCase();
  return trimmed.startsWith('<html') || trimmed.startsWith('<!doctype html');
}

export async function rawFetch(options: RawFetchOptions): Promise<RawHttpResponse> {
  const config = loadConfig();
  const url = buildUrl(config.apiBaseUrl, options.path, options.query);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'AlcohnMiCorreoCli/0.1',
    ...options.headers,
  };
  let bodyText: string | undefined;
  if (options.body !== undefined && options.body !== null) {
    bodyText = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  } else if (options.method === 'POST') {
    bodyText = '';
  }

  const dumpName = options.dumpName ?? sanitizeDumpName(options.path.replace(/^\//, '') || 'request');
  const dumpRequest = {
    method: options.method,
    url: redactSecrets(url.toString(), secrets()),
    headers: redactHeaders(headers),
    body: redactDeep(options.body ?? null, secrets()),
  };

  let result: RawHttpResponse;
  try {
    result = await requestOnce(url, options.method, headers, bodyText, config.timeoutMs);
    if (looksLikeHtmlChallenge(result.rawBody)) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      result = await requestOnce(url, options.method, headers, bodyText, config.timeoutMs);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dumpArtifact(
      { at: new Date().toISOString(), request: dumpRequest, error: message },
      `${dumpName}-network-error`,
    );
    throw error instanceof Error ? error : new Error(message);
  }

  await dumpArtifact(
    {
      at: new Date().toISOString(),
      request: dumpRequest,
      response: {
        status: result.status,
        headers: result.headers,
        body: redactDeep(parseBodyForDump(result.rawBody), secrets()),
        rawBodyLength: result.rawBody.length,
      },
    },
    dumpName,
  );

  const throwOnError = options.throwOnError !== false;
  if (throwOnError && result.status >= 400) {
    throw MiCorreoApiError.fromResponse(options.path, result);
  }
  return result;
}

export function parseJsonBody<T>(rawBody: string, pathForError: string): T | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`La respuesta de ${pathForError} no es JSON válido: ${trimmed.slice(0, 180)}`);
  }
}

/**
 * Llamada autenticada con Bearer. Un solo reintento ante 401 (renueva token).
 * Ante 429 no reintenta.
 */
export async function apiRequest(options: RawFetchOptions): Promise<RawHttpResponse> {
  const { getToken, invalidateToken } = await import('./token-store.js');
  const token = await getToken();
  const withAuth: RawFetchOptions = {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
    throwOnError: false,
  };

  let response = await rawFetch(withAuth);
  if (response.status === 401) {
    invalidateToken();
    const fresh = await getToken(true);
    response = await rawFetch({
      ...withAuth,
      dumpName: `${options.dumpName ?? 'request'}-retry401`,
      headers: { ...options.headers, Authorization: `Bearer ${fresh}` },
    });
  }

  if (response.status === 429) {
    throw MiCorreoApiError.fromResponse(options.path, response);
  }
  if (response.status >= 400) {
    throw MiCorreoApiError.fromResponse(options.path, response);
  }
  return response;
}
