/**
 * Regenera PDFs de trackings concretos desde el portal Andreani (Zebra original + enrich).
 * Uso VPS:
 *   ANDREANI_REFRESH_TRACKINGS="3600… 3600…" npx tsx src/scripts/refresh-trackings.ts
 * o:
 *   npx tsx src/scripts/refresh-trackings.ts 3600… 3600…
 */
import { loadConfig, assertRuntimeConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';
import {
  downloadNewLabelsFromCurrentPage,
  goNextPage,
  goToPaidShipments,
  scrapeCurrentPage,
} from '../andreani/download-labels.js';
import { enrichZebraLabelPdf, splitPdfPages } from '../pdf/enrich-zebra.js';
import {
  loadEnrichInputByTracking,
  updateEtiquetaPdfPath,
  uploadEtiquetaPdf,
} from '../supabase.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const trackings = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : (process.env.ANDREANI_REFRESH_TRACKINGS || '').split(/[\s,]+/)
)
  .map((s) => s.trim())
  .filter(Boolean);

if (!trackings.length) {
  console.error('Pasá trackings por argv o ANDREANI_REFRESH_TRACKINGS');
  process.exit(1);
}

const want = new Set(trackings);
const config = loadConfig();
assertRuntimeConfig(config);

const outDir = '/tmp/andreani-refresh';
mkdirSync(outDir, { recursive: true });

const { page, context } = await openAuthenticatedPage(config);
const found = new Map<string, { pageIdx: number }>();

try {
  await goToPaidShipments(page, config);
  for (let guard = 0; guard < 80; guard += 1) {
    const rows = await scrapeCurrentPage(page);
    console.log(`página ${guard + 1}: ${rows.length} filas`);
    const onPage = rows.filter((r) => want.has(r.tracking));
    if (onPage.length) {
      for (const r of onPage) found.set(r.tracking, { pageIdx: guard + 1 });
      console.log(
        `  match: ${onPage.map((r) => r.tracking).join(', ')}`,
      );
      const pdf = await downloadNewLabelsFromCurrentPage(
        page,
        config,
        onPage.map((r) => r.tracking),
      );
      if (!pdf) {
        console.warn('  sin PDF');
      } else {
        const pages = await splitPdfPages(new Uint8Array(pdf));
        const n = Math.min(pages.length, onPage.length);
        for (let i = 0; i < n; i += 1) {
          const tracking = onPage[i].tracking;
          const order = await loadEnrichInputByTracking(tracking);
          const enrichInput = order
            ? {
                id: order.ordenId,
                designNames: order.designNames,
                caption: order.caption,
                imageUrls: order.imageUrls,
              }
            : undefined;
          // Original Andreani (vector) → enrich sin discard
          const enriched = await enrichZebraLabelPdf(
            pages[i],
            tracking,
            enrichInput,
            config.logoPath,
            { discardBottomFrac: 0 },
          );
          writeFileSync(`${outDir}/${tracking}.pdf`, Buffer.from(enriched));
          const pdfPath = await uploadEtiquetaPdf(tracking, enriched);
          await updateEtiquetaPdfPath(tracking, pdfPath);
          console.log(`  OK ${tracking} bytes=${enriched.length}`);
          want.delete(tracking);
        }
      }
    }
    if (!want.size) break;
    if (!(await goNextPage(page))) break;
  }
} finally {
  await page.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  await closeBrowser().catch(() => undefined);
}

if (want.size) {
  console.error('NO encontrados en portal:', [...want].join(', '));
  process.exit(2);
}
console.log('DONE all refreshed →', outDir);
