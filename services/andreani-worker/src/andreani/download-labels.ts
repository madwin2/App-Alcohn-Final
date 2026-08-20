import type { Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import { saveArtifacts } from '../browser-helpers.js';

export type PortalShipment = {
  tracking: string;
  operacion: string | null;
  destinatario: string;
  destino: string;
  fecha: string;
  estado: string;
};

async function clickHistory(page: Page, timeoutMs: number): Promise<void> {
  const hero = page.getByRole('button', { name: /ver historial de env[ií]os/i }).first();
  if (await hero.isVisible({ timeout: Math.min(timeoutMs, 6000) }).catch(() => false)) {
    await hero.click();
    return;
  }
  const side = page.getByRole('link', { name: /ver mis env[ií]os/i }).first();
  if (await side.isVisible({ timeout: 3000 }).catch(() => false)) {
    await side.click();
    return;
  }
  throw new Error('No se encontró "Ver historial de envíos" / "Ver mis envíos"');
}

async function scrapeCurrentPage(page: Page): Promise<PortalShipment[]> {
  return page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    const table = tables.find((t) => /seguimiento/i.test(t.innerText || ''));
    if (!table) return [];

    let headers = Array.from(table.querySelectorAll('thead th, thead td')).map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    );
    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    if (!headers.length && bodyRows.length) {
      headers = Array.from(bodyRows[0].querySelectorAll('th, td')).map((el) =>
        (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(),
      );
    }

    const idx = (re: RegExp) => headers.findIndex((h) => re.test(h));
    const iTrack = idx(/seguimiento/);
    const iDest = idx(/destinatario/);
    const iDestino = idx(/destino/);
    const iOp = idx(/operaci/);
    const iFecha = idx(/fecha/);
    const iEstado = idx(/estado/);

    const rows = bodyRows.filter((tr) => tr.querySelectorAll('td').length > 2);
    const out: PortalShipment[] = [];
    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) =>
        (td.textContent || '').replace(/\s+/g, ' ').trim(),
      );
      const trackCell = iTrack >= 0 ? cells[iTrack] || '' : cells.join(' ');
      const tracking = (trackCell.match(/\d{10,20}/) || [])[0] || '';
      if (!tracking) continue;
      out.push({
        tracking,
        operacion: (iOp >= 0 ? cells[iOp] : '').match(/\d{6,}/)?.[0] || null,
        destinatario: iDest >= 0 ? cells[iDest] || '' : '',
        destino: iDestino >= 0 ? cells[iDestino] || '' : '',
        fecha: iFecha >= 0 ? cells[iFecha] || '' : '',
        estado: iEstado >= 0 ? cells[iEstado] || '' : '',
      });
    }
    return out;
  });
}

async function goNextPage(page: Page): Promise<boolean> {
  const next = page
    .getByRole('button', { name: /next page|p[aá]gina siguiente|go to next page/i })
    .or(page.locator('button[aria-label*="next" i]'))
    .first();
  if (!(await next.isVisible({ timeout: 1500 }).catch(() => false))) return false;
  if (!(await next.isEnabled().catch(() => false))) return false;
  const before = (await scrapeCurrentPage(page)).map((r) => r.tracking).join(',');
  await next.click();
  await page.waitForTimeout(900);
  const after = (await scrapeCurrentPage(page)).map((r) => r.tracking).join(',');
  return after !== before && after.length > 0;
}

async function uncheckVisible(page: Page): Promise<void> {
  const boxes = page.locator('table tbody tr input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i += 1) {
    const box = boxes.nth(i);
    if (await box.isChecked().catch(() => false)) {
      await box.uncheck({ force: true }).catch(() => undefined);
    }
  }
}

async function checkTracking(page: Page, tracking: string): Promise<boolean> {
  const row = page.locator('table tbody tr', { hasText: tracking }).first();
  if (!(await row.isVisible({ timeout: 1500 }).catch(() => false))) return false;
  const box = row.locator('input[type="checkbox"]').first();
  await box.check({ force: true });
  return true;
}

