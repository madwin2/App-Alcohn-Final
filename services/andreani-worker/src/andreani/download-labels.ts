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
  // Importante: no declarar funciones con nombre adentro de evaluate —
  // tsx/esbuild inyecta __name y rompe en el browser.
  return page.evaluate(() => {
    const TRACK_RE = /\b(\d{12,20})\b/;
    const normalize = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const out: Array<{
      tracking: string;
      operacion: string | null;
      destinatario: string;
      destino: string;
      fecha: string;
      estado: string;
    }> = [];
    const seen = new Set<string>();

    const pushRow = (row: {
      tracking: string;
      operacion: string | null;
      destinatario: string;
      destino: string;
      fecha: string;
      estado: string;
    }) => {
      if (!row.tracking || seen.has(row.tracking)) return;
      seen.add(row.tracking);
      out.push(row);
    };

    const tables = Array.from(document.querySelectorAll('table'));
    const table = tables.find((t) => /seguimiento/i.test(t.innerText || ''));
    if (table) {
      let headers = Array.from(table.querySelectorAll('thead th, thead td')).map((el) =>
        normalize(el.textContent || '').toLowerCase(),
      );
      const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      const allRows = bodyRows.length
        ? bodyRows
        : Array.from(table.querySelectorAll('tr')).filter((tr) => tr.querySelectorAll('td').length > 2);

      if (!headers.length) {
        const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
        if (headerRow) {
          headers = Array.from(headerRow.querySelectorAll('th, td')).map((el) =>
            normalize(el.textContent || '').toLowerCase(),
          );
        }
      }

      const idx = (re: RegExp) => headers.findIndex((h) => re.test(h));
      const iTrack = idx(/seguimiento/);
      const iDest = idx(/destinatario/);
      const iDestino = idx(/destino/);
      const iOp = idx(/operaci/);
      const iFecha = idx(/fecha/);
      const iEstado = idx(/estado/);

      for (const tr of allRows) {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => normalize(td.textContent || ''));
        if (cells.length < 2) continue;
        const trackCell = iTrack >= 0 ? cells[iTrack] || '' : cells.join(' ');
        const linkText = normalize(tr.querySelector('a')?.textContent || '');
        const tracking = trackCell.match(TRACK_RE)?.[1] || linkText.match(TRACK_RE)?.[1] || '';
        if (!tracking) continue;
        pushRow({
          tracking,
          operacion: (iOp >= 0 ? cells[iOp] : '').match(/\d{6,}/)?.[0] || null,
          destinatario: iDest >= 0 ? cells[iDest] || '' : '',
          destino: iDestino >= 0 ? cells[iDestino] || '' : '',
          fecha: iFecha >= 0 ? cells[iFecha] || '' : '',
          estado: iEstado >= 0 ? cells[iEstado] || '' : '',
        });
      }
    }

    if (!out.length) {
      const grids = Array.from(document.querySelectorAll('[role="grid"], [role="table"]'));
      for (const grid of grids) {
        const rows = Array.from(grid.querySelectorAll('[role="row"]'));
        for (const row of rows) {
          const text = normalize((row as HTMLElement).innerText || '');
          if (/^seguimiento/i.test(text)) continue;
          const tracking = text.match(TRACK_RE)?.[1] || '';
          if (!tracking) continue;
          const cells = Array.from(row.querySelectorAll('[role="gridcell"], [role="cell"]')).map((c) =>
            normalize(c.textContent || ''),
          );
          const dest =
            cells.find(
              (c) =>
                c &&
                !TRACK_RE.test(c) &&
                !/andreani|pendiente|pagado/i.test(c) &&
                /[a-zA-ZáéíóúÁÉÍÓÚ]{3,}/.test(c),
            ) || '';
          pushRow({
            tracking,
            operacion: cells.map((c) => c.match(/\b(\d{10,14})\b/)?.[1]).find(Boolean) || null,
            destinatario: dest,
            destino: '',
            fecha: cells.find((c) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c)) || '',
            estado: cells.find((c) => /pendiente|ingreso|en camino|entregado/i.test(c)) || '',
          });
        }
      }
    }

    if (!out.length) {
      const anchors = Array.from(document.querySelectorAll('a, span, div, p, td'));
      for (const el of anchors) {
        const raw = normalize(el.textContent || '');
        if (raw.length > 40) continue;
        const tracking = raw.match(/^(\d{12,20})$/)?.[1];
        if (!tracking) continue;
        if (!(tracking.length >= 14 || tracking.startsWith('36'))) continue;
        const rowEl =
          el.closest('tr') ||
          el.closest('[role="row"]') ||
          el.parentElement?.parentElement ||
          el.parentElement;
        const rowText = normalize((rowEl as HTMLElement | null)?.innerText || raw);
        const parts = rowText.split('\n').map(normalize).filter(Boolean);
        pushRow({
          tracking,
          operacion:
            parts.map((p) => p.match(/\b(\d{10,14})\b/)?.[1]).find((n) => n && n !== tracking) || null,
          destinatario:
            parts.find(
              (p) =>
                p !== tracking &&
                !/^\d+$/.test(p) &&
                !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(p) &&
                /[a-záéíóú]/i.test(p) &&
                p.length > 3 &&
                p.length < 80,
            ) || '',
          destino: '',
          fecha: parts.find((p) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(p)) || '',
          estado: parts.find((p) => /pendiente|ingreso|en camino|entregado/i.test(p)) || '',
        });
      }
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
  if (await box.isChecked().catch(() => false)) return true;
  try {
    await box.check({ force: true, timeout: 5000 });
  } catch {
    await box.click({ force: true }).catch(() => undefined);
  }
  return box.isChecked().catch(() => false);
}

