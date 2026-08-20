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
import { enrichZebraLabelPdf, splitPdfPages } from './pdf/enrich-zebra.js';
import { matchDestinatario, type MatchCandidate } from './match-names.js';
import {
  applyTrackingToOrder,
  insertEtiqueta,
  listAssignedLinkCandidates,
  listKnownTrackings,
  trackingAlreadyStored,
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

async function persistPage(
  shipments: PortalShipment[],
  pdfBytes: Buffer,
  candidates: LabelMatchCandidate[],
  usedOrdenIds: Set<string>,
  logoPath: string,
): Promise<{ assigned: number; orphans: number; downloaded: number }> {
  const pages = await splitPdfPages(new Uint8Array(pdfBytes));
  const n = Math.min(pages.length, shipments.length);
  let assigned = 0;
  let orphans = 0;

  for (let i = 0; i < n; i += 1) {
    const ship = shipments[i];
    if (await trackingAlreadyStored(ship.tracking)) continue;

    const openCandidates = candidates.filter((c) => !usedOrdenIds.has(c.ordenId));
    const match = matchDestinatario(ship.destinatario, toMatchCandidates(openCandidates));

    let ordenId: string | null = null;
    let estado: 'asignada' | 'huerfano' = 'huerfano';
    let nota: string | null = null;
    if (match.kind === 'hit') {
      ordenId = match.ordenId;
      estado = 'asignada';
    } else if (match.kind === 'ambiguous') {
      nota = 'ambiguous';
    }

    const order = ordenId ? candidates.find((c) => c.ordenId === ordenId) : undefined;
    const enriched = await enrichZebraLabelPdf(
      pages[i],
      ship.tracking,
      order
        ? {
            id: order.ordenId,
            designNames: order.designNames,
            caption: order.caption,
            imageUrls: order.imageUrls,
          }
        : undefined,
      logoPath,
    );

    let pdfPath: string | null = null;
    try {
      pdfPath = await uploadEtiquetaPdf(ship.tracking, enriched);
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
  }

  return { assigned, orphans, downloaded: n };
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

  try {
    await goToPaidShipments(page, config);
    console.log(`[andreani] sync-labels URL=${page.url()}`);

    let sawAny = false;
    for (let guard = 0; guard < 40; guard += 1) {
      const rows = await scrapeCurrentPage(page);
      console.log(`[andreani] scrape página ${guard + 1}: ${rows.length} envío(s)`);
      if (rows.length) sawAny = true;
      const fresh = rows.filter((r) => !known.has(r.tracking));
      skipped += rows.length - fresh.length;

      if (fresh.length) {
        console.log(`[andreani] página: ${fresh.length} envío(s) nuevos de ${rows.length}`);
        try {
          const pdf = await downloadNewLabelsFromCurrentPage(
            page,
            config,
            fresh.map((r) => r.tracking),
          );
          if (pdf) {
            const result = await persistPage(fresh, pdf, candidates, usedOrdenIds, config.logoPath);
            downloaded += result.downloaded;
            assigned += result.assigned;
            orphans += result.orphans;
            for (const r of fresh) known.add(r.tracking);
          }
        } catch (pageError) {
          console.warn('[andreani] falló página de etiquetas:', pageError);
          await saveArtifacts(page, config.artifactsDir, 'sync-labels-page-error').catch(() => undefined);
          // Seguir con la página siguiente; no tumbar todo el job
        }
      }

      if (!(await goNextPage(page))) break;
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
      message: `Omitidos ${skipped} (ya en sistema). Nuevos ${downloaded}: ${assigned} asignados, ${orphans} huérfanos.`,
      httpStatus: 200,
      skipped,
      downloaded,
      assigned,
      orphans,
    };
  } catch (error) {
    const artifactDir = await saveArtifacts(page, config.artifactsDir, 'sync-labels-error').catch(
      () => undefined,
    );
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: downloaded || assigned || orphans ? 'ok' : 'system_error',
      message: downloaded || assigned || orphans ? `Parcial: ${message}` : message,
      httpStatus: downloaded || assigned || orphans ? 200 : 503,
      skipped,
      downloaded,
      assigned,
      orphans,
      details: { artifactDir },
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

export async function shutdownSyncWorker(): Promise<void> {
  await closeBrowser();
}
