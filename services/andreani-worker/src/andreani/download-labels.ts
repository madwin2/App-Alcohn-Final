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
  // String evaluate: tsx/esbuild inyecta __name en callbacks y rompe en el browser.
  return page.evaluate(`(() => {
    const TRACK_RE = /\\b(\\d{12,20})\\b/;
    const normalize = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const out = [];
    const seen = new Set();
    const pushRow = (row) => {
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

      const idx = (re) => headers.findIndex((h) => re.test(h));
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
        const linkText = normalize((tr.querySelector('a') && tr.querySelector('a').textContent) || '');
        const tracking =
          (trackCell.match(TRACK_RE) && trackCell.match(TRACK_RE)[1]) ||
          (linkText.match(TRACK_RE) && linkText.match(TRACK_RE)[1]) ||
          '';
        if (!tracking) continue;
        const opCell = iOp >= 0 ? cells[iOp] : '';
        pushRow({
          tracking,
          operacion: (opCell.match(/\\d{6,}/) && opCell.match(/\\d{6,}/)[0]) || null,
          destinatario: iDest >= 0 ? cells[iDest] || '' : '',
          destino: iDestino >= 0 ? cells[iDestino] || '' : '',
          fecha: iFecha >= 0 ? cells[iFecha] || '' : '',
          estado: (() => {
            const fromCell = iEstado >= 0 ? cells[iEstado] || '' : '';
            if (fromCell) return fromCell;
            const rowText = normalize(tr.innerText || '');
            if (/pendiente\\s*(de\\s*)?ingreso/i.test(rowText)) return 'Pendiente de ingreso';
            if (/en\\s+camino/i.test(rowText)) return 'En camino';
            if (/entregad/i.test(rowText)) return 'Entregado';
            return '';
          })(),
        });
      }
    }

    if (!out.length) {
      const grids = Array.from(document.querySelectorAll('[role="grid"], [role="table"]'));
      for (const grid of grids) {
        const rows = Array.from(grid.querySelectorAll('[role="row"]'));
        for (const row of rows) {
          const text = normalize(row.innerText || '');
          if (/^seguimiento/i.test(text)) continue;
          const tracking = (text.match(TRACK_RE) && text.match(TRACK_RE)[1]) || '';
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
            operacion:
              cells.map((c) => (c.match(/\\b(\\d{10,14})\\b/) || [])[1]).find(Boolean) || null,
            destinatario: dest,
            destino: '',
            fecha: cells.find((c) => /\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}/.test(c)) || '',
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
        const tracking = (raw.match(/^(\\d{12,20})$/) || [])[1];
        if (!tracking) continue;
        if (!(tracking.length >= 14 || tracking.startsWith('36'))) continue;
        const rowEl =
          el.closest('tr') ||
          el.closest('[role="row"]') ||
          (el.parentElement && el.parentElement.parentElement) ||
          el.parentElement;
        const rowText = normalize((rowEl && rowEl.innerText) || raw);
        const parts = rowText.split('\\n').map(normalize).filter(Boolean);
        pushRow({
          tracking,
          operacion:
            parts.map((p) => (p.match(/\\b(\\d{10,14})\\b/) || [])[1]).find((n) => n && n !== tracking) ||
            null,
          destinatario:
            parts.find(
              (p) =>
                p !== tracking &&
                !/^\\d+$/.test(p) &&
                !/\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}/.test(p) &&
                /[a-záéíóú]/i.test(p) &&
                p.length > 3 &&
                p.length < 80,
            ) || '',
          destino: '',
          fecha: parts.find((p) => /\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}/.test(p)) || '',
          estado: parts.find((p) => /pendiente|ingreso|en camino|entregado/i.test(p)) || '',
        });
      }
    }

    return out;
  })()`) as Promise<PortalShipment[]>;
}

type TablePagination = { from: number; to: number; total: number; pageSize: number };

async function readTablePagination(page: Page): Promise<TablePagination | null> {
  return page.evaluate(`(() => {
    const text = document.body.innerText || '';
    const m = text.match(/(\\d+)\\s*[-–]\\s*(\\d+)\\s+de\\s+(\\d+)/i);
    if (!m) return null;
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    const total = parseInt(m[3], 10);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(total)) return null;
    return { from, to, total, pageSize: Math.max(1, to - from + 1) };
  })()`) as Promise<TablePagination | null>;
}

