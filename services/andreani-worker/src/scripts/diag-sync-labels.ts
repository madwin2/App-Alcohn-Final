/**
 * Diagnóstico: entra al historial Pagados y vuelca estructura de la grilla.
 * Uso: ANDREANI_HEADLESS=false npx tsx src/scripts/diag-sync-labels.ts
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';
import { goToPaidShipments, scrapeCurrentPage } from '../andreani/download-labels.js';
import { saveArtifacts } from '../browser-helpers.js';

const config = loadConfig();
const { page, context } = await openAuthenticatedPage(config);

try {
  await goToPaidShipments(page, config);
  await page.waitForTimeout(2000);

  const artifactDir = await saveArtifacts(page, config.artifactsDir, 'diag-sync-labels');
  const info = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).map((t, i) => ({
      i,
      rows: t.querySelectorAll('tr').length,
      text: (t.innerText || '').slice(0, 400),
    }));
    const grids = Array.from(document.querySelectorAll('[role="grid"], [role="table"]')).map((el, i) => ({
      i,
      role: el.getAttribute('role'),
      rows: el.querySelectorAll('[role="row"]').length,
      text: (el as HTMLElement).innerText?.slice(0, 400) || '',
    }));
    const trackHits = Array.from(document.body.innerText.matchAll(/\b(3600\d{9,})\b/g)).map((m) => m[1]);
    const uniqueTracks = [...new Set(trackHits)];
    return {
      url: location.href,
      title: document.title,
      tables,
      grids,
      uniqueTracks: uniqueTracks.slice(0, 30),
      bodySample: (document.body.innerText || '').slice(0, 1500),
    };
  });

  const scraped = await scrapeCurrentPage(page);
  const out = { info, scraped };
  await writeFile(path.join(artifactDir, 'diag.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
  console.log('artifacts:', artifactDir);
} finally {
  await page.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  await closeBrowser();
}
