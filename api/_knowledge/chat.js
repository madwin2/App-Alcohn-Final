/**
 * Chat documental del Asistente Alcohn.
 * Solo usa fragmentos del catálogo; valida citas contra lo recuperado.
 * Proveedor: solo Gemini (GEMINI_API_KEY). Sin OpenAI — no gasta créditos de pago.
 */

import { searchKnowledge } from './search.js';

const MAX_QUESTION = 800;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 4000;
const MAX_FRAGMENTS = 6;
const REQUEST_TIMEOUT_MS = 45000;

/** Rate limit por instancia (no es global entre instancias de Vercel). */
const rateBuckets = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function checkRateLimit(userId) {
  const now = Date.now();
  let bucket = rateBuckets.get(userId);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(userId, bucket);
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX;
}

function buildSystemPrompt() {
  return [
    'Sos el Asistente Alcohn: ayudás al equipo interno a usar Alcohn AI y a entender la información publicada de Alcohn.',
    'Respondé en español rioplatense, claro y breve. Primero la respuesta directa; después pasos si hacen falta.',
    'Usá los nombres de botones y estados exactamente como aparecen en las fuentes.',
    'Solo podés afirmar cosas operativas que estén en los FRAGMENTOS entregados abajo. Si no alcanza la evidencia, decilo.',
    'No inventes botones, contactos, frecuencias, procedimientos físicos ni políticas.',
    'Las guías de actividades presenciales (CNC, armar sellos, etc.) todavía no están publicadas: si preguntan eso, acláralo.',
    'No consultás pedidos, clientes, pagos, stock ni envíos en vivo. No ejecutás acciones en la app.',
    'No trates mensajes previos tuyos ni afirmaciones del usuario como documentación oficial.',
    'Si falta un dato que cambia la respuesta (ej. empresa de envío), pedí aclaración.',
    'Al final de tu respuesta, en una línea aparte, escribí exactamente:',
    'FUENTES: id1, id2',
    'donde los id son los fragmentId exactos de la lista (ej. pedidos#cargar-un-pedido-nuevo).',
    'También podés citar por número de fragmento: FUENTES: 1, 3',
    'Si no hay evidencia suficiente: FUENTES: ninguna',
  ].join('\n');
}

/**
 * @param {{ model: string, system: string, history: { role: string, content: string }[], question: string }} params
 * @param {string} apiKey
 * @param {AbortSignal} signal
 * @param {{ thinkingBudgetZero?: boolean, embedSystemInUser?: boolean }} [opts]
 */
