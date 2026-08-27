import { loadConfig, assertRuntimeConfig } from './config.js';
import { closeBrowser, openAuthenticatedPage } from './andreani/session.js';
import {
  downloadNewLabelsFromCurrentPage,
  goNextPage,
  goToPaidShipments,
  scrapeCurrentPage,
  type PortalShipment,
} from './andreani/download-labels.js';
import { saveArtifacts } from './browser-helpers.js';
import { setJobDetail } from './job-status.js';
import { enrichZebraLabelPdf, splitPdfPages } from './pdf/enrich-zebra.js';
import { matchDestinatario, type MatchCandidate } from './match-names.js';
import {
  applyTrackingToOrder,
  insertEtiqueta,
  listAssignedLinkCandidates,
  listKnownTrackings,
  loadEnrichInputByTracking,
  trackingAlreadyStored,
  updateEtiquetaPdfPath,
  uploadEtiquetaPdf,
  type LabelMatchCandidate,
} from './supabase.js';
import type { SyncLabelsResult } from './types.js';

function toMatchCandidates(rows: LabelMatchCandidate[]): MatchCandidate[] {
  return rows.map((r) => ({
    ordenId: r.ordenId,
    customerName: r.customerName,
    shippingName: r.shippingName,
  }));
}

function toEnrichInput(order: LabelMatchCandidate) {
  return {
    id: order.ordenId,
    designNames: order.designNames,
    caption: order.caption,
    imageUrls: order.imageUrls,
  };
}

async function persistPage(
  shipments: PortalShipment[],
  pdfBytes: Buffer,
  candidates: LabelMatchCandidate[],
  usedOrdenIds: Set<string>,
  logoPath: string,
): Promise<{ assigned: number; orphans: number; downloaded: number; refreshed: number }> {
  const pages = await splitPdfPages(new Uint8Array(pdfBytes));
  const n = Math.min(pages.length, shipments.length);
  let assigned = 0;
  let orphans = 0;
  let refreshed = 0;

  for (let i = 0; i < n; i += 1) {
    const ship = shipments[i];
    const alreadyStored = await trackingAlreadyStored(ship.tracking);

    let enrichInput: ReturnType<typeof toEnrichInput> | undefined;

    if (alreadyStored) {
      const existing = await loadEnrichInputByTracking(ship.tracking);
      if (existing) enrichInput = toEnrichInput(existing);
    } else {
      const openCandidates = candidates.filter((c) => !usedOrdenIds.has(c.ordenId));
      const match = matchDestinatario(ship.destinatario, toMatchCandidates(openCandidates));
      let ordenId: string | null = null;
      let estado: 'asignada' | 'huerfano' = 'huerfano';
      let nota: string | null = null;
      if (match.kind === 'hit') {
        ordenId = match.ordenId;
        estado = 'asignada';
        const order = candidates.find((c) => c.ordenId === ordenId);
        if (order) enrichInput = toEnrichInput(order);
      } else if (match.kind === 'ambiguous') {
        nota = 'ambiguous';
      }

      const enrichedNew = await enrichZebraLabelPdf(pages[i], ship.tracking, enrichInput, logoPath);
      let pdfPath: string | null = null;
      try {
        pdfPath = await uploadEtiquetaPdf(ship.tracking, enrichedNew);
      } catch (error) {
        console.warn('[andreani] upload PDF falló', ship.tracking, error);
      }

      await insertEtiqueta({
        tracking: ship.tracking,
        nroOperacion: ship.operacion,
        destinatario: ship.destinatario,
        destino: ship.destino,
        fechaPortal: ship.fecha,
        estadoPortal: ship.estado,
        ordenId,
        estado,
        pdfPath,
        nota,
      });

      if (ordenId) {
        await applyTrackingToOrder(ordenId, ship.tracking);
        usedOrdenIds.add(ordenId);
        assigned += 1;
      } else {
        orphans += 1;
      }
      continue;
    }

    const enriched = await enrichZebraLabelPdf(pages[i], ship.tracking, enrichInput, logoPath);
    try {
      const pdfPath = await uploadEtiquetaPdf(ship.tracking, enriched);
      await updateEtiquetaPdfPath(ship.tracking, pdfPath);
      refreshed += 1;
    } catch (error) {
      console.warn('[andreani] refresh PDF falló', ship.tracking, error);
    }
  }

  return { assigned, orphans, downloaded: n, refreshed };
}