async function printZebraAndDownload(page: Page, timeoutMs: number): Promise<Buffer> {
  const printBtn = page.getByRole('button', { name: /imprimir etiquetas/i }).first();
  await printBtn.click();

  const waitMs = Math.max(timeoutMs, 120_000);
  const zebraRadio = page.getByRole('radio', { name: /zebra/i }).first();
  const zebraText = page.getByText(/zebra\s*\(10\s*[x×]\s*15/i).first();
  if (await zebraRadio.isVisible({ timeout: 8000 }).catch(() => false)) {
    await zebraRadio.check({ force: true }).catch(async () => {
      await zebraRadio.click();
    });
  } else {
    await zebraText.waitFor({ state: 'visible', timeout: 20000 });
    await zebraText.click();
  }

  const downloadWait = page.waitForEvent('download', { timeout: waitMs }).catch(() => null);
  const pdfResponseWait = page
    .waitForResponse(
      (response) => {
        const ct = response.headers()['content-type'] || '';
        return response.ok() && (ct.includes('pdf') || /\.pdf(\?|$)/i.test(response.url()));
      },
      { timeout: waitMs },
    )
    .catch(() => null);

  await page.getByRole('button', { name: /^seleccionar$/i }).first().click();

  const download = await downloadWait;
  if (download) {
    const stream = await download.createReadStream();
    if (!stream) {
      const p = await download.path();
      if (!p) throw new Error('Download de etiquetas sin archivo');
      const { readFile } = await import('node:fs/promises');
      return readFile(p);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  const pdfResponse = await pdfResponseWait;
  if (pdfResponse) {
    return Buffer.from(await pdfResponse.body());
  }

  throw new Error('No llegó el PDF de etiquetas (¿cambió el modal de formato?)');
}

export async function collectPortalShipments(page: Page): Promise<PortalShipment[]> {
  const all: PortalShipment[] = [];
  const seen = new Set<string>();
  for (let guard = 0; guard < 40; guard += 1) {
    const rows = await scrapeCurrentPage(page);
    for (const row of rows) {
      if (seen.has(row.tracking)) continue;
      seen.add(row.tracking);
      all.push(row);
    }
    if (!(await goNextPage(page))) break;
  }
  return all;
}

export async function goToPaidShipments(page: Page, config: WorkerConfig): Promise<void> {
  await clickHistory(page, config.andreani.timeoutMs);
  await page.getByText(/estos son tus env[ií]os|pagados/i).first().waitFor({
    state: 'visible',
    timeout: config.andreani.timeoutMs,
  });
  const pagados = page.getByRole('tab', { name: /^pagados$/i }).first();
  if (await pagados.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pagados.click();
    await page.waitForTimeout(600);
  }

  const range = page.getByText(/[uú]ltimos\s+\d+\s+d[ií]as/i).first();
  if (await range.isVisible({ timeout: 2500 }).catch(() => false)) {
    await range.click();
    const opt = page.getByRole('option', { name: /30\s*d[ií]as|90\s*d[ií]as/i }).first();
    if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await opt.click();
      await page.waitForTimeout(800);
    } else {
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }
}

export async function downloadNewLabelsFromCurrentPage(
  page: Page,
  config: WorkerConfig,
  trackings: string[],
): Promise<Buffer | null> {
  if (!trackings.length) return null;
  await uncheckVisible(page);
  const selected: string[] = [];
  for (const tracking of trackings) {
    if (await checkTracking(page, tracking)) selected.push(tracking);
  }
  if (!selected.length) return null;
  try {
    return await printZebraAndDownload(page, config.andreani.timeoutMs);
  } catch (error) {
    await saveArtifacts(page, config.artifactsDir, 'print-zebra-error');
    throw error;
  }
}

export { scrapeCurrentPage, goNextPage };
