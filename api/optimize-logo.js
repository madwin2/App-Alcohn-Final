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
    const form = new FormData();
    form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
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
    form.append('response_format', 'b64_json');
    form.append('image', new Blob([inputBuffer], { type: parsed.mime || 'image/png' }), 'logo.png');

    const response = await fetch(OPENAI_IMAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const details = await response.text();
      res.status(502).json({ error: 'OpenAI image edit failed', details });
      return;
    }

    const data = await response.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      res.status(422).json({ error: 'OpenAI response missing b64_json' });
      return;
    }

    res.status(200).json({
      optimizedDataUrl: `data:image/png;base64,${b64}`,
      source: 'openai',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unexpected optimizer error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
