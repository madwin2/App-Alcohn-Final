import type { Page } from 'playwright';
import {
  ANDREANI_ENVIO_API_URL,
  linkStatusFromApi,
  parseEstadoPedidoText,
  type CompletedLinkData,
  type LinkApiStatus,
} from '../link-revision.js';

/** Andreani no responde (túnel de oficina cerrado, IP bloqueada): cortar la revisión entera. */
export class AndreaniUnreachableError extends Error {}

const NETWORK_ERROR_RE =
  /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_TUNNEL|ERR_PROXY|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT|ETIMEDOUT|Failed to fetch/i;

export function isAndreaniNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof AndreaniUnreachableError || NETWORK_ERROR_RE.test(message);
}

/**
 * Deja la página en el origen andreani.com: la API pública solo acepta CORS desde ahí.
 * Usa un link real como página de entrada.
 */
export async function openAndreaniOrigin(page: Page, anyLinkUrl: string, timeoutMs: number): Promise<void> {
  try {
    await page.goto(anyLinkUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  } catch (error) {
    if (isAndreaniNetworkError(error)) {
      throw new AndreaniUnreachableError(error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
  if (!/andreani\.com$/i.test(new URL(page.url()).hostname)) {
    throw new AndreaniUnreachableError(`Andreani redirigió a ${page.url()}`);
  }
}

/** ¿El cliente ya completó el link? (sin abrir la página). */
export async function fetchLinkApiStatus(page: Page, token: string): Promise<LinkApiStatus> {
  const url = `${ANDREANI_ENVIO_API_URL}?token=${encodeURIComponent(token)}`;
  const res = await page.evaluate(async (target) => {
    try {
      const r = await fetch(target, { headers: { accept: 'application/json' } });
      return { status: r.status, text: await r.text(), error: null as string | null };
    } catch (error) {
      return { status: 0, text: '', error: error instanceof Error ? error.message : String(error) };
    }
  }, url);

  if (res.error) throw new AndreaniUnreachableError(res.error);
  if (/sitio bloqueado/i.test(res.text)) {
    throw new AndreaniUnreachableError('Andreani bloqueó la consulta (Sitio Bloqueado)');
  }
  if (res.status !== 200) return { kind: 'desconocido', detalle: `HTTP ${res.status}` };

  try {
    return linkStatusFromApi(JSON.parse(res.text));
  } catch {
    return { kind: 'desconocido', detalle: 'respuesta no JSON' };
  }
}

/** Abre un link ya completado y lee la página "¡Listo!" (nombre + seguimiento). */
export async function readCompletedLink(
  page: Page,
  linkUrl: string,
  timeoutMs: number,
): Promise<CompletedLinkData & { finalUrl: string }> {
  await page.goto(linkUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForURL(/estado-pedido/i, { timeout: timeoutMs }).catch(() => undefined);
  await page
    .waitForFunction(
      () => /(?<!\d)\d{15}(?!\d)/.test(document.querySelector('main')?.innerText ?? ''),
      null,
      { timeout: Math.min(timeoutMs, 20_000) },
    )
    .catch(() => undefined);

  const { text, name } = await page.evaluate(() => {
    const main = document.querySelector('main');
    const strong = document.querySelector('[class*="ShipmentScroll_name"] strong');
    return {
      text: main?.innerText ?? document.body?.innerText ?? '',
      name: strong?.textContent ?? null,
    };
  });

  return { ...parseEstadoPedidoText(text, name), finalUrl: page.url() };
}