async function goNextPage(page: Page): Promise<boolean> {
  const pagBefore = await readTablePagination(page);
  if (pagBefore && pagBefore.to >= pagBefore.total) {
    console.log(
      `[andreani] paginación ${pagBefore.from}-${pagBefore.to} de ${pagBefore.total} — fin`,
    );
    return false;
  }

  const before = (await scrapeCurrentPage(page)).map((r) => r.tracking).join('|');

  const candidates = [
    page.getByRole('button', { name: /next page|go to next page|p[aá]gina siguiente|siguiente/i }),
    page.locator('button[aria-label*="next page" i]'),
    page.locator('button[aria-label*="siguiente" i]'),
    page.locator('button[title*="next" i]'),
    page.locator('.MuiTablePagination-actions button').last(),
    page.locator('[class*="Pagination"] button').filter({ hasText: /^\s*>\s*$|›|»/ }).last(),
    page.locator('button').filter({ hasText: /^›$|^>\s*$|»/ }).last(),
  ];

  for (const loc of candidates) {
    const btn = loc.first();
    if (!(await btn.isVisible({ timeout: 800 }).catch(() => false))) continue;
    const disabled =
      (await btn.isDisabled().catch(() => false)) ||
      (await btn.getAttribute('disabled').catch(() => null)) != null ||
      (await btn.getAttribute('aria-disabled').catch(() => null)) === 'true';
    if (disabled) continue;
    await btn.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    const pagAfter = await readTablePagination(page);
    if (pagAfter && pagBefore && pagAfter.from > pagBefore.from) {
      console.log(
        `[andreani] paginación ${pagBefore.from}-${pagBefore.to} → ${pagAfter.from}-${pagAfter.to} de ${pagAfter.total}`,
      );
      return true;
    }
    const after = (await scrapeCurrentPage(page)).map((r) => r.tracking).join('|');
    if (after !== before && after.length > 0) return true;
  }

  // Fallback: clickear el número de página siguiente si hay botones 1,2,3…
  if (pagBefore) {
    const nextPageNum = Math.floor((pagBefore.to) / pagBefore.pageSize) + 1;
    const nextNum = page
      .getByRole('button', { name: new RegExp(`^\\s*${nextPageNum + 1}\\s*$`) })
      .or(page.locator(`button:text-is("${nextPageNum + 1}")`))
      .first();
    if (await nextNum.isVisible({ timeout: 800 }).catch(() => false)) {
      await nextNum.click({ force: true });
      await page.waitForTimeout(1500);
      const pagAfter = await readTablePagination(page);
      if (pagAfter && pagAfter.from > pagBefore.from) return true;
    }
  }

  const active = page
    .locator('button[aria-current="true"], button.Mui-selected, [aria-current="page"]')
    .first();
  if (await active.isVisible({ timeout: 500 }).catch(() => false)) {
    const cur = Number.parseInt(((await active.textContent()) || '').trim(), 10);
    if (Number.isFinite(cur) && cur > 0) {
      const nextNum = page
        .getByRole('button', { name: new RegExp(`^\\s*${cur + 1}\\s*$`) })
        .or(page.locator(`button:text-is("${cur + 1}")`))
        .first();
      if (await nextNum.isVisible({ timeout: 800 }).catch(() => false)) {
        await nextNum.click({ force: true });
        await page.waitForTimeout(1500);
        const after = (await scrapeCurrentPage(page)).map((r) => r.tracking).join('|');
        if (after !== before && after.length > 0) return true;
      }
    }
  }

  const pagFinal = await readTablePagination(page);
  console.warn(
    `[andreani] goNextPage=false (pag=${pagFinal ? `${pagFinal.from}-${pagFinal.to} de ${pagFinal.total}` : '?'})`,
  );
  return false;
}

/** Limpia búsqueda/modal que rompe la paginación tras imprimir etiquetas. */
async function restorePaidListView(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(300);

  const search = page
    .getByPlaceholder(/env[ií]o|operaci|destinatario|seguimiento/i)
    .or(page.locator('input[type="search"], input[placeholder*="envío" i], input[placeholder*="Envío" i]'))
    .first();
  if (await search.isVisible({ timeout: 800 }).catch(() => false)) {
    const val = await search.inputValue().catch(() => '');
    if (val.trim()) {
      await search.fill('');
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForTimeout(1000);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    }
  }
}