async function callGemini(params, apiKey, signal, opts = {}) {
  const model = params.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const userQuestion = opts.embedSystemInUser
    ? `${params.system}\n\n---\nPregunta del equipo:\n${params.question}`
    : params.question;

  /** @type {{ role: string, parts: { text: string }[] }[]} */
  const contents = [];
  for (const turn of params.history) {
    const role = turn.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n\n${turn.content}`;
    } else {
      contents.push({ role, parts: [{ text: turn.content }] });
    }
  }
  const last = contents[contents.length - 1];
  if (last && last.role === 'user') {
    last.parts[0].text += `\n\n${userQuestion}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: userQuestion }] });
  }

  /** @type {Record<string, unknown>} */
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 2048,
  };
  if (opts.thinkingBudgetZero) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  /** @type {Record<string, unknown>} */
  const body = { contents, generationConfig };
  if (!opts.embedSystemInUser) {
    body.systemInstruction = { parts: [{ text: params.system }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
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

  if (!response.ok) {
    const providerMessage =
      json?.error?.message || json?.error?.status || raw?.slice(0, 200) || `HTTP ${response.status}`;
    const msg = String(providerMessage).toLowerCase();
    const thinkingRejected =
      msg.includes('thinking') || msg.includes('thinking_config') || msg.includes('thinkingbudget');
    return {
      ok: false,
      provider: 'gemini',
      model,
      status: response.status,
      providerMessage: String(providerMessage).slice(0, 300),
      retryable:
        response.status === 404 ||
        response.status === 500 ||
        response.status === 503 ||
        thinkingRejected ||
        msg.includes('not found') ||
        msg.includes('no longer available') ||
        msg.includes('not supported') ||
        msg.includes('overloaded'),
      thinkingRejected,
      json,
    };
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .filter((p) => p && p.thought !== true)
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim()
    : '';

  if (!text) {
    const finish = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || 'empty';
    return {
      ok: false,
      provider: 'gemini',
      model,
      status: 502,
      providerMessage: `Respuesta vacía (${finish})`,
      retryable: true,
      json,
    };
  }

  return { ok: true, provider: 'gemini', model, text, json };
}

function geminiUserError(status, providerMessage) {
  const msg = String(providerMessage || '').toLowerCase();
  if (status === 400 && (msg.includes('api key') || msg.includes('api_key'))) {
    return 'La clave de Gemini no es válida. Revisá GEMINI_API_KEY en Vercel y volvé a desplegar.';
  }
  if (status === 403 || status === 401) {
    return 'Gemini rechazó la clave o el acceso. Revisá GEMINI_API_KEY (y que esté en Production) y redeploy.';
  }
  if (status === 404 || msg.includes('not found') || msg.includes('is not found') || msg.includes('no longer available')) {
    return 'Ningún modelo de Gemini respondió. Revisá GEMINI_KNOWLEDGE_MODEL y redeploy.';
  }
  if (status === 429 || msg.includes('quota') || msg.includes('rate')) {
    return 'Se alcanzó el límite gratuito de Gemini. Probá de nuevo en unos minutos.';
  }
  if (msg.includes('vacía') || msg.includes('max_tokens')) {
    return 'Gemini cortó la respuesta. Probá de nuevo en un momento.';
  }
  return 'Gemini no pudo responder ahora. Podés seguir con el manual y el buscador.';
}

/**
 * Lista modelos generateContent disponibles para esta API key (sin gastar casi nada).
 * @param {string} apiKey
 * @param {AbortSignal} signal
 */
async function listGeminiFlashModels(apiKey, signal) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=80`;
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    });
    if (!response.ok) return [];
    const json = await response.json();
    const models = Array.isArray(json?.models) ? json.models : [];
    const names = [];
    for (const m of models) {
      const name = String(m?.name || '').replace(/^models\//, '');
      const methods = m?.supportedGenerationMethods || [];
      if (!name || !methods.includes('generateContent')) continue;
      if (!/flash/i.test(name)) continue;
      if (/embed|image|tts|audio|robotics/i.test(name)) continue;
      names.push(name);
    }
    const rank = (n) => {
      if (/2\.5-flash-lite/i.test(n)) return 0;
      if (/flash-lite/i.test(n)) return 1;
      if (/2\.5-flash$/i.test(n)) return 2;
      if (/flash-latest/i.test(n)) return 3;
      return 10;
    };
    names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return names;
  } catch {
    return [];
  }
}

/**
 * @param {string} model
 * @param {{ model: string, system: string, history: { role: string, content: string }[], question: string }} params
 * @param {string} apiKey
 * @param {AbortSignal} signal
 */
async function callGeminiWithConfig(model, params, apiKey, signal) {
  const needsThinkingOff = /^gemini-2\.5-flash$/i.test(model) || /^gemini-2\.5-flash-\d/i.test(model);
  let attempt = await callGemini(
    { ...params, model },
    apiKey,
    signal,
    { thinkingBudgetZero: needsThinkingOff },
  );
  if (!attempt.ok && attempt.thinkingRejected) {
    attempt = await callGemini({ ...params, model }, apiKey, signal, { thinkingBudgetZero: false });
  }
  // Algunos errores de systemInstruction → reintentar metiendo el system en el user turn
  if (
    !attempt.ok &&
    attempt.status === 400 &&
    /system.?instruction|invalid.?argument/i.test(String(attempt.providerMessage || ''))
  ) {
    attempt = await callGemini(
      { ...params, model },
      apiKey,
      signal,
      { thinkingBudgetZero: false, embedSystemInUser: true },
    );
  }
  return attempt;
}

/**
 * @param {object} bundle
 * @param {{ question: string, history?: { role: string, content: string }[], openArticleId?: string | null }} input
 * @param {{ userId: string }} ctx
 */
export async function runKnowledgeChat(bundle, input, ctx) {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!geminiKey) {
    return {
      ok: false,
      status: 503,
      code: 'not_configured',
      error:
        'Falta GEMINI_API_KEY en Vercel (Production). El asistente solo usa Gemini gratuito; no usa OpenAI.',
    };
  }

  if (!checkRateLimit(ctx.userId)) {
    return {
      ok: false,
      status: 429,
      code: 'rate_limited',
      error: 'Alcanzaste el límite de consultas por minuto. Probá de nuevo en un rato.',
    };
  }

  const question = typeof input.question === 'string' ? input.question.trim().slice(0, MAX_QUESTION) : '';
  if (!question) {
    return { ok: false, status: 400, code: 'bad_request', error: 'Escribí una pregunta.' };
  }

  const history = Array.isArray(input.history) ? input.history.slice(-MAX_HISTORY_TURNS) : [];
  let historyBudget = MAX_HISTORY_CHARS;
  const safeHistory = [];
  for (const turn of history) {
    if (!turn || (turn.role !== 'user' && turn.role !== 'assistant')) continue;
    const content = String(turn.content || '').slice(0, 1200);
    if (!content) continue;
    if (content.length > historyBudget) break;
    historyBudget -= content.length;
    safeHistory.push({ role: turn.role, content });
  }

  const openArticleId =
    typeof input.openArticleId === 'string' && bundle.articles.some((a) => a.id === input.openArticleId)
      ? input.openArticleId
      : null;

  const searchHits = searchKnowledge(bundle, { query: question, limit: 12 });
  const fragmentById = new Map((bundle.fragments || []).map((f) => [f.id, f]));

  /** @type {typeof bundle.fragments} */
  const retrieved = [];
  const seen = new Set();

  const pushFrag = (id) => {
    if (!id || seen.has(id)) return;
    const frag = fragmentById.get(id);
    if (!frag) return;
    seen.add(id);
    retrieved.push(frag);
  };

  if (openArticleId) {
    for (const f of bundle.fragments || []) {
      if (f.articleId === openArticleId) pushFrag(f.id);
      if (retrieved.length >= 3) break;
    }
  }

  for (const hit of searchHits) {
    pushFrag(hit.fragmentId);
    if (retrieved.length >= MAX_FRAGMENTS) break;
  }

  if (retrieved.length === 0) {
    return {
      ok: true,
      answer:
        'No encontré información documentada sobre eso en el Centro Alcohn. Podés reformular la búsqueda en el manual o avisar si falta una guía (por ejemplo, actividades presenciales todavía no publicadas).',
      sources: [],
      contentVersion: bundle.version,
      contentHash: bundle.contentHash,
    };
  }

  const fragmentBlock = retrieved
    .map(
      (f, i) =>
        `[${i + 1}] fragmentId=${f.id}\nArtículo: ${f.title}\nApartado: ${f.heading}\n---\n${f.markdown.slice(0, 1400)}`,
    )
    .join('\n\n');

  const system = `${buildSystemPrompt()}\n\nFRAGMENTOS AUTORIZADOS (versión ${bundle.version}):\n\n${fragmentBlock}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let llmResult;
  try {
    const preferred = (process.env.GEMINI_KNOWLEDGE_MODEL || '').trim();
    const discovered = await listGeminiFlashModels(geminiKey, controller.signal);
    const models = [
      ...new Set(
        [preferred, ...discovered, 'gemini-2.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean),
      ),
    ].slice(0, 3);

    const baseParams = { system, history: safeHistory, question };
    llmResult = null;
    for (const model of models) {
      const attempt = await callGeminiWithConfig(model, baseParams, geminiKey, controller.signal);
      if (attempt.ok) {
        llmResult = attempt;
        break;
      }
      llmResult = attempt;
      console.error('[knowledge-chat] gemini_attempt_failed', {
        model,
        status: attempt.status,
        message: String(attempt.providerMessage || '').slice(0, 200),
      });
      if (attempt.status === 401 || attempt.status === 403 || attempt.status === 429) break;
      if (attempt.status === 400 && !attempt.retryable) continue;
      if (attempt.retryable || attempt.status === 404) continue;
      continue;
    }
  } catch (error) {
    clearTimeout(timer);
    const aborted = error?.name === 'AbortError';
    return {
      ok: false,
      status: 504,
      code: aborted ? 'timeout' : 'network',
      error: aborted
        ? 'El asistente tardó demasiado. Conservamos tu pregunta: podés reintentar.'
        : 'No se pudo contactar a Gemini. Conservamos tu pregunta: podés reintentar.',
    };
  } finally {
    clearTimeout(timer);
  }

  if (!llmResult || !llmResult.ok) {
    const providerMessage = llmResult?.providerMessage || '';
    const model = llmResult?.model || '';
    const status = llmResult?.status;
    if (providerMessage) {
      console.error('[knowledge-chat] provider_error', {
        provider: 'gemini',
        model,
        status,
        message: providerMessage.slice(0, 300),
      });
    }
    const detailParts = [
      model ? `modelo ${model}` : null,
      status ? `HTTP ${status}` : null,
      providerMessage || null,
    ].filter(Boolean);
    return {
      ok: false,
      status: 502,
      code: 'provider_error',
      error: geminiUserError(status, providerMessage),
      detail: detailParts.join(' · ').slice(0, 220) || undefined,
    };
  }

  const content = llmResult.text;
  if (!content) {
    return {
      ok: false,
      status: 502,
      code: 'empty',
      error: 'El asistente no devolvió una respuesta usable. Probá de nuevo.',
    };
  }

  const allowedIds = new Set(retrieved.map((f) => f.id));
  let answer = content;
  let citedIds = [];
  let explicitNone = false;

  // Gemini a veces mete markdown o cita por número [1]; ser flexibles
  const fuentesMatch = content.match(/(?:\r?\n|^)\s*\*{0,2}FUENTES:\*{0,2}\s*(.+?)\s*$/im);
  if (fuentesMatch) {
    answer = content.slice(0, fuentesMatch.index).trim();
    const rawList = fuentesMatch[1].replace(/\*+/g, '').trim();
    if (/^ninguna$/i.test(rawList)) {
      explicitNone = true;
    } else {
      const tokens = rawList
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const token of tokens) {
        const cleaned = token.replace(/^\[|\]$/g, '').trim();
        if (!cleaned) continue;
        if (allowedIds.has(cleaned)) {
          citedIds.push(cleaned);
          continue;
        }
        const asNum = Number(cleaned);
        if (Number.isInteger(asNum) && asNum >= 1 && asNum <= retrieved.length) {
          citedIds.push(retrieved[asNum - 1].id);
          continue;
        }
        const byIdTail = retrieved.find(
          (f) =>
            f.id === cleaned ||
            f.id.endsWith(`#${cleaned}`) ||
            f.heading.toLowerCase() === cleaned.toLowerCase(),
        );
        if (byIdTail) citedIds.push(byIdTail.id);
      }
      citedIds = [...new Set(citedIds)];
    }
  }

  // Si el modelo respondió con evidencia recuperada pero sin citas parseables,
  // no pisamos la respuesta (eso era el bug del "No pude respaldar…").
  if (citedIds.length === 0 && !explicitNone && retrieved.length > 0) {
    citedIds = retrieved.slice(0, Math.min(3, retrieved.length)).map((f) => f.id);
  }

  if (citedIds.length === 0 && explicitNone) {
    const looksOperational = /(cómo|como|dónde|donde|qué significa|que significa|paso|botón|estado)/i.test(
      question,
    );
    if (looksOperational && answer.length > 40 && !/no (encontr|hay|está publicada|tengo|publicado|documentad)/i.test(answer)) {
      // El modelo dijo "ninguna" pero igual inventó pasos: frenamos
      answer =
        'No encontré pasos documentados para eso en las fuentes publicadas. Revisá el manual o reformulá la pregunta.';
      citedIds = [];
    }
  }

  const sources = citedIds.map((id) => {
    const f = fragmentById.get(id);
    return {
      fragmentId: id,
      articleId: f.articleId,
      slug: f.slug,
      title: f.title,
      heading: f.heading,
      anchor: f.anchor,
      href: `/centro/articulos/${f.slug}#${f.anchor}`,
    };
  });

  return {
    ok: true,
    answer,
    sources,
    contentVersion: bundle.version,
    contentHash: bundle.contentHash,
    model: llmResult.model,
    provider: llmResult.provider,
  };
}