async function chooseZebraFormat(page: Page, timeoutMs: number): Promise<void> {
  const waitMs = Math.min(timeoutMs, 25_000);

  // Modal ya abierto
  const zebraInModal = page
    .getByText(/zebra/i)
    .filter({ hasText: /10|15/i })
    .or(page.getByRole('radio', { name: /zebra/i }))
    .or(page.locator('label').filter({ hasText: /zebra/i }))
    .first();

  if (await zebraInModal.isVisible({ timeout: 1500 }).catch(() => false)) {
    await zebraInModal.click({ force: true });
    const selectBtn = page.getByRole('button', { name: /^seleccionar$/i }).first();
    if (await selectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await selectBtn.click();
    }
    return;
  }

  // Engranaje al lado de "Imprimir etiquetas" (hermano siguiente en el toolbar)
  const printBtn = page.getByRole('button', { name: /imprimir etiquetas/i }).first();
  const gear = printBtn.locator('xpath=following-sibling::button[1]');

  if (await gear.isVisible({ timeout: 2000 }).catch(() => false)) {
    await gear.click();
    await page.waitForTimeout(500);
  } else {
    const toolbarGear = page
      .locator('button[aria-label*="formato" i], button[aria-label*="config" i], button[title*="formato" i]')
      .first();
    if (await toolbarGear.isVisible({ timeout: 1500 }).catch(() => false)) {
      await toolbarGear.click();
    }
  }

  const zebra = page
    .getByRole('radio', { name: /zebra/i })
    .or(page.getByText(/zebra\s*\(?\s*10/i))
    .or(page.locator('label').filter({ hasText: /zebra/i }))
    .first();
  await zebra.waitFor({ state: 'visible', timeout: waitMs });
  await zebra.click({ force: true });

  const confirm = page
    .getByRole('button', { name: /^seleccionar$|^guardar$|^aceptar$|^aplicar$/i })
    .first();
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirm.click();
  }
}

async function printZebraAndDownload(page: Page, timeoutMs: number): Promise<Buffer> {
  const waitMs = Math.max(timeoutMs, 120_000);

  const downloadWait = page.waitForEvent('download', { timeout: waitMs }).catch(() => null);
  const pdfResponseWait = page
    .waitForResponse(
      (response) => {
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        return response.ok() && (ct.includes('pdf') || /\.pdf(\?|$)/i.test(response.url()));
      },
      { timeout: waitMs },
    )
    .catch(() => null);

  // Preferir setear formato Zebra antes (engranaje); si ya está, el print descarga directo
  try {
    await chooseZebraFormat(page, timeoutMs);
    await page.waitForTimeout(400);
  } catch {
    console.warn('[andreani] no se pudo pre-seleccionar Zebra por engranaje — se intenta al imprimir');
  }

  const printBtn = page.getByRole('button', { name: /imprimir etiquetas/i }).first();
  await printBtn.click();

  // Si aparece el modal de formato tras imprimir, elegirlo
  const zebraAfter = page
    .getByText(/zebra/i)
    .filter({ hasText: /10|15/i })
    .or(page.getByRole('radio', { name: /zebra/i }))
    .first();
  if (await zebraAfter.isVisible({ timeout: 5000 }).catch(() => false)) {
    await zebraAfter.click({ force: true });
    const selectBtn = page.getByRole('button', { name: /^seleccionar$/i }).first();
    await selectBtn.click();
  }

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
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

  const pagados = page
    .getByRole('tab', { name: /^pagados$/i })
    .or(page.getByRole('button', { name: /^pagados$/i }))
    .or(page.locator('[role="tab"], button, a').filter({ hasText: /^pagados$/i }))
    .first();
  if (await pagados.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pagados.click();
    await page.waitForTimeout(1000);
  }

  // Ampliar rango: 7 días puede dejar envíos afuera según cuándo se pagaron
  const range = page
    .getByText(/[uú]ltimos\s+\d+\s+d[ií]as|hoy|esta semana|este mes/i)
    .first();
  if (await range.isVisible({ timeout: 2500 }).catch(() => false)) {
    await range.click();
    const opt = page
      .getByRole('option', { name: /90\s*d[ií]as|30\s*d[ií]as|este a[nñ]o|todos/i })
      .or(page.locator('[role="option"], li, button').filter({ hasText: /90\s*d[ií]as|30\s*d[ií]as/i }))
      .first();
    if (await opt.isVisible({ timeout: 2500 }).catch(() => false)) {
      await opt.click();
      await page.waitForTimeout(1200);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    } else {
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  // Esperar filas / trackings
  await Promise.race([
    page.waitForSelector('table tbody tr', { timeout: 12_000 }),
    page.waitForSelector('[role="row"]', { timeout: 12_000 }),
    page.waitForFunction(
      () => /\b36\d{12,}\b/.test(document.body?.innerText || ''),
      { timeout: 12_000 },
    ),
  ]).catch(() => undefined);
  await page.waitForTimeout(800);
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