/** Fuerza el filtro de fechas a "Últimos 30 días" (nunca menos). */
async function ensureLast30DaysFilter(page: Page): Promise<string> {
  const rangeBtn = page
    .getByRole('button', { name: /[uú]ltimos\s+\d+\s+d[ií]as|hoy|esta semana|este mes|este a[nñ]o/i })
    .or(
      page
        .locator('button, [role="button"], div[role="combobox"]')
        .filter({ hasText: /[uú]ltimos\s+\d+\s+d[ií]as|hoy|esta semana|este mes/i }),
    )
    .first();

  const readLabel = async () => {
    if (await rangeBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      return ((await rangeBtn.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    }
    const loose = page.getByText(/[uú]ltimos\s+\d+\s+d[ií]as/i).first();
    return ((await loose.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  };

  let current = await readLabel();
  if (/[uú]ltimos\s*30\s*d[ií]as/i.test(current)) {
    console.log(`[andreani] filtro fechas OK: "${current}"`);
    return current;
  }

  console.log(`[andreani] filtro fechas actual="${current || '(vacío)'}" → forzando Últimos 30 días`);

  const clickTarget = (await rangeBtn.isVisible({ timeout: 1000 }).catch(() => false))
    ? rangeBtn
    : page.getByText(/[uú]ltimos\s+\d+\s+d[ií]as|hoy|esta semana|este mes/i).first();
  await clickTarget.click({ force: true });
  await page.waitForTimeout(500);

  // Click EXACTO en la opción "Últimos 30 días" (evitar 7/15 por selectores amplios).
  const clicked = await page.evaluate(`(() => {
    const wanted = /[uú]ltimos\\s*30\\s*d[ií]as/i;
    const nodes = Array.from(document.querySelectorAll('[role="option"], li, button, div, span'));
    for (const el of nodes) {
      const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!wanted.test(t)) continue;
      // Evitar nodos padre que contienen varias opciones.
      if (t.length > 40) continue;
      el.click();
      return t;
    }
    return null;
  })()`);

  if (!clicked) {
    await page.keyboard.press('Escape').catch(() => undefined);
    console.warn('[andreani] no se encontró opción exacta "Últimos 30 días"');
    return current;
  }

  await page.waitForTimeout(1200);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForSelector('table tbody tr, [role="row"]', { timeout: 12_000 }).catch(() => undefined);

  const after = await readLabel();
  if (!/[uú]ltimos\s*30\s*d[ií]as/i.test(after)) {
    console.warn(`[andreani] filtro quedó en "${after}" (se esperaba Últimos 30 días)`);
  } else {
    console.log(`[andreani] filtro fechas después: "${after}"`);
  }
  return after || String(clicked);
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

async function checkTracking(
  page: Page,
  tracking: string,
  opts?: { allowSearch?: boolean },
): Promise<boolean> {
  const allowSearch = opts?.allowSearch !== false;
  let row = page
    .locator('table tbody tr', { hasText: tracking })
    .or(page.locator('[role="row"]', { hasText: tracking }))
    .first();

  // Buscar en el portal filtra la grilla y rompe la paginación — solo si allowSearch.
  if (allowSearch && !(await row.isVisible({ timeout: 1500 }).catch(() => false))) {
    const search = page
      .getByPlaceholder(/env[ií]o|operaci|destinatario|seguimiento/i)
      .or(page.locator('input[type="search"], input[placeholder*="envío" i], input[placeholder*="Envío" i]'))
      .first();
    if (await search.isVisible({ timeout: 1200 }).catch(() => false)) {
      await search.click({ force: true }).catch(() => undefined);
      await search.fill('');
      await search.fill(tracking);
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForTimeout(1200);
    }
    row = page
      .locator('table tbody tr', { hasText: tracking })
      .or(page.locator('[role="row"]', { hasText: tracking }))
      .first();
  }

  if (!(await row.isVisible({ timeout: 4000 }).catch(() => false))) return false;

  const jsOk = await page.evaluate(`(tracking) => {
    const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
    for (const tr of rows) {
      if (!(tr.innerText || '').includes(tracking)) continue;
      const box = tr.querySelector('input[type="checkbox"]');
      if (!box) continue;
      if (!box.checked) {
        box.click();
        if (!box.checked) {
          box.checked = true;
          box.dispatchEvent(new Event('change', { bubbles: true }));
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return !!box.checked;
    }
    return false;
  }`, tracking);
  if (jsOk) return true;

  const box = row.locator('input[type="checkbox"]').first();
  if (await box.count().catch(() => 0)) {
    if (await box.isChecked().catch(() => false)) return true;
    try {
      await box.check({ force: true, timeout: 5000 });
    } catch {
      await box.click({ force: true }).catch(() => undefined);
    }
    if (await box.isChecked().catch(() => false)) return true;
  }
  await row.click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(200);
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
  for (let guard = 0; guard < 80; guard += 1) {
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

/** Pagados + Últimos 30 días + ir a la página N (1-based). */
export async function goToPaidShipmentsPage(
  page: Page,
  config: WorkerConfig,
  targetPage: number,
): Promise<void> {
  await goToPaidShipments(page, config);
  for (let i = 1; i < targetPage; i += 1) {
    if (!(await goNextPage(page))) {
      console.warn(`[andreani] no se pudo avanzar a página ${targetPage}, quedó en ${i}`);
      break;
    }
  }
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

  await ensureLast30DaysFilter(page);

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
  opts?: { allowSearch?: boolean },
): Promise<Buffer | null> {
  if (!trackings.length) return null;
  await uncheckVisible(page);
  const selected: string[] = [];
  for (const tracking of trackings) {
    if (await checkTracking(page, tracking, opts)) selected.push(tracking);
  }
  if (!selected.length) {
    // Último intento: marcar por JS según texto de la fila
    for (const tracking of trackings) {
      const ok = await page.evaluate(`(tracking) => {
        const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
        for (const tr of rows) {
          if (!(tr.innerText || '').includes(tracking)) continue;
          const box = tr.querySelector('input[type="checkbox"]');
          if (!box) continue;
          if (!box.checked) box.click();
          return !!box.checked;
        }
        return false;
      }`, tracking);
      if (ok) selected.push(tracking);
    }
  }
  if (!selected.length) return null;
  try {
    const pdf = await printZebraAndDownload(page, config.andreani.timeoutMs);
    await restorePaidListView(page);
    return pdf;
  } catch (error) {
    await restorePaidListView(page);
    await saveArtifacts(page, config.artifactsDir, 'print-zebra-error');
    throw error;
  }
}

export { scrapeCurrentPage, goNextPage, readTablePagination, restorePaidListView };
