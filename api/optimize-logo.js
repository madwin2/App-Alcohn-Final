/**
 * Optimización de logo vía OpenAI Images API (`/v1/images/edits`).
 *
 * Los modelos GPT Image (gpt-image-1, gpt-image-1.5, gpt-image-2) esperan
 * cuerpo JSON con `images: [{ image_url }]` (data URL permitida) o multipart
 * con campo `image[]`, no el campo legacy `image` de DALL·E 2.
 *
 * Variables:
 * - OPENAI_API_KEY (requerida)
 * - OPENAI_IMAGE_MODEL (primario, ej. gpt-image-2)
 * - OPENAI_IMAGE_MODEL_FALLBACKS (opcional, coma: gpt-image-1.5,gpt-image-1)
 * - OPENAI_IMAGE_TIMEOUT_MS (default 90000)
 */

const OPENAI_IMAGE_EDITS_URL = 'https://api.openai.com/v1/images/edits';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 90_000);

const EDIT_PROMPT = [
  'Convert this logo image into a production-ready stamp source while preserving the exact original design concept and proportions.',
  'Do NOT alter, redraw, reinterpret, add, remove, or stylize any element.',
  'Output only one centered logo with transparent or pure white background, monochrome single ink, black logo, high contrast, crisp edges.',
  'No shadows, no gradients, no textures, no extra text, no decorations.',
].join(' ');

function parseDataUrl(input) {
  if (typeof input !== 'string') return null;
  const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(input.trim());
  if (!match) return null;
  return {
    mime: match[1],
    base64: match[2].replace(/\s/g, ''),
  };
}

function parseModelChain() {
  const primary = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2').trim();
  const rawFallbacks =
    process.env.OPENAI_IMAGE_MODEL_FALLBACKS ||
    'gpt-image-1.5,gpt-image-1';
  const fallbacks = rawFallbacks
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [primary, ...fallbacks];
  const seen = new Set();
  return chain.filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar imagen desde URL (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function openAiRequest({ apiKey, body, signal }) {
  const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, raw, json };
}

async function callEditJson({ apiKey, model, imageDataUrl, signal }) {
  const body = {
    model,
    images: [{ image_url: imageDataUrl }],
    prompt: EDIT_PROMPT,
    background: 'transparent',
    output_format: 'png',
    quality: 'high',
    size: '1024x1024',
    input_fidelity: 'high',
    moderation: 'low',
    n: 1,
  };
  return openAiRequest({ apiKey, body, signal });
}

async function callEditMultipart({ apiKey, model, inputBuffer, mime, fieldName, signal }) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', EDIT_PROMPT);
  form.append('background', 'transparent');
  form.append('output_format', 'png');
  form.append('quality', 'high');
  form.append('size', '1024x1024');
  form.append('input_fidelity', 'high');
  form.append('moderation', 'low');
  form.append('n', '1');
  const blob = new Blob([inputBuffer], { type: mime || 'image/png' });
  form.append(fieldName, blob, 'logo.png');

  const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal,
  });
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, raw, json };
}

function extractImageFromResponse(json) {
  const first = json?.data?.[0] ?? null;
  const b64 = first?.b64_json;
  const imageUrl = first?.url;
  if (b64) return { optimizedDataUrl: `data:image/png;base64,${b64}`, kind: 'b64' };
  if (imageUrl) return { imageUrl, kind: 'url' };
  return null;
}

async function tryModel({ apiKey, model, imageDataUrl, inputBuffer, mime }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  const signal = controller.signal;
  const attempts = [];

  try {
    const jsonAttempt = await callEditJson({ apiKey, model, imageDataUrl, signal });
    attempts.push({ mode: 'json', ...jsonAttempt });
    if (jsonAttempt.ok) {
      const extracted = extractImageFromResponse(jsonAttempt.json);
      if (extracted?.optimizedDataUrl) {
        return { ok: true, optimizedDataUrl: extracted.optimizedDataUrl, model, attempts };
      }
      if (extracted?.kind === 'url' && extracted.imageUrl) {
        const optimizedDataUrl = await urlToDataUrl(extracted.imageUrl);
        return { ok: true, optimizedDataUrl, model, attempts };
      }
    }

    for (const fieldName of ['image[]', 'image']) {
      const mp = await callEditMultipart({
        apiKey,
        model,
        inputBuffer,
        mime,
        fieldName,
        signal,
      });
      attempts.push({ mode: `multipart:${fieldName}`, ...mp });
      if (mp.ok) {
        const extracted = extractImageFromResponse(mp.json);
        if (extracted?.optimizedDataUrl) {
          return { ok: true, optimizedDataUrl: extracted.optimizedDataUrl, model, attempts };
        }
        if (extracted?.kind === 'url' && extracted.imageUrl) {
          const optimizedDataUrl = await urlToDataUrl(extracted.imageUrl);
          return { ok: true, optimizedDataUrl, model, attempts };
        }
      }
    }

    const last = attempts[attempts.length - 1];
    return {
      ok: false,
      model,
      attempts,
      message: last?.json?.error?.message || last?.raw?.slice(0, 500) || 'Sin respuesta válida',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Request failed';
    attempts.push({ mode: 'exception', ok: false, raw: msg, json: null });
    return { ok: false, model, attempts, message: msg };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI optimizer not configured', ok: false });
    return;
  }

  const fullDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl.trim() : '';
  const parsed = parseDataUrl(fullDataUrl);
  if (!parsed) {
    res.status(400).json({ error: 'Missing or invalid imageDataUrl', ok: false });
    return;
  }

  const inputBuffer = Buffer.from(parsed.base64, 'base64');
  const models = parseModelChain();
  const allAttempts = [];

  try {
    for (const model of models) {
      const result = await tryModel({
        apiKey,
        model,
        imageDataUrl: fullDataUrl,
        inputBuffer,
        mime: parsed.mime,
      });
      allAttempts.push({ model, ...result });
      if (result.ok && result.optimizedDataUrl) {
        res.status(200).json({
          ok: true,
          optimizedDataUrl: result.optimizedDataUrl,
          source: `openai:${result.model}`,
          usedModel: result.model,
          triedModels: models.slice(0, models.indexOf(model) + 1),
        });
        return;
      }
    }

    const last = allAttempts[allAttempts.length - 1];
    res.status(200).json({
      ok: false,
      error: 'OpenAI image edit failed for all models',
      details: last?.message || last?.attempts?.[last.attempts.length - 1]?.raw,
      triedModels: models,
      attemptsSummary: allAttempts.map((a) => ({
        model: a.model,
        ok: a.ok,
        message: a.message,
      })),
      optimizedDataUrl: null,
      source: 'openai-failed',
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Unexpected optimizer error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
