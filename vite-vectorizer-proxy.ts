import type { Connect } from 'vite';
import type { Plugin } from 'vite';
import {
  fetchVectorizerAccount,
  resolveMode,
  stripBase64Prefix,
  vectorizePngBuffer,
} from './api/_vectorizerClient.js';

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

/** En `npm run dev`, POST /api/vectorize habla con Vectorizer.AI. */
export function vectorizeDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'vectorize-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path !== '/api/vectorize') {
          next();
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const imageBase64 = stripBase64Prefix(body.imageBase64);
          if (!imageBase64) {
            sendJson(res, 400, {
              status: 'system_error',
              message: 'Falta imageBase64.',
              httpStatus: 400,
            });
            return;
          }
          const pngBuffer = Buffer.from(imageBase64, 'base64');
          const result = await vectorizePngBuffer({
            pngBuffer,
            mode: resolveMode(body.mode, env),
            overrides: body.overrides && typeof body.overrides === 'object' ? body.overrides : {},
            env,
          });
          sendJson(res, result.httpStatus, result.body);
        } catch (error) {
          sendJson(res, 503, {
            status: 'system_error',
            message: error instanceof Error ? error.message : 'No se pudo vectorizar.',
            httpStatus: 503,
          });
        }
      });
    },
  };
}

export function vectorizerAccountDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'vectorizer-account-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path !== '/api/vectorizer-account') {
          next();
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
          return;
        }
        const result = await fetchVectorizerAccount(env);
        sendJson(res, result.httpStatus, result.body);
      });
    },
  };
}
