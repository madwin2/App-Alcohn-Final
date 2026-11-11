import { CorreoApiError } from '../errors.js';
import { correoRequest, parseJsonBody } from '../http-client.js';
import type { TrackingEvent, TrackingHttpVariant, TrackingItem } from '../types.js';

const VARIANTS: TrackingHttpVariant[] = ['GET_BODY', 'GET_QUERY', 'POST'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * Acepta ISO (`2017-06-27T10:00:00-03:00`) y el formato real (`28-06-2022 11:53`).
 */
export function parseCorreoDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const text = value.trim();

  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return new Date(iso);

  const match = text.match(
    /^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match) {
    const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
    const parsed = Date.parse(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }

  return null;
}

function normalizeEvent(raw: unknown): TrackingEvent {
  const rec = asRecord(raw) ?? {};
  const date = str(rec.date);
  return {
    facilityId: str(rec.facilityId) ?? str(rec.facilityCode),
    facility: str(rec.facility),
    statusId: str(rec.statusId),
    status: str(rec.status),
    date,
    dateParsed: parseCorreoDate(date),
    sign: str(rec.sign),
  };
}

function normalizeItem(raw: unknown, fallbackTn: string): TrackingItem {
  const rec = asRecord(raw) ?? {};
  const eventsRaw = rec.event ?? rec.events ?? rec.Event;
  const events = Array.isArray(eventsRaw) ? eventsRaw.map(normalizeEvent) : [];
  events.sort((a, b) => {
    const ta = a.dateParsed?.getTime() ?? 0;
    const tb = b.dateParsed?.getTime() ?? 0;
    return ta - tb;
  });
  const quantity =
    typeof rec.quantity === 'number'
      ? rec.quantity
      : Number.parseInt(String(rec.quantity ?? rec.cantidad ?? events.length), 10) || 0;
  const trackingNumber = str(rec.trackingNumber) ?? fallbackTn;
  return {
    trackingNumber,
    quantity,
    countryId: str(rec.countryId),
    serviceType: str(rec.serviceType) ?? str(rec.productType),
    events,
    empty: quantity === 0 || events.length === 0,
  };
}

function looksLikeTrackingPayload(parsed: unknown): boolean {
  if (Array.isArray(parsed)) return true;
  const rec = asRecord(parsed);
  if (!rec) return false;
  return 'trackingNumber' in rec || 'event' in rec || 'quantity' in rec;
}

function parseItems(rawBody: string, trackingNumbers: string[]): TrackingItem[] | null {
  const parsed = parseJsonBody<unknown>(rawBody, '/v1/tracking');
  if (!looksLikeTrackingPayload(parsed)) return null;
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return trackingNumbers.map((tn, index) => normalizeItem(list[index] ?? { trackingNumber: tn, quantity: 0, event: [] }, tn));
}

type VariantAttempt = {
  variant: TrackingHttpVariant;
  status: number;
  rawBody: string;
};

async function tryVariant(
  variant: TrackingHttpVariant,
  trackingNumbers: string[],
  extClient?: string,
): Promise<VariantAttempt> {
  const body = trackingNumbers.map((tn) => ({ trackingNumber: tn }));
  const query: Record<string, string | undefined> = {};
  if (extClient) query.extClient = extClient;

  if (variant === 'GET_BODY') {
    const response = await correoRequest({
      method: 'GET',
      path: '/v1/tracking',
      query,
      body,
      dumpName: 'tracking-GET_BODY',
      throwOnError: false,
    });
    return { variant, status: response.status, rawBody: response.rawBody };
  }

  if (variant === 'GET_QUERY') {
    const params = new URLSearchParams();
    if (extClient) params.set('extClient', extClient);
    for (const tn of trackingNumbers) params.append('trackingNumber', tn);
    const qs = params.toString();
    const response = await correoRequest({
      method: 'GET',
      path: `/v1/tracking${qs ? `?${qs}` : ''}`,
      dumpName: 'tracking-GET_QUERY',
      throwOnError: false,
    });
    return { variant, status: response.status, rawBody: response.rawBody };
  }

  const response = await correoRequest({
    method: 'POST',
    path: '/v1/tracking',
    query,
    body,
    dumpName: 'tracking-POST',
    throwOnError: false,
  });
  return { variant, status: response.status, rawBody: response.rawBody };
}

export type GetTrackingResult = {
  items: TrackingItem[];
  variant: TrackingHttpVariant;
  attempts: Array<{ variant: TrackingHttpVariant; status: number }>;
};

/**
 * GET /v1/tracking con body (como dice el manual).
 * Si Correo lo rechaza, prueba query params y después POST.
 */
export async function getTracking(
  trackingNumbers: string[],
  extClient?: string,
): Promise<GetTrackingResult> {
  if (trackingNumbers.length === 0) {
    throw new Error('Hace falta al menos un tracking number.');
  }
  if (extClient && !/^\d{3}$/.test(extClient)) {
    throw new Error('extClient tiene que ser exactamente 3 caracteres numéricos.');
  }

  const attempts: GetTrackingResult['attempts'] = [];
  let lastAuthError: CorreoApiError | null = null;
  let lastFailure: VariantAttempt | null = null;

  for (const variant of VARIANTS) {
    const attempt = await tryVariant(variant, trackingNumbers, extClient);
    attempts.push({ variant: attempt.variant, status: attempt.status });

    if (attempt.status === 401 || attempt.status === 403) {
      lastAuthError = CorreoApiError.fromResponse('/v1/tracking', {
        status: attempt.status,
        headers: {},
        rawBody: attempt.rawBody,
      });
      break;
    }

    if (attempt.status >= 200 && attempt.status < 300) {
      try {
        const items = parseItems(attempt.rawBody, trackingNumbers);
        if (items) {
          return { items, variant: attempt.variant, attempts };
        }
      } catch {
        // cuerpo 2xx que no se pudo parsear: probar la siguiente variante
      }
    }

    lastFailure = attempt;
  }

  if (lastAuthError) throw lastAuthError;

  if (lastFailure) {
    throw CorreoApiError.fromResponse('/v1/tracking', {
      status: lastFailure.status || 400,
      headers: {},
      rawBody: lastFailure.rawBody,
    });
  }

  throw new Error('No se pudo consultar tracking: ninguna variante HTTP funcionó.');
}
