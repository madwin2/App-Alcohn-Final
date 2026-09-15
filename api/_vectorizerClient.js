import { ALCOHN_PRESET, ALLOWED_OVERRIDES } from './_vectorizerPreset.js';

export const VECTORIZER_API = 'https://api.vectorizer.ai/api/v1';
const VECTORIZE_TIMEOUT_MS = 180_000;

export function credentialsFromEnv(env = process.env) {
  const id = String(env.VECTORIZER_API_ID || '').trim();
  const secret = String(env.VECTORIZER_API_SECRET || '').trim();
  return { id, secret, ok: Boolean(id && secret) };
}

export function basicAuthHeader(id, secret) {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

export function resolveMode(raw, env = process.env) {
  const fallback = String(env.VECTORIZER_DEFAULT_MODE || 'production').trim();
  const candidate = String(raw || fallback).trim();
  if (candidate === 'test' || candidate === 'preview' || candidate === 'production') {
    return candidate;
  }
  return fallback === 'test' || fallback === 'preview' ? fallback : 'production';
}

export function stripBase64Prefix(value) {
  const raw = String(value || '').trim();
  const match = /^data:[^;]+;base64,([\s\S]+)$/i.exec(raw);
  return (match ? match[1] : raw).replace(/\s/g, '');
}

function applyOverrides(overrides) {
  const out = { ...ALCOHN_PRESET };
  if (!overrides || typeof overrides !== 'object') return out;
  for (const key of ALLOWED_OVERRIDES) {
    const value = overrides[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}

function parseErrorMessage(status, raw, json) {
  if (json && typeof json === 'object') {
    const msg = json.message || json.error || json.detail;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (raw && raw.length < 400) return raw;
  return `Vectorizer.AI HTTP ${status}`;
}

export async function vectorizePngBuffer({ pngBuffer, mode, overrides, env = process.env }) {
  const creds = credentialsFromEnv(env);
  if (!creds.ok) {
    return {
      httpStatus: 503,
      body: {
        status: 'system_error',
        message: 'Faltan VECTORIZER_API_ID / VECTORIZER_API_SECRET.',
        httpStatus: 503,
      },
    };
  }

  const params = applyOverrides(overrides);
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }), 'sheet.png');
  form.append('mode', mode);
  for (const [key, value] of Object.entries(params)) {
    form.append(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VECTORIZE_TIMEOUT_MS);
  try {
    const response = await fetch(`${VECTORIZER_API}/vectorize`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(creds.id, creds.secret) },
      body: form,
      signal: controller.signal,
    });
    const raw = await response.text();
    const creditsCharged = Number(response.headers.get('X-Credits-Charged') || 0);
    const creditsCalculated = Number(response.headers.get('X-Credits-Calculated') || 0);

    if (!response.ok) {
      let json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }
      return {
        httpStatus: response.status,
        body: {
          status: 'system_error',
          message: parseErrorMessage(response.status, raw, json),
          httpStatus: response.status,
          code: json?.code ?? null,
        },
      };
    }

    return {
      httpStatus: 200,
      body: {
        status: 'ok',
        svg: raw,
        creditsCharged,
        creditsCalculated,
        mode,
      },
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      httpStatus: 504,
      body: {
        status: 'system_error',
        message: aborted
          ? 'Vectorizer.AI tardó demasiado (timeout 180s).'
          : error instanceof Error
            ? error.message
            : 'No se pudo contactar a Vectorizer.AI.',
        httpStatus: 504,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchVectorizerAccount(env = process.env) {
  const creds = credentialsFromEnv(env);
  if (!creds.ok) {
    return {
      httpStatus: 503,
      body: {
        status: 'system_error',
        message: 'Faltan VECTORIZER_API_ID / VECTORIZER_API_SECRET.',
        httpStatus: 503,
      },
    };
  }

  try {
    const response = await fetch(`${VECTORIZER_API}/account`, {
      headers: { Authorization: basicAuthHeader(creds.id, creds.secret) },
    });
    const raw = await response.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      return {
        httpStatus: response.status,
        body: {
          status: 'system_error',
          message: parseErrorMessage(response.status, raw, json),
          httpStatus: response.status,
        },
      };
    }
    return {
      httpStatus: 200,
      body: {
        credits: Number(json?.credits ?? 0),
        subscriptionPlan: json?.subscriptionPlan ?? null,
        subscriptionState: json?.subscriptionState ?? null,
      },
    };
  } catch (error) {
    return {
      httpStatus: 503,
      body: {
        status: 'system_error',
        message: error instanceof Error ? error.message : 'No se pudo consultar la cuenta.',
        httpStatus: 503,
      },
    };
  }
}
