import { resolveMode, stripBase64Prefix, vectorizePngBuffer } from './_vectorizerClient.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.5mb',
    },
  },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
    return;
  }

  const imageBase64 = stripBase64Prefix(req.body?.imageBase64);
  if (!imageBase64) {
    res.status(400).json({
      status: 'system_error',
      message: 'Falta imageBase64.',
      httpStatus: 400,
    });
    return;
  }

  let pngBuffer;
  try {
    pngBuffer = Buffer.from(imageBase64, 'base64');
  } catch {
    res.status(400).json({
      status: 'system_error',
      message: 'imageBase64 inválido.',
      httpStatus: 400,
    });
    return;
  }

  if (!pngBuffer.length) {
    res.status(400).json({
      status: 'system_error',
      message: 'La imagen está vacía.',
      httpStatus: 400,
    });
    return;
  }

  const mode = resolveMode(req.body?.mode);
  const overrides =
    req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : {};

  const result = await vectorizePngBuffer({
    pngBuffer,
    mode,
    overrides,
  });
  res.status(result.httpStatus).json(result.body);
}
