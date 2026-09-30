/**
 * Chat documental del Asistente Alcohn.
 * Solo usa fragmentos del catálogo; valida citas contra lo recuperado.
 * Proveedor: Gemini (GEMINI_API_KEY), con fallback a OpenAI si no hay Gemini.
 */

import { searchKnowledge } from './search.js';

const MAX_QUESTION = 800;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 4000;
const MAX_FRAGMENTS = 8;
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
 */
async function callGemini(params, apiKey, signal) {
  const model = params.model;
  // key en query es el formato documentado por AI Studio; header como refuerzo
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
    last.parts[0].text += `\n\n${params.question}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: params.question }] });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // JSON protobuf de Gemini: camelCase (systemInstruction / generationConfig)
      systemInstruction: { parts: [{ text: params.system }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    }),
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
    return {
      ok: false,
      provider: 'gemini',
      status: response.status,
      providerMessage: String(providerMessage).slice(0, 300),
      json,
    };
  }

  const parts = json?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim()
    : '';

  if (!text) {
    const finish = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || 'empty';
    return {
      ok: false,
      provider: 'gemini',
      status: 502,
      providerMessage: `Respuesta vacía (${finish})`,
      json,
    };
  }

  return { ok: true, provider: 'gemini', model, text, json };
}

function geminiUserError(status, providerMessage) {
  const msg = String(providerMessage || '').toLowerCase();
  if (status === 400 && msg.includes('api key')) {
    return 'La clave de Gemini no es válida. Revisá GEMINI_API_KEY en Vercel y volvé a desplegar.';
  }
  if (status === 403 || status === 401) {
    return 'Gemini rechazó la clave o el acceso. Revisá GEMINI_API_KEY (y que esté en Production) y redeploy.';
  }
  if (status === 404 || msg.includes('not found') || msg.includes('is not found') || msg.includes('no longer available')) {
    return 'Ningún modelo de Gemini respondió. Revisá GEMINI_KNOWLEDGE_MODEL (ej. gemini-2.5-flash) y redeploy.';
  }
  if (status === 429) {
    return 'Se alcanzó el límite gratuito de Gemini. Probá de nuevo en unos minutos.';
  }
  return 'El asistente no pudo responder ahora. Podés seguir con el manual y el buscador.';
}

/**
 * @param {{ model: string, system: string, history: { role: string, content: string }[], question: string }} params
 * @param {string} apiKey
 * @param {AbortSignal} signal
 */
async function callOpenAI(params, apiKey, signal) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: 'system', content: params.system },
        ...params.history.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user', content: params.question },
      ],
    }),
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
    return { ok: false, provider: 'openai', status: response.status, json, raw };
  }

  const text = String(json?.choices?.[0]?.message?.content || '').trim();
  return { ok: true, provider: 'openai', model: params.model, text, json };
}

/**
 * @param {object} bundle
 * @param {{ question: string, history?: { role: string, content: string }[], openArticleId?: string | null }} input
 * @param {{ userId: string }} ctx
 */
export async function runKnowledgeChat(bundle, input, ctx) {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

  if (!geminiKey && !openaiKey) {
    return {
      ok: false,
      status: 503,
      code: 'not_configured',
      error: 'El asistente no está disponible en este momento. Podés seguir usando el manual y el buscador.',
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
        `[${i + 1}] fragmentId=${f.id}\nArtículo: ${f.title}\nApartado: ${f.heading}\n---\n${f.markdown.slice(0, 1800)}`,
    )
    .join('\n\n');

  const system = `${buildSystemPrompt()}\n\nFRAGMENTOS AUTORIZADOS (versión ${bundle.version}):\n\n${fragmentBlock}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let llmResult;
  try {
    if (geminiKey) {
      // gemini-2.0-flash / 1.5 ya están apagados; default actual + fallbacks
      const preferred = (process.env.GEMINI_KNOWLEDGE_MODEL || 'gemini-2.5-flash').trim();
      const models = [
        ...new Set([
          preferred,
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-3.5-flash',
          'gemini-3.8-flash',
          'gemini-flash-latest',
        ]),
      ];
      llmResult = null;
      for (const model of models) {
        const attempt = await callGemini(
          { model, system, history: safeHistory, question },
          geminiKey,
          controller.signal,
        );
        if (attempt.ok) {
          llmResult = attempt;
          break;
        }
        llmResult = attempt;
        // Si la clave es inválida, no tiene sentido probar otros modelos
        if (attempt.status === 400 || attempt.status === 401 || attempt.status === 403) {
          const msg = String(attempt.providerMessage || '').toLowerCase();
          const modelMissing =
            msg.includes('not found') ||
            msg.includes('is not found') ||
            msg.includes('no longer available') ||
            msg.includes('not supported');
          if (!modelMissing) break;
          continue;
        }
        // 404 = modelo no disponible → probar el siguiente
        if (attempt.status !== 404) break;
      }
    } else {
      const model = (process.env.OPENAI_KNOWLEDGE_MODEL || process.env.OPENAI_MOCKUP_NAME_MODEL || 'gpt-4o-mini').trim();
      llmResult = await callOpenAI(
        { model, system, history: safeHistory, question },
        openaiKey,
        controller.signal,
      );
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
        : 'No se pudo contactar al asistente. Conservamos tu pregunta: podés reintentar.',
    };
  } finally {
    clearTimeout(timer);
  }

  if (!llmResult.ok) {
    const providerMessage = llmResult.providerMessage || '';
    if (providerMessage) {
      console.error('[knowledge-chat] provider_error', {
        provider: llmResult.provider,
        status: llmResult.status,
        message: providerMessage.slice(0, 300),
      });
    }
    return {
      ok: false,
      status: 502,
      code: 'provider_error',
      error:
        llmResult.provider === 'gemini'
          ? geminiUserError(llmResult.status, providerMessage)
          : 'El asistente no pudo responder ahora. Podés seguir con el manual y el buscador.',
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
