/**
 * Sugiere un nombre corto para una muestra de mockup (texto).
 * POST JSON: { fileName?: string, validationDetails?: string }
 * Respuesta: { ok, suggestedName?, error? }
 *
 * Requiere OPENAI_API_KEY. Modelo: gpt-4o-mini (override con OPENAI_MOCKUP_NAME_MODEL).
 */

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ ok: false, error: 'OPENAI_API_KEY no configurada' });
    return;
  }

  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 120) : '';
  const validationDetails =
    typeof req.body?.validationDetails === 'string' ? req.body.validationDetails.trim().slice(0, 500) : '';

  const model = (process.env.OPENAI_MOCKUP_NAME_MODEL || 'gpt-4o-mini').trim();

  const userContent = [
    'Sugerí un nombre corto en español para una muestra de sello personalizado (máximo 4 palabras, sin comillas).',
    'Solo respondé el nombre, sin explicación ni puntuación final.',
    fileName ? `Nombre de archivo de referencia: ${fileName}` : '',
    validationDetails ? `Notas técnicas del diseño: ${validationDetails}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 40,
        messages: [
          {
            role: 'system',
            content:
              'Sos un asistente que nombra muestras de productos personalizados. Respuestas breves, título en español.',
          },
          { role: 'user', content: userContent },
        ],
      }),
    });

    const raw = await response.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const msg = json?.error?.message || raw?.slice(0, 300) || `HTTP ${response.status}`;
      res.status(200).json({ ok: false, error: msg });
      return;
    }

    const text = json?.choices?.[0]?.message?.content?.trim() || '';
    const suggestedName = text.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').slice(0, 80);

    if (!suggestedName) {
      res.status(200).json({ ok: false, error: 'La IA no devolvió un nombre usable' });
      return;
    }

    res.status(200).json({ ok: true, suggestedName, model });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error inesperado',
    });
  }
}
