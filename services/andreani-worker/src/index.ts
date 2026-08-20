import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { envFileExists, loadConfig } from './config.js';
import { enqueueGenerateJob, enqueueRefillJob, enqueueSyncLabelsJob } from './job-queue.js';
import { shutdownWorker } from './generate-service.js';
import { countDisponibles } from './supabase.js';

const generateBodySchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
});

const refillBodySchema = z.object({
  min: z.number().int().min(1).max(100).optional(),
});

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
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

async function handleGenerate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = loadConfig();
  if (!isAuthorized(req, config.apiKey)) {
    sendJson(res, 401, { status: 'system_error', message: 'No autorizado', generated: 0, urls: [] });
    return;
  }

  let count = 1;
  try {
    const body = await readJsonBody(req);
    count = generateBodySchema.parse(body).count;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request inválido';
    sendJson(res, 400, { status: 'data_error', message, generated: 0, urls: [] });
    return;
  }

  const result = await enqueueGenerateJob(count);
  sendJson(res, result.httpStatus, result);
}

async function handleRefill(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = loadConfig();
  if (!isAuthorized(req, config.apiKey)) {
    sendJson(res, 401, { status: 'system_error', message: 'No autorizado', generated: 0, urls: [] });
    return;
  }

  let min: number | undefined;
  try {
    const body = await readJsonBody(req);
    min = refillBodySchema.parse(body).min;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request inválido';
    sendJson(res, 400, { status: 'data_error', message, generated: 0, urls: [] });
    return;
  }

  const result = await enqueueRefillJob(min);
  sendJson(res, result.httpStatus, result);
}

async function handleSyncLabels(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = loadConfig();
  if (!isAuthorized(_req, config.apiKey)) {
    sendJson(res, 401, {
      status: 'system_error',
      message: 'No autorizado',
      skipped: 0,
      downloaded: 0,
      assigned: 0,
      orphans: 0,
    });
    return;
  }

  const result = await enqueueSyncLabelsJob();
  sendJson(res, result.httpStatus, result);
}

export function startServer(): void {
  const config = loadConfig();

  const server = createServer(async (req, res) => {
    try {
      const pathname = (req.url || '/').split('?')[0].replace(/\/$/, '') || '/';

      if (req.method === 'GET' && pathname === '/health') {
        let poolDisponibles: number | null = null;
        try {
          if (config.supabaseUrl && config.supabaseServiceRoleKey) {
            poolDisponibles = await countDisponibles();
          }
        } catch {
          poolDisponibles = null;
        }
        sendJson(res, 200, {
          ok: true,
          service: 'andreani-worker',
          envLoaded: envFileExists(),
          hasCredentials: Boolean(config.andreani.user && config.andreani.password),
          hasSupabase: Boolean(config.supabaseUrl && config.supabaseServiceRoleKey),
          poolDisponibles,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/generate') {
        await handleGenerate(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/refill') {
        await handleRefill(req, res);
        return;
      }

      if (req.method === 'POST' && pathname === '/sync-labels') {
        await handleSyncLabels(req, res);
        return;
      }

      sendJson(res, 404, { status: 'system_error', message: 'Ruta no encontrada' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { status: 'system_error', message, generated: 0, urls: [] });
    }
  });

  server.requestTimeout = 0;
  server.timeout = 0;
  server.listen(config.port, () => {
    console.log(`[andreani-worker] escuchando en http://0.0.0.0:${config.port}`);
    console.log('[andreani-worker] GET /health | POST /generate | POST /refill | POST /sync-labels');
    if (!envFileExists()) {
      console.warn('[andreani-worker] No hay .env — copiá .env.example → .env');
    }
  });

  const shutdown = async () => {
    console.log('[andreani-worker] cerrando...');
    await shutdownWorker();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
