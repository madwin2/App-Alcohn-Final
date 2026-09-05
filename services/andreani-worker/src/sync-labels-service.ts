import { loadConfig, assertRuntimeConfig } from './config.js';
import { closeBrowser, openAuthenticatedPage } from './andreani/session.js';
import {
  downloadLabelByTracking,
  ensurePaidShipmentsGrid,
  goNextPage,
  goToPaidShipments,
  readTablePagination,
  scrapeCurrentPage,
  type PortalShipment,
} from './andreani/download-labels.js';
import { saveArtifacts } from './browser-helpers.js';
import { setJobDetail } from './job-status.js';
import {
  enrichZebraLabelPdf,
  indexOfPdfPageWithTracking,
  pdfContainsTracking,
  splitPdfPages,
} from './pdf/enrich-zebra.js';
import { isPendienteIngreso } from './map-andreani-portal-estado.js';
import { matchDestinatario, type MatchCandidate } from './match-names.js';
import {
  applyTrackingToOrder,
  insertEtiqueta,
  listAssignedLinkCandidates,
  listKnownTrackings,
  listTrackingsMissingPdf,
  loadEnrichInputByTracking,
  trackingAlreadyStored,
  updateEtiquetaPdfPath,
  updateEtiquetaPortalStatus,
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

/** Hoja del PDF que contiene ese tracking (no usar índice i = envío i). */
function resolvePageForTracking(
  pages: Uint8Array[],
  tracking: string,
  usedPages: Set<number>,
): Uint8Array | null {
  // Preferir hojas libres que contengan el tracking.
  for (let i = 0; i < pages.length; i += 1) {
    if (usedPages.has(i)) continue;
    if (pdfContainsTracking(pages[i], tracking)) {
      usedPages.add(i);
      return pages[i];
    }
  }
  // Si todas las que matchean ya se usaron, cualquier hoja con el tracking.
  const any = indexOfPdfPageWithTracking(pages, tracking);
  if (any >= 0) {
    usedPages.add(any);
    return pages[any];
  }
  return null;
}

async function persistPage(
  shipments: PortalShipment[],
  pdfBytes: Buffer,
  candidates: LabelMatchCandidate[],
  usedOrdenIds: Set<string>,
  logoPath: string,
): Promise<{ assigned: number; orphans: number; downloaded: number; refreshed: number }> {
  const pages = await splitPdfPages(new Uint8Array(pdfBytes));
  const usedPages = new Set<number>();
  let assigned = 0;
  let orphans = 0;
  let refreshed = 0;
  let downloaded = 0;

  for (const ship of shipments) {
    const pageBytes = resolvePageForTracking(pages, ship.tracking, usedPages);
    if (!pageBytes) {
      console.warn(
        `[andreani] PDF descartado: no contiene tracking ${ship.tracking} (hojas=${pages.length}). ` +
          'Evita guardar etiqueta de otro envío bajo este número.',
      );
      continue;
    }

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

      const enrichedNew = await enrichZebraLabelPdf(pageBytes, ship.tracking, enrichInput, logoPath);
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

      downloaded += 1;
      if (ordenId) {
        await applyTrackingToOrder(ordenId, ship.tracking);
        usedOrdenIds.add(ordenId);
        assigned += 1;
      } else {
        orphans += 1;
      }
      continue;
    }

    const enriched = await enrichZebraLabelPdf(pageBytes, ship.tracking, enrichInput, logoPath);
    try {
      const pdfPath = await uploadEtiquetaPdf(ship.tracking, enriched);
      await updateEtiquetaPdfPath(ship.tracking, pdfPath);
      downloaded += 1;
      refreshed += 1;
    } catch (error) {
      console.warn('[andreani] refresh PDF falló', ship.tracking, error);
    }
  }

  return { assigned, orphans, downloaded, refreshed };
}

type PageWork = {
  pageNum: number;
  rows: PortalShipment[];
  pendienteRows: PortalShipment[];
  toDownload: PortalShipment[];
};

