import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { envFileExists, loadConfig } from './config.js';
import { enqueueUploadJob } from './job-queue.js';
import { shutdownWorker } from './upload-service.js';

const uploadBodySchema = z.object({
  orderId: z.string().min(1).max(64).optional(),
  csvContent: z.string().min(1),
  filename: z.string().min(1).max(200).optional(),
});

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        reject(new Error('Body vacío'));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  if (!apiKey) return false;
  const header = req.headers.authorization || '';
  if (header === `Bearer ${apiKey}`) return true;
  const alt = req.headers['x-api-key'];
  return typeof alt === 'string' && alt === apiKey;
}

async function handleUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = loadConfig();
  if (!isAuthorized(req, config.apiKey)) {
    sendJson(res, 401, { status: 'system_error', message: 'No autorizado' });
    return;
  }

  let parsed: z.infer<typeof uploadBodySchema>;
  try {
    const body = await readJsonBody(req);
    parsed = uploadBodySchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request inválido';
    sendJson(res, 400, { status: 'data_error', message });
    return;
  }

  const result = await enqueueUploadJob(parsed);
  sendJson(res, result.httpStatus, result);
}

export function startServer(): void {
  const config = loadConfig();

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, {
          ok: true,
          service: 'micorreo-worker',
          envLoaded: envFileExists(),
          hasCredentials: Boolean(config.micorreo.user && config.micorreo.password),
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/upload') {
        await handleUpload(req, res);
        return;
      }

      sendJson(res, 404, { status: 'system_error', message: 'Ruta no encontrada' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { status: 'system_error', message });
    }
  });

  server.listen(config.port, () => {
    console.log(`[micorreo-worker] escuchando en http://0.0.0.0:${config.port}`);
    console.log(`[micorreo-worker] GET /health | POST /upload`);
    if (!envFileExists()) {
      console.warn('[micorreo-worker] No hay .env — copiá .env.example → .env');
    }
  });

  const shutdown = async () => {
    console.log('[micorreo-worker] cerrando...');
    await shutdownWorker();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
