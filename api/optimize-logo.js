const OPENAI_IMAGE_API_URL = 'https://api.openai.com/v1/images/edits';

function parseDataUrl(input) {
  if (typeof input !== 'string') return null;
  const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(input.trim());
  if (!match) return null;
  return {
    mime: match[1],
    base64: match[2].replace(/\s/g, ''),
  };
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar imagen optimizada desde URL (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function callOpenAiEdit({ apiKey, model, inputBuffer, mime }) {
  const form = new FormData();
  form.append('model', model);
  form.append(
    'prompt',
    [
      'Convert this logo image into a production-ready stamp source while preserving the exact original design concept and proportions.',
      'Do NOT alter, redraw, reinterpret, add, remove, or stylize any element.',
      'Output only one centered logo with transparent or pure white background, monochrome single ink, black logo, high contrast, crisp edges.',
      'No shadows, no gradients, no textures, no extra text, no decorations.',
    ].join(' '),
  );
  form.append('size', '1024x1024');
  form.append('image', new Blob([inputBuffer], { type: mime || 'image/png' }), 'logo.png');

  const response = await fetch(OPENAI_IMAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI optimizer not configured' });
    return;
  }

  const parsed = parseDataUrl(req.body?.imageDataUrl);
  if (!parsed) {
    res.status(400).json({ error: 'Missing or invalid imageDataUrl' });
    return;
  }

  try {
    const inputBuffer = Buffer.from(parsed.base64, 'base64');
    const primaryModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const tried = [primaryModel];
    let attempt = await callOpenAiEdit({
      apiKey,
      model: primaryModel,
      inputBuffer,
      mime: parsed.mime,
    });

    if (!attempt.ok && primaryModel !== 'gpt-image-1') {
      tried.push('gpt-image-1');
      attempt = await callOpenAiEdit({
        apiKey,
        model: 'gpt-image-1',
        inputBuffer,
        mime: parsed.mime,
      });
    }

    if (!attempt.ok) {
      res.status(502).json({
        error: 'OpenAI image edit failed',
        details: attempt.raw,
        hint: 'Revisá OPENAI_API_KEY, OPENAI_IMAGE_MODEL y acceso al modelo en tu cuenta OpenAI.',
        triedModels: tried,
      });
      return;
    }

    const data = attempt.json;
    const first = data?.data?.[0] ?? null;
    const b64 = first?.b64_json;
    const imageUrl = first?.url;
    if (!b64 && !imageUrl) {
      res.status(422).json({
        error: 'OpenAI response missing image output',
        details: JSON.stringify(data ?? {}).slice(0, 3000),
        triedModels: tried,
      });
      return;
    }

    const optimizedDataUrl = b64 ? `data:image/png;base64,${b64}` : await urlToDataUrl(imageUrl);

    res.status(200).json({
      optimizedDataUrl,
      source: tried.length > 1 ? `openai:${tried[tried.length - 1]}` : `openai:${tried[0]}`,
      triedModels: tried,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unexpected optimizer error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