function pickToDownload(
  pendienteRows: PortalShipment[],
  known: Set<string>,
  missingPdf: Set<string>,
  refreshList: string[],
  refreshAllKnown: boolean,
): PortalShipment[] {
  const fresh = pendienteRows.filter((r) => !known.has(r.tracking));
  return pendienteRows.filter((r) => {
    if (fresh.some((f) => f.tracking === r.tracking)) return true;
    if (missingPdf.has(r.tracking)) return true;
    if (refreshList.length) return refreshList.includes(r.tracking);
    if (refreshAllKnown) return true;
    return false;
  });
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
  const missingPdf = await listTrackingsMissingPdf();
  const candidates = await listAssignedLinkCandidates();
  const usedOrdenIds = new Set<string>();

  const { page, context } = await openAuthenticatedPage(config);
  let skipped = 0;
  let skippedNotPendiente = 0;
  let retriedMissingPdf = 0;
  let downloaded = 0;
  let assigned = 0;
  let orphans = 0;
  let refreshed = 0;
  let downloadFailedPages = 0;

  try {
    setJobDetail('Abriendo historial Pagados…');
    await goToPaidShipments(page, config);
    console.log(`[andreani] sync-labels URL=${page.url()}`);

    const refreshList = (process.env.ANDREANI_REFRESH_TRACKINGS || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const refreshAllKnown =
      (process.env.ANDREANI_REFRESH_KNOWN_LABELS ?? '').toLowerCase() === 'true' ||
      (process.env.ANDREANI_REFRESH_KNOWN_LABELS ?? '') === '1';

    // Fase 1: recorrer TODAS las páginas sin imprimir (imprimir rompe la paginación).
    const pageWorks: PageWork[] = [];
    let sawAny = false;
    let pagesVisited = 0;
    let portalTotal = 0;

    for (let guard = 0; guard < 80; guard += 1) {
      pagesVisited = guard + 1;
      setJobDetail(`Revisando página ${guard + 1} del historial…`);
      const pag = await readTablePagination(page);
      if (pag?.total) portalTotal = pag.total;
      const rows = await scrapeCurrentPage(page);
      console.log(
        `[andreani] scrape página ${guard + 1}: ${rows.length} envío(s)` +
          (pag ? ` (${pag.from}-${pag.to} de ${pag.total})` : ''),
      );
      if (rows.length) sawAny = true;

      const pendienteRows = rows.filter((r) => isPendienteIngreso(r.estado));
      skippedNotPendiente += rows.length - pendienteRows.length;

      for (const row of rows) {
        if (!known.has(row.tracking)) continue;
        try {
          await updateEtiquetaPortalStatus(row.tracking, {
            estadoPortal: row.estado,
            fechaPortal: row.fecha,
          });
        } catch {
          /* */
        }
      }

      const toDownload = pickToDownload(
        pendienteRows,
        known,
        missingPdf,
        refreshList,
        refreshAllKnown,
      );
      retriedMissingPdf += toDownload.filter((r) => missingPdf.has(r.tracking)).length;
      skipped += pendienteRows.length - toDownload.length;

      pageWorks.push({ pageNum: guard + 1, rows, pendienteRows, toDownload });

      if (!(await goNextPage(page))) {
        console.log(
          `[andreani] fin scrape página ${guard + 1} (visitadas=${pagesVisited}, portal total=${portalTotal || '?'})`,
        );
        break;
      }
    }

    const expectedPages = portalTotal ? Math.ceil(portalTotal / 10) : pagesVisited;
    if (portalTotal && pagesVisited < expectedPages) {
      console.warn(
        `[andreani] ADVERTENCIA: scrapeó ${pagesVisited} página(s) pero el portal indica ${expectedPages} (${portalTotal} envíos)`,
      );
    }

    // Fase 2: descargar etiqueta por etiqueta (imprimir varias rompe la grilla).
    const pagesWithDownloads = pageWorks.filter((w) => w.toDownload.length);
    for (const work of pagesWithDownloads) {
      const freshCount = work.toDownload.filter((r) => !known.has(r.tracking)).length;
      console.log(
        `[andreani] página ${work.pageNum}: descargando ${work.toDownload.length} etiqueta(s)${freshCount ? ` (${freshCount} nuevas)` : ''}`,
      );
      setJobDetail(
        `Página ${work.pageNum}: descargando ${work.toDownload.length} etiqueta(s)${freshCount ? ` (${freshCount} nuevas)` : ''}…`,
      );

      let pageOk = 0;
      let pageFail = 0;

      for (const ship of work.toDownload) {
        setJobDetail(`Página ${work.pageNum}: etiqueta ${ship.tracking}…`);
        try {
          const pdf = await downloadLabelByTracking(page, config, ship.tracking);
          if (pdf) {
            const result = await persistPage(
              [ship],
              pdf,
              candidates,
              usedOrdenIds,
              config.logoPath,
            );
            downloaded += result.downloaded;
            assigned += result.assigned;
            orphans += result.orphans;
            refreshed += result.refreshed;
            known.add(ship.tracking);
            pageOk += 1;
          } else {
            pageFail += 1;
            console.warn(`[andreani] sin PDF para ${ship.tracking} (página ${work.pageNum})`);
          }
        } catch (labelError) {
          pageFail += 1;
          console.warn('[andreani] falló etiqueta', ship.tracking, labelError);
          await saveArtifacts(page, config.artifactsDir, 'sync-labels-label-error').catch(
            () => undefined,
          );
          await ensurePaidShipmentsGrid(page, config).catch(() => undefined);
        }
      }

      if (pageFail > 0 && pageOk === 0) downloadFailedPages += 1;
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

    const failNote =
      downloadFailedPages > 0 ? ` Fallos descarga: ${downloadFailedPages} página(s).` : '';

    return {
      status: downloadFailedPages > 0 && !(assigned + orphans + refreshed) ? 'system_error' : 'ok',
      message: `Nuevos ${assigned + orphans} (${assigned} asignados, ${orphans} huérfanos). PDFs regenerados: ${refreshed}. Reintento sin PDF: ${retriedMissingPdf}. Omitidos: ${skipped}. Ya en camino/otro estado: ${skippedNotPendiente}. Páginas: ${pagesVisited}${portalTotal ? ` de ${Math.ceil(portalTotal / 10)} (${portalTotal} en portal)` : ''}.${failNote}`,
      httpStatus: downloadFailedPages > 0 && !(assigned + orphans + refreshed) ? 503 : 200,
      skipped,
      downloaded,
      assigned,
      orphans,
      details: {
        refreshed,
        pagesVisited,
        skippedNotPendiente,
        retriedMissingPdf,
        portalTotal,
        downloadFailedPages,
      },
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
