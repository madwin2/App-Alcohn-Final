function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function workerBaseUrl() {
  return safeTrim(process.env.ANDREANI_WORKER_URL).replace(/\/$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
    return;
  }

  const baseUrl = workerBaseUrl();
  const apiKey = safeTrim(process.env.ANDREANI_WORKER_API_KEY);
  const hasUrl = Boolean(baseUrl);
  const hasKey = Boolean(apiKey);

  if (!hasUrl || !hasKey) {
    res.status(503).json({
      status: 'system_error',
      message:
        'Sync de seguimientos no configurado. En Vercel: ANDREANI_WORKER_URL + ANDREANI_WORKER_API_KEY, después Redeploy.',
      httpStatus: 503,
      checked: 0,
      updated: 0,
      dispatched: 0,
      pending: 0,
      notFound: 0,
    });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/sync-tracking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
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
        details: { portalText: raw.slice(0, 500) },
      });
      return;
    }

    res.status(response.status).json(data);
  } catch (error) {
    res.status(503).json({
      status: 'system_error',
      message: error instanceof Error ? error.message : 'No se pudo contactar al worker Andreani.',
      httpStatus: 503,
      checked: 0,
      updated: 0,
      dispatched: 0,
      pending: 0,
      notFound: 0,
    });
  }
}
