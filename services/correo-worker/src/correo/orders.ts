import { correoRequest, parseJsonBody } from '../http-client.js';
import type { CancelResult, CorreoOrderPayload } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type CreateOrderResult = {
  trackingNumber: string;
  raw: unknown;
};

function extractTrackingNumber(raw: unknown): string {
  const rec = asRecord(raw);
  if (!rec) throw new Error('La API no devolvió un objeto al crear el envío.');

  const direct = rec.trackingNumber;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const nested = asRecord(rec.order);
  const nestedTn = nested?.trackingNumber;
  if (typeof nestedTn === 'string' && nestedTn.trim()) return nestedTn.trim();

  throw new Error('La API creó el envío pero no devolvió trackingNumber. Revisá artifacts/responses/.');
}

export async function createOrder(payload: CorreoOrderPayload): Promise<CreateOrderResult> {
  const response = await correoRequest({
    method: 'POST',
    path: '/v1/orders',
    body: payload,
    dumpName: 'orders-create',
  });

  const raw = parseJsonBody<unknown>(response.rawBody, '/v1/orders') ?? {};
  return {
    trackingNumber: extractTrackingNumber(raw),
    raw,
  };
}

export async function cancelOrder(trackingNumber: string): Promise<CancelResult> {
  const encoded = encodeURIComponent(trackingNumber);
  const response = await correoRequest({
    method: 'PATCH',
    path: `/v1/orders/${encoded}/cancel`,
    dumpName: 'orders-cancel',
  });

  const raw = parseJsonBody<unknown>(response.rawBody, `/v1/orders/${encoded}/cancel`) ?? {};
  const rec = asRecord(raw);
  return {
    codigo: typeof rec?.codigo === 'number' ? rec.codigo : Number(rec?.codigo) || null,
    mensaje: typeof rec?.mensaje === 'string' ? rec.mensaje : response.rawBody.trim() || 'OK',
    raw,
  };
}
