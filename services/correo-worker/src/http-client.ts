import http from 'node:http';
import https from 'node:https';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { CorreoApiError } from './errors.js';
import type { RawHttpResponse } from './types.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH';

export type CorreoRequestOptions = {
  method: HttpMethod;
  /** Ruta absoluta desde el host, ej. `/v1/auth`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Dump slug, ej. `auth` / `tracking-GET_BODY`. */
  dumpName?: string;
  /** Si true, no lanza en status >= 400 (útil para probar variantes). */
  throwOnError?: boolean;
};

function sanitizeDumpName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'request';
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function buildUrl(baseUrl: string, apiPath: string, query?: CorreoRequestOptions['query']): URL {
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

function redact(value: string, apiKey: string): string {
  if (!apiKey) return value;
  return value.split(apiKey).join('***REDACTED***');
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
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

function maybeTruncateBase64(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maybeTruncateBase64);
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (
        typeof v === 'string' &&
        (k.toLowerCase() === 'filebase64' || k.toLowerCase() === 'file_base64') &&
        v.length > 120
      ) {
        out[k] = `${v.slice(0, 80)}…[truncated ${v.length} chars]`;
      } else {
        out[k] = maybeTruncateBase64(v);
      }
    }
    return out;
  }
  return value;
}

async function dumpArtifact(payload: unknown, dumpName: string): Promise<void> {
  const config = loadConfig();
  const dir = path.join(config.artifactsDir, 'responses');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${nowStamp()}-${sanitizeDumpName(dumpName)}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
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
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] ?? 'application/json';
    requestHeaders['Content-Length'] = String(Buffer.byteLength(bodyText));
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: requestHeaders,
      },
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

/**
 * Transporte de bajo nivel. No interpreta JSON.
 * Soporta body en GET (necesario para `/v1/tracking`).
 * Sin reintentos: el primer error se ve tal cual.
 */
export async function correoRequest(options: CorreoRequestOptions): Promise<RawHttpResponse> {
  const config = loadConfig();
  const url = buildUrl(config.apiBaseUrl, options.path, options.query);
  const bodyText = serializeBody(options.body);
  const headers: Record<string, string> = {
    Authorization: `Apikey ${config.apiKey}`,
    agreement: config.agreement,
    Accept: 'application/json',
  };

  const dumpName = options.dumpName ?? sanitizeDumpName(options.path.replace(/^\/v1\//, '') || 'request');
  const dumpRequest = {
    method: options.method,
    url: redact(url.toString(), config.apiKey),
    headers: {
      Authorization: 'Apikey ***REDACTED***',
      agreement: config.agreement,
      Accept: 'application/json',
      ...(bodyText !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ?? null,
  };

  let response: RawHttpResponse;
  try {
    response = await requestOnce(url, options.method, headers, bodyText, config.timeoutMs);
  } catch (error) {
    await dumpArtifact(
      {
        at: new Date().toISOString(),
        request: dumpRequest,
        error: error instanceof Error ? error.message : String(error),
      },
      `${dumpName}-network-error`,
    );
    throw error;
  }

  await dumpArtifact(
    {
      at: new Date().toISOString(),
      request: dumpRequest,
      response: {
        status: response.status,
        headers: response.headers,
        body: maybeTruncateBase64(parseBodyForDump(response.rawBody)),
        rawBodyLength: response.rawBody.length,
      },
    },
    dumpName,
  );

  const throwOnError = options.throwOnError !== false;
  if (throwOnError && response.status >= 400) {
    throw CorreoApiError.fromResponse(options.path, response);
  }

  return response;
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
