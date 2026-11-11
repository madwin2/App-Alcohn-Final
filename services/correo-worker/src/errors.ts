import type { RawHttpResponse } from './types.js';

export type CorreoErrorBody = {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function parseErrorBody(rawBody: string): unknown {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return rawBody;
  }
}

function extractRawMessage(body: unknown, rawBody: string): string {
  const rec = asRecord(body);
  if (rec) {
    const message = rec.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    const error = rec.error;
    if (typeof error === 'string' && error.trim()) return error.trim();
    const mensaje = rec.mensaje;
    if (typeof mensaje === 'string' && mensaje.trim()) return mensaje.trim();
  }
  const text = rawBody.trim();
  if (text && text.length < 400 && !text.startsWith('<')) return text;
  return '';
}

function looksLikeSql(message: string): boolean {
  return /conversion failed|varchar|data type int|sql server|cannot insert/i.test(message);
}

function looksLikeZipState(message: string): boolean {
  return /codigo postal|código postal|codpostal|zip.?code|provincia/i.test(message);
}

function looksLikeDeliveryType(message: string): boolean {
  return /tipoentrega|deliverytype|tipo de entrega/i.test(message);
}

function looksLikeAgency(message: string): boolean {
  return /sucursal|agencyid|agencia/i.test(message);
}

function looksLikeTracking(message: string): boolean {
  return /tracking.?number|tn inexistente|pedido no encontrado/i.test(message);
}

/**
 * Traduce errores de Correo a un mensaje accionable.
 * Nunca devuelve el `message` crudo como único texto.
 */
export function traducirError(input: {
  status: number;
  path: string;
  rawBody: string;
  body?: unknown;
}): string {
  const rawMessage = extractRawMessage(input.body ?? parseErrorBody(input.rawBody), input.rawBody);
  const hint = rawMessage
    ? `Correo dijo: «${rawMessage.slice(0, 280)}»`
    : 'Correo no envió un mensaje descriptivo.';

  if (input.status === 401) {
    return `Credenciales inválidas (HTTP 401). La API-Key no fue reconocida. Revisá CORREO_API_KEY. ${hint}`;
  }

  if (input.status === 403) {
    return `Sin permiso (HTTP 403). El acuerdo no tiene habilitado este servicio o esa sucursal. ${hint}`;
  }

  if (input.status === 404) {
    return `No encontrado (HTTP 404) en ${input.path}. ${hint}`;
  }

  if (input.status >= 500) {
    return `Correo Argentino tuvo un error interno (HTTP ${input.status}). Reintentá más tarde. ${hint}`;
  }

  if (input.status === 400) {
    if (!rawMessage) {
      return `Correo Argentino rechazó la solicitud (HTTP 400) sin detalle. Revisá los datos enviados (CP vs provincia, peso en gramos, medidas enteras). Ruta: ${input.path}.`;
    }
    if (looksLikeSql(rawMessage)) {
      return `Un valor numérico llegó mal formado (¿decimales, letras o comas?). Correo internamente espera enteros como texto. ${hint}`;
    }
    if (looksLikeZipState(rawMessage)) {
      return `El código postal no coincide con la provincia, o alguno de los dos está mal. ${hint}`;
    }
    if (looksLikeDeliveryType(rawMessage)) {
      return `Tipo de entrega inválido. Solo se acepta homeDelivery, agency o locker (tal cual, con esa capitalización). ${hint}`;
    }
    if (looksLikeAgency(rawMessage)) {
      return `La sucursal no está habilitada para nuestro acuerdo, o falta agencyId. ${hint}`;
    }
    if (looksLikeTracking(rawMessage)) {
      return `El número de seguimiento no existe o no pertenece a este acuerdo. ${hint}`;
    }
    return `Correo Argentino rechazó los datos (HTTP 400). ${hint}`;
  }

  return `Error HTTP ${input.status} al llamar ${input.path}. ${hint}`;
}

export class CorreoApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly rawBody: string;
  readonly body: unknown;

  constructor(status: number, path: string, rawBody: string, body?: unknown) {
    const parsed = body ?? parseErrorBody(rawBody);
    super(traducirError({ status, path, rawBody, body: parsed }));
    this.name = 'CorreoApiError';
    this.status = status;
    this.path = path;
    this.rawBody = rawBody;
    this.body = parsed;
  }

  static fromResponse(path: string, response: RawHttpResponse): CorreoApiError {
    return new CorreoApiError(response.status, path, response.rawBody);
  }
}

export function printCliError(error: unknown): void {
  if (error instanceof CorreoApiError) {
    console.error(error.message);
    console.error(`  status=${error.status}  path=${error.path}`);
    return;
  }
  if (error instanceof Error) {
    console.error(error.message);
    return;
  }
  console.error(String(error));
}
