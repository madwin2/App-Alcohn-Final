import { loadConfig, assertRuntimeConfig } from './config.js';
import { closeBrowser, openAuthenticatedPage } from './andreani/session.js';
import {
  goNextPage,
  goToPaidShipments,
  scrapeCurrentPage,
} from './andreani/download-labels.js';
import { shouldMarkDespachado } from './map-andreani-portal-estado.js';
import { setJobDetail } from './job-status.js';
import {
  listTrackingsForStatusRefresh,
  markOrderDespachado,
  updateEtiquetaPortalStatus,
  type TrackingStatusCandidate,
} from './supabase.js';
import type { SyncTrackingResult } from './types.js';

function formatNetworkError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const tunnelHint =
    /ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_TUNNEL|ERR_PROXY|ETIMEDOUT/i.test(raw)
      ? ' ¿Está corriendo el túnel de oficina (office-tunnel.ps1)?'
      : '';
  return raw + tunnelHint;
}

export async function runSyncTrackingJob(): Promise<SyncTrackingResult> {
  const config = loadConfig();
  try {
    assertRuntimeConfig(config);
  } catch (error) {
    return {
      status: 'system_error',
      message: error instanceof Error ? error.message : String(error),
      httpStatus: 503,
      checked: 0,
      updated: 0,
      dispatched: 0,
      pending: 0,
      notFound: 0,
    };
  }

  const candidates = await listTrackingsForStatusRefresh();
  if (!candidates.length) {
    return {
      status: 'ok',
      message: 'No hay pedidos Andreani (Transferido + Etiqueta lista) para revisar.',
      httpStatus: 200,
      checked: 0,
      updated: 0,
      dispatched: 0,
      pending: 0,
      notFound: 0,
    };
  }

  const byTracking = new Map<string, TrackingStatusCandidate>();
  for (const c of candidates) byTracking.set(c.tracking, c);
  const wanted = new Set(byTracking.keys());

  let checked = 0;
  let updated = 0;
  let dispatched = 0;
  let pending = 0;

  let page;
  let context;
  try {
    ({ page, context } = await openAuthenticatedPage(config));
  } catch (error) {
    await closeBrowser().catch(() => undefined);
    return {
      status: 'system_error',
      message: formatNetworkError(error),
      httpStatus: 503,
      checked: 0,
      updated: 0,
      dispatched: 0,
      pending: 0,
      notFound: 0,
    };
  }

  try {
    setJobDetail(`Revisando ${wanted.size} seguimiento(s) en el portal…`);
    await goToPaidShipments(page, config);

    for (let guard = 0; guard < 80 && wanted.size; guard += 1) {
      setJobDetail(`Portal página ${guard + 1} · faltan ${wanted.size}…`);
      const rows = await scrapeCurrentPage(page);
      for (const row of rows) {
        if (!wanted.has(row.tracking)) continue;
        wanted.delete(row.tracking);
        checked += 1;

        const cand = byTracking.get(row.tracking)!;
        await updateEtiquetaPortalStatus(row.tracking, {
          estadoPortal: row.estado,
          fechaPortal: row.fecha,
        });
        updated += 1;

        if (shouldMarkDespachado(row.estado)) {
          const ok = await markOrderDespachado(cand.ordenId);
          if (ok) {
            dispatched += 1;
            console.log(`[andreani] ${row.tracking}: portal="${row.estado}" → Despachado`);
          }
        } else {
          pending += 1;
          console.log(`[andreani] ${row.tracking}: portal="${row.estado}" (sigue pendiente)`);
        }
      }
      if (!wanted.size) break;
      if (!(await goNextPage(page))) break;
    }
  } catch (error) {
    return {
      status: 'system_error',
      message: formatNetworkError(error),
      httpStatus: 503,
      checked,
      updated,
      dispatched,
      pending,
      notFound: wanted.size,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await closeBrowser().catch(() => undefined);
  }

  const notFound = wanted.size;
  const parts = [
    `${checked} revisado(s)`,
    dispatched ? `${dispatched} → Despachado` : null,
    pending ? `${pending} pendiente(s) de ingreso` : null,
    notFound ? `${notFound} no encontrado(s) en portal` : null,
  ].filter(Boolean);

  return {
    status: 'ok',
    message: parts.join(' · ') || 'Listo',
    httpStatus: 200,
    checked,
    updated,
    dispatched,
    pending,
    notFound,
  };
}
