/**
 * Diagnóstico: busca uno o más trackings en la grilla Pagados y volca
 * la fila (HTML, checkboxes) + screenshot para entender por qué no se
 * puede marcar/imprimir la etiqueta.
 *
 * Uso: npx tsx src/scripts/diag-label-row.ts 360003074295710 360003074260690
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { closeBrowser, openAuthenticatedPage } from '../andreani/session.js';
import { goToPaidShipments, describeGrid } from '../andreani/download-labels.js';

const trackings = process.argv.slice(2).filter(Boolean);
if (!trackings.length) {
  console.error('Pasá al menos un tracking. Ej: npx tsx src/scripts/diag-label-row.ts 3600030...');
  process.exit(1);
}

const config = loadConfig();
const outDir = path.join(config.artifactsDir, 'diag-label-row');
await mkdir(outDir, { recursive: true });

const { page, context } = await openAuthenticatedPage(config);
const report: Record<string, unknown> = {};

try {
  await goToPaidShipments(page, config);

  for (const tracking of trackings) {
    console.log(`\n=== ${tracking} ===`);

    const search = page
      .getByPlaceholder(/env[ií]o|operaci|destinatario|seguimiento/i)
      .or(page.locator('input[type="search"], input[placeholder*="envío" i]'))
      .first();

    const searchVisible = await search.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`buscador visible: ${searchVisible}`);

    if (searchVisible) {
      await search.click({ force: true }).catch(() => undefined);
      await search.fill('');
      await page.waitForTimeout(400);
      await search.fill(tracking);
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForTimeout(2500);
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    }

    const info = await describeGrid(page, tracking).catch((e) => `error: ${String(e)}`);
    console.log(info);

    const printBtn = page.getByRole('button', { name: /imprimir etiquetas/i }).first();
    const printVisible = await printBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const printDisabled = printVisible
      ? await printBtn.isDisabled().catch(() => null)
      : null;
    console.log(`botón imprimir visible=${printVisible} disabled=${printDisabled}`);

    const shot = path.join(outDir, `${tracking}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
    console.log(`screenshot: ${shot}`);

    report[tracking] = { searchVisible, info, printVisible, printDisabled, shot };

    if (searchVisible) {
      await search.fill('');
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForTimeout(1500);
    }
  }

  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nreporte: ${path.join(outDir, 'report.json')}`);
} finally {
  await page.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  await closeBrowser();
}
