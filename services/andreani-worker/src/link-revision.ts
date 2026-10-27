/**
 * Revisión de links asignados: lógica pura (sin Playwright ni Supabase).
 *
 * - `GET pymes-api.andreani.com/api/v1/AndreaniEnvio?token=…` es público (sin login):
 *   link sin usar → `pedidoId: null` ("Link de envio pendiente"); completado → `pedidoId`.
 * - Abrir un link completado redirige a `/cuenta/hacer-envio/estado-pedido/<pedidoId>`
 *   ("¡Listo!"), que muestra nombre, dirección, DNI, mail, cel y número de seguimiento.
 */

export const ANDREANI_ENVIO_API_URL = 'https://pymes-api.andreani.com/api/v1/AndreaniEnvio';

/** Token JWT del link `…/completa-tu-envio/<token>`. */
export function linkTokenFromUrl(url: string): string | null {
  const match = url.match(/completa-tu-envio\/([A-Za-z0-9._\-+=]+)/);
  return match?.[1] ?? null;
}

export type LinkApiStatus =
  | { kind: 'sin_usar' }
  | { kind: 'usado'; pedidoId: string }
  | { kind: 'desconocido'; detalle: string };

export function linkStatusFromApi(json: unknown): LinkApiStatus {
  if (!json || typeof json !== 'object') {
    return { kind: 'desconocido', detalle: 'respuesta vacía' };
  }
  const row = json as { pedidoId?: unknown };
  if (typeof row.pedidoId === 'string' && row.pedidoId.trim()) {
    return { kind: 'usado', pedidoId: row.pedidoId.trim() };
  }
  if (row.pedidoId === null) return { kind: 'sin_usar' };
  return { kind: 'desconocido', detalle: 'sin pedidoId' };
}

export type CompletedLinkData = {
  destinatario: string | null;
  /** Único número de seguimiento de la página; null si no hay o hay más de uno. */
  tracking: string | null;
  trackings: string[];
};

const TRACKING_RE = /(?<!\d)\d{15}(?!\d)/g;

function cleanText(value: string): string {
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Lee la página "¡Listo!" de un link completado.
 * `nameFromDom`: el `<strong>` de la tarjeta del envío, si se pudo leer.
 * Sin DOM: el nombre es la línea anterior a "DNI:" ("Nombre Apellido - Calle 123").
 */
export function parseEstadoPedidoText(text: string, nameFromDom?: string | null): CompletedLinkData {
  const trackings = [...new Set(text.match(TRACKING_RE) ?? [])];

  let destinatario = nameFromDom ? cleanText(nameFromDom) : '';
  if (!destinatario) {
    const lines = text.split(/\r?\n/).map(cleanText).filter(Boolean);
    const dniIdx = lines.findIndex((line) => /^DNI\b/i.test(line));
    if (dniIdx > 0) destinatario = cleanText(lines[dniIdx - 1].split(/\s+-\s+/)[0] ?? '');
  }

  return {
    destinatario: destinatario || null,
    tracking: trackings.length === 1 ? trackings[0] : null,
    trackings,
  };
}
