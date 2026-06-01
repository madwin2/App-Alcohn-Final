function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function workerBaseUrl() {
  return safeTrim(process.env.VECTOR_WORKER_URL).replace(/\/$/, '');
}

function vectorAutoEnabled() {
  const raw = process.env.VECTOR_AUTO_ENABLED ?? process.env.VITE_VECTOR_AUTO_ENABLED;
  return raw === 'true' || raw === '1';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
    return;
  }

  if (!vectorAutoEnabled()) {
    res.status(200).json({
      status: 'ignored',
      message: 'Vectorización automática desactivada.',
      httpStatus: 200,
    });
    return;
  }

  const baseUrl = workerBaseUrl();
  const apiKey = safeTrim(process.env.VECTOR_WORKER_API_KEY);

  if (!baseUrl || !apiKey) {
    res.status(503).json({
      status: 'system_error',
      message: 'Vector worker no configurado (VECTOR_WORKER_URL / VECTOR_WORKER_API_KEY).',
      httpStatus: 503,
    });
    return;
  }

  const selloId = safeTrim(req.body?.selloId);
  const orderId = safeTrim(req.body?.orderId);
  const baseUrlFile = safeTrim(req.body?.baseUrl);
  const reason = safeTrim(req.body?.reason) || 'BASE_UPLOADED';

  if (!selloId || !orderId || !baseUrlFile) {
    res.status(400).json({
      status: 'system_error',
      message: 'Faltan selloId, orderId o baseUrl.',
      httpStatus: 400,
    });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/enqueue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selloId, orderId, baseUrl: baseUrlFile, reason }),
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      res.status(503).json({
        status: 'system_error',
        message: 'Respuesta inválida del worker de vectorización.',
        httpStatus: 503,
      });
      return;
    }

    if (!data.status) {
      const detail = data.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((entry) => entry?.msg || entry?.message || String(entry)).join(', ')
            : 'Error del worker de vectorización.';
      data = {
        status: 'system_error',
        message,
        httpStatus: response.status,
      };
    }

    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      status: 'system_error',
      message: error instanceof Error ? error.message : 'No se pudo contactar al vector worker.',
      httpStatus: 503,
    });
  }
}
