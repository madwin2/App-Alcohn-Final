import { correoRequest } from '../http-client.js';

/**
 * GET /v1/auth — éxito = HTTP 204 sin contenido.
 */
export async function checkAuth(): Promise<{ ok: true; status: number }> {
  const response = await correoRequest({
    method: 'GET',
    path: '/v1/auth',
    dumpName: 'auth',
  });

  if (response.status !== 204 && response.status !== 200) {
    throw new Error(`Auth inesperado: HTTP ${response.status}`);
  }

  return { ok: true, status: response.status };
}
