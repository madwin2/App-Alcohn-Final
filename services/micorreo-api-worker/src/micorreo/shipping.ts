import { apiRequest, parseJsonBody } from '../http-client.js';
import type { ImportPayload, ImportResult } from '../types.js';

export async function importShipping(payload: ImportPayload): Promise<ImportResult> {
  const response = await apiRequest({
    method: 'POST',
    path: '/shipping/import',
    body: payload,
    dumpName: 'shipping-import',
  });

  const parsed = parseJsonBody<Record<string, unknown>>(response.rawBody, '/shipping/import') ?? {};
  const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : '';
  if (!createdAt) {
    throw new Error(
      'La API importó (HTTP 200) pero no devolvió createdAt. Revisá artifacts/responses/.',
    );
  }
  return { createdAt };
}