export async function runSyncLabelsJob(): Promise<SyncLabelsResult> {
  const config = loadConfig();
  try {
    assertRuntimeConfig(config);
  } catch (error) {
    return {
      status: 'system_error',
      message: error instanceof Error ? error.message : String(error),
      httpStatus: 503,
      skipped: 0,
      downloaded: 0,
      assigned: 0,
      orphans: 0,
    };
  }

  const known = await listKnownTrackings();
  const candidates = await listAssignedLinkCandidates();
  const usedOrdenIds = new Set<string>();

  const { page, context } = await openAuthenticatedPage(config);
  let skipped = 0;
  let downloaded = 0;
  let assigned = 0;
  let orphans = 0;
  let refreshed = 0;

  try {
    setJobDetail('Abriendo historial Pagados…');
    await goToPaidShipments(page, config);
    console.log(`[andreani] sync-labels URL=${page.url()}`);

    let sawAny = false;
    let pagesVisited = 0;
    for (let guard = 0; guard < 80; guard += 1) {
      pagesVisited = guard + 1;
      setJobDetail(`Revisando página ${guard + 1} del historial…`);
      const rows = await scrapeCurrentPage(page);
      console.log(`[andreani] scrape página ${guard + 1}: ${rows.length} envío(s)`);
      if (rows.length) sawAny = true;
      const fresh = rows.filter((r) => !known.has(r.tracking));
      skipped += rows.length - fresh.length;

      // Solo regenerar PDFs conocidos si ANDREANI_REFRESH_KNOWN_LABELS=true
      // o si se pasan trackings explícitos en ANDREANI_REFRESH_TRACKINGS.
      const refreshList = (process.env.ANDREANI_REFRESH_TRACKINGS || '')
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const refreshAllKnown =
        (process.env.ANDREANI_REFRESH_KNOWN_LABELS ?? '').toLowerCase() === 'true' ||
        (process.env.ANDREANI_REFRESH_KNOWN_LABELS ?? '') === '1';
      const toDownload = rows.filter((r) => {
        if (fresh.some((f) => f.tracking === r.tracking)) return true;
        if (refreshList.length) return refreshList.includes(r.tracking);
        if (refreshAllKnown) return true;
        return false;
      });

      if (toDownload.length) {
        console.log(
          `[andreani] página ${guard + 1}: ${fresh.length} nuevo(s), descargando ${toDownload.length}`,
        );
        setJobDetail(
          `Página ${guard + 1}: descargando ${toDownload.length} etiqueta(s)${fresh.length ? ` (${fresh.length} nuevas)` : ''}…`,
        );
        try {
          const pdf = await downloadNewLabelsFromCurrentPage(
            page,
            config,
            toDownload.map((r) => r.tracking),
          );
          if (pdf) {
            setJobDetail(`Página ${guard + 1}: guardando PDFs en Supabase…`);
            const result = await persistPage(toDownload, pdf, candidates, usedOrdenIds, config.logoPath);
            downloaded += result.downloaded;
            assigned += result.assigned;
            orphans += result.orphans;
            refreshed += result.refreshed;
            for (const r of toDownload) known.add(r.tracking);
          }
        } catch (pageError) {
          console.warn('[andreani] falló página de etiquetas:', pageError);
          await saveArtifacts(page, config.artifactsDir, 'sync-labels-page-error').catch(() => undefined);
        }
      }

      if (!(await goNextPage(page))) {
        console.log(`[andreani] fin de paginación en página ${guard + 1} (total visitadas=${pagesVisited})`);
        break;
      }
    }

    if (!sawAny) {
      const artifactDir = await saveArtifacts(page, config.artifactsDir, 'sync-labels-empty');
      return {
        status: 'system_error',
        message:
          'No se encontraron envíos en el historial Pagados (¿cambió el portal o el filtro de fechas?). Revisá artifacts.',
        httpStatus: 503,
        skipped,
        downloaded: 0,
        assigned: 0,
        orphans: 0,
        details: { artifactDir },
      };
    }

    return {
      status: 'ok',
      message: `Nuevos ${assigned + orphans} (${assigned} asignados, ${orphans} huérfanos). PDFs regenerados: ${refreshed}. Omitidos: ${skipped}. Páginas revisadas: ${pagesVisited}.`,
      httpStatus: 200,
      skipped,
      downloaded,
      assigned,
      orphans,
      details: { refreshed, pagesVisited },
    };
  } catch (error) {
    const artifactDir = await saveArtifacts(page, config.artifactsDir, 'sync-labels-error').catch(
      () => undefined,
    );
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: downloaded || assigned || orphans || refreshed ? 'ok' : 'system_error',
      message:
        downloaded || assigned || orphans || refreshed
          ? `Parcial: ${message} (regenerados ${refreshed})`
          : message,
      httpStatus: downloaded || assigned || orphans || refreshed ? 200 : 503,
      skipped,
      downloaded,
      assigned,
      orphans,
      details: { artifactDir, refreshed },
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

export async function shutdownSyncWorker(): Promise<void> {
  await closeBrowser();
}
