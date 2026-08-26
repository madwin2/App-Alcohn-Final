function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function workerBaseUrl() {
  return safeTrim(process.env.ANDREANI_WORKER_URL).replace(/\/$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
    return;
  }

  const baseUrl = workerBaseUrl();
  const apiKey = safeTrim(process.env.ANDREANI_WORKER_API_KEY);
  if (!baseUrl || !apiKey) {
    res.status(503).json({
      status: 'system_error',
      message: 'Worker Andreani no configurado.',
      httpStatus: 503,
    });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      res.status(503).json({
        status: 'system_error',
        message: 'Respuesta inválida del worker Andreani.',
        httpStatus: 503,
      });
      return;
    }
    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      status: 'system_error',
      message: error instanceof Error ? error.message : 'No se pudo contactar al worker Andreani.',
      httpStatus: 503,
    });
  }
}
