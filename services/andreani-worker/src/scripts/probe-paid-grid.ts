/**
 * Diagnóstico rápido: ¿Pagados muestra filas?
 * Uso VPS: npx tsx src/scripts/probe-paid-grid.ts
 */
import { loadConfig, assertRuntimeConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';
import {
  goToPaidShipments,
  scrapeCurrentPage,
  readTablePagination,
} from '../andreani/download-labels.js';

async function main() {
  const config = loadConfig();
  assertRuntimeConfig(config);
  const { page, context } = await openAuthenticatedPage(config);
  const failed: string[] = [];
  const interesting: string[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!/envio|shipment|pagado|historial|mis-envios|orders|graphql|api/i.test(url)) return;
    interesting.push(`${res.status()} ${url.slice(0, 200)}`);
    if (res.status() >= 400) failed.push(`${res.status()} ${url.slice(0, 180)}`);
  });

  try {
    await goToPaidShipments(page, config);
    await page.waitForTimeout(4000);
    let rows = await scrapeCurrentPage(page);
    console.log('URL', page.url());
    console.log('rows', rows.length, 'pag', await readTablePagination(page));
    console.log(
      'sample',
      rows.slice(0, 5).map((r) => `${r.tracking}/${r.destinatario}/${r.estado}`),
    );
    console.log('emptyMsg', await page.getByText(/no encontramos resultados/i).isVisible().catch(() => false));
    console.log('failed', failed.slice(0, 20));
    console.log('api', interesting.filter((u) => /envio|shipment|pagado|historial/i.test(u)).slice(0, 25));

    const btn = page.getByRole('button', { name: /limpiar filtros/i }).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log('click Limpiar filtros');
      await btn.click();
      await page.waitForTimeout(3500);
      rows = await scrapeCurrentPage(page);
      console.log('afterClear rows', rows.length, 'pag', await readTablePagination(page));
    }

    console.log('reload ver-envios…');
    await page.goto('https://pymes.andreani.com/ver-envios', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    const pagados = page.getByRole('tab', { name: /^pagados$/i }).first();
    if (await pagados.isVisible().catch(() => false)) {
      await pagados.click();
      await page.waitForTimeout(3500);
    }
    rows = await scrapeCurrentPage(page);
    console.log('afterReload rows', rows.length, 'pag', await readTablePagination(page));
    console.log(
      'sample2',
      rows.slice(0, 5).map((r) => `${r.tracking}/${r.destinatario}/${r.estado}`),
    );
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await closeBrowser().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
