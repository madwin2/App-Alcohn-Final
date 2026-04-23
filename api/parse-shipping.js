const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeParsed(payload) {
  return {
    fullName: safeTrim(payload?.fullName),
    province: safeTrim(payload?.province),
    locality: safeTrim(payload?.locality),
    address: safeTrim(payload?.address),
    postalCode: safeTrim(payload?.postalCode),
    email: safeTrim(payload?.email),
    phone: safeTrim(payload?.phone),
  };
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI parser not configured' });
    return;
  }

  const text = safeTrim(req.body?.text);
  if (!text) {
    res.status(400).json({ error: 'Missing text' });
    return;
  }

  const prompt = `Extrae datos de envío de Argentina desde texto libre.\nResponde SOLO JSON con estas claves exactas:\n{\n  \"fullName\": \"\",\n  \"province\": \"\",\n  \"locality\": \"\",\n  \"address\": \"\",\n  \"postalCode\": \"\",\n  \"email\": \"\",\n  \"phone\": \"\"\n}\nReglas:\n- Si no sabés un campo, devolver \"\".\n- No inventar valores.\n- Corregí ortografía leve solo si es obvia.\n- Mantener formato natural de provincia/localidad/domicilio.\n\nTexto:\n${text}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      res.status(502).json({ error: 'OpenAI request failed', details: body });
      return;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsedJson = extractJson(content);

    if (!parsedJson) {
      res.status(422).json({ error: 'AI response not parseable', raw: content });
      return;
    }

    res.status(200).json({ parsed: sanitizeParsed(parsedJson) });
  } catch (error) {
    res.status(500).json({
      error: 'Unexpected parser error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
