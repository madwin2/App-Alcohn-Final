function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function workerBaseUrl() {
  return safeTrim(process.env.MICORREO_WORKER_URL).replace(/\/$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
    return;
  }

  const baseUrl = workerBaseUrl();
  const apiKey = safeTrim(process.env.MICORREO_WORKER_API_KEY);

  if (!baseUrl || !apiKey) {
    res.status(503).json({
      status: 'system_error',
      message: 'Subida automática no configurada (MICORREO_WORKER_URL / MICORREO_WORKER_API_KEY).',
      httpStatus: 503,
    });
    return;
  }

  const csvContent = safeTrim(req.body?.csvContent);
  if (!csvContent) {
    res.status(400).json({
      status: 'data_error',
      message: 'Falta csvContent en el body.',
      httpStatus: 400,
    });
    return;
  }

  const orderId = safeTrim(req.body?.orderId) || undefined;
  const filename = safeTrim(req.body?.filename) || undefined;

  try {
    const response = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ csvContent, orderId, filename }),
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      res.status(503).json({
        status: 'system_error',
        message: 'Respuesta inválida del worker MiCorreo.',
        httpStatus: 503,
        details: { portalText: raw.slice(0, 500) },
      });
      return;
    }

    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      status: 'system_error',
      message: error instanceof Error ? error.message : 'No se pudo contactar al worker MiCorreo.',
      httpStatus: 503,
    });
  }
}
