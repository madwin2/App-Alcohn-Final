import type { Connect } from 'vite';
import type { Plugin } from 'vite';

function readJsonBody(req: Connect.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: Connect.ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** En `npm run dev`, reenvía POST /api/micorreo-upload al worker (misma lógica que api/micorreo-upload.js en Vercel). */
export function micorreoUploadDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'micorreo-upload-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/micorreo-upload', async (req, res, next) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
          return;
        }

        const baseUrl = (env.MICORREO_WORKER_URL || '').replace(/\/$/, '');
        const apiKey = env.MICORREO_WORKER_API_KEY || '';

        if (!baseUrl || !apiKey) {
          sendJson(res, 503, {
            status: 'system_error',
            message:
              'Configurá MICORREO_WORKER_URL y MICORREO_WORKER_API_KEY en .env.local para desarrollo.',
            httpStatus: 503,
          });
          return;
        }

        try {
          const body = await readJsonBody(req);
          const csvContent = typeof body.csvContent === 'string' ? body.csvContent.trim() : '';
          if (!csvContent) {
            sendJson(res, 400, {
              status: 'data_error',
              message: 'Falta csvContent en el body.',
              httpStatus: 400,
            });
            return;
          }

          const response = await fetch(`${baseUrl}/upload`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              csvContent,
              orderId: typeof body.orderId === 'string' ? body.orderId : undefined,
              filename: typeof body.filename === 'string' ? body.filename : undefined,
            }),
          });

          const raw = await response.text();
          let data: unknown;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            sendJson(res, 503, {
              status: 'system_error',
              message: 'Respuesta inválida del worker MiCorreo.',
              httpStatus: 503,
              details: { portalText: raw.slice(0, 500) },
            });
            return;
          }

          sendJson(res, response.status, data);
        } catch (error) {
          sendJson(res, 503, {
            status: 'system_error',
            message: error instanceof Error ? error.message : 'No se pudo contactar al worker MiCorreo.',
            httpStatus: 503,
          });
        }
      });
    },
  };
}

/** En `npm run dev`, reenvía POST /api/vectorize-enqueue al worker de vectorización. */
export function vectorizeEnqueueDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'vectorize-enqueue-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/vectorize-enqueue', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
          return;
        }

        const baseUrl = (env.VECTOR_WORKER_URL || '').replace(/\/$/, '');
        const apiKey = env.VECTOR_WORKER_API_KEY || '';
        if (!baseUrl || !apiKey) {
          sendJson(res, 503, {
            status: 'system_error',
            message: 'Configurá VECTOR_WORKER_URL y VECTOR_WORKER_API_KEY en .env.local para desarrollo.',
            httpStatus: 503,
          });
          return;
        }

        try {
          const body = await readJsonBody(req);
          const selloId = typeof body.selloId === 'string' ? body.selloId.trim() : '';
          const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
          const fileUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
          const reason = typeof body.reason === 'string' ? body.reason.trim() : 'BASE_UPLOADED';

          if (!selloId || !orderId || !fileUrl) {
            sendJson(res, 400, {
              status: 'system_error',
              message: 'Faltan selloId, orderId o baseUrl.',
              httpStatus: 400,
            });
            return;
          }

          const response = await fetch(`${baseUrl}/enqueue`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ selloId, orderId, baseUrl: fileUrl, reason }),
          });

          const raw = await response.text();
          let data: unknown;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            sendJson(res, 503, {
              status: 'system_error',
              message: 'Respuesta inválida del worker de vectorización.',
              httpStatus: 503,
            });
            return;
          }

          sendJson(res, response.status, data);
        } catch (error) {
          sendJson(res, 503, {
            status: 'system_error',
            message: error instanceof Error ? error.message : 'No se pudo contactar al vector worker.',
            httpStatus: 503,
          });
        }
      });
    },
  };
}
