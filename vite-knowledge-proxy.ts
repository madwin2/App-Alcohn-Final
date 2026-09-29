import type { Connect, Plugin } from 'vite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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

type ResLike = {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
  end: (body?: string) => void;
  status?: (code: number) => ResLike;
  json?: (payload: unknown) => void;
};

function makeRes(res: Connect.ServerResponse): ResLike {
  const api: ResLike = {
    statusCode: 200,
    setHeader: (k, v) => {
      res.setHeader(k, v);
    },
    end: (body) => {
      res.statusCode = api.statusCode;
      res.end(body ?? '');
    },
    status(code: number) {
      api.statusCode = code;
      res.statusCode = code;
      return api;
    },
    json(payload: unknown) {
      res.statusCode = api.statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    },
  };
  return api;
}

/**
 * En `npm run dev`, ejecuta el mismo handler que `api/knowledge.js` (Vercel).
 * Propaga variables SUPABASE y OPENAI desde el env de Vite (loadEnv).
 */
export function knowledgeDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'knowledge-dev-proxy',
    configureServer(server) {
      // Propagar env al proceso del handler
      for (const [key, value] of Object.entries(env)) {
        if (value != null && process.env[key] == null) {
          process.env[key] = value;
        }
      }

      server.middlewares.use('/api/knowledge', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await readJsonBody(req);
          const handlerUrl = pathToFileURL(
            path.resolve(server.config.root, 'api/knowledge.js'),
          ).href;
          // Bust cache so rebuilds of knowledge modules pick up changes in dev
          const mod = await import(`${handlerUrl}?t=${Date.now()}`);
          const handler = mod.default as (
            req: Connect.IncomingMessage & { body?: unknown },
            res: ResLike,
          ) => Promise<void>;

          const fakeReq = Object.assign(req, { body });
          const fakeRes = makeRes(res);
          await handler(fakeReq, fakeRes);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Error en proxy knowledge',
            }),
          );
        }
      });
    },
  };
}
