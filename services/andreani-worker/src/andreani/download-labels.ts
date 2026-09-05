import type { Page } from 'playwright';
import type { WorkerConfig } from '../config.js';
import { saveArtifacts } from '../browser-helpers.js';
import { indexOfPdfPageWithTracking, splitPdfPages } from '../pdf/enrich-zebra.js';

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

function tablePageIndex(pag: TablePagination): number {
  return Math.floor((pag.from - 1) / pag.pageSize) + 1;
}

async function clickTablePageNumber(page: Page, pageNum: number): Promise<boolean> {
  const pagBefore = await readTablePagination(page);
  const btn = page
    .getByRole('button', { name: new RegExp(`^\\s*${pageNum}\\s*$`) })
    .or(page.locator(`button:text-is("${pageNum}")`))
    .first();
  if (!(await btn.isVisible({ timeout: 800 }).catch(() => false))) return false;
  await btn.click({ force: true });
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  const pagAfter = await readTablePagination(page);
  if (pagAfter && pagBefore && pagAfter.from !== pagBefore.from) return true;
  return pagAfter ? tablePageIndex(pagAfter) === pageNum : false;
}

async function goPrevPage(page: Page): Promise<boolean> {
  const pagBefore = await readTablePagination(page);
  if (!pagBefore || pagBefore.from <= 1) return false;

  const before = (await scrapeCurrentPage(page)).map((r) => r.tracking).join('|');
  const candidates = [
    page.getByRole('button', { name: /previous page|go to previous page|p[aá]gina anterior|anterior/i }),
    page.locator('button[aria-label*="previous page" i]'),
    page.locator('button[aria-label*="anterior" i]'),
    page.locator('.MuiTablePagination-actions button').first(),
    page.locator('[class*="Pagination"] button').filter({ hasText: /^\s*<\s*$|‹|«/ }).first(),
    page.locator('button').filter({ hasText: /^‹$|^<\s*$|«/ }).first(),
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
    if (pagAfter && pagBefore && pagAfter.from < pagBefore.from) {
      console.log(
        `[andreani] paginación ${pagBefore.from}-${pagBefore.to} ← ${pagAfter.from}-${pagAfter.to} de ${pagAfter.total}`,
      );
      return true;
    }
    const after = (await scrapeCurrentPage(page)).map((r) => r.tracking).join('|');
    if (after !== before && after.length > 0) return true;
  }

  if (pagBefore) {
    const prevPageNum = tablePageIndex(pagBefore) - 1;
    if (prevPageNum >= 1 && (await clickTablePageNumber(page, prevPageNum))) return true;
  }

  return false;
}

/** Ir a página N usando solo los controles de la grilla (sin re-login). */
async function goToTablePage(page: Page, targetPage: number): Promise<boolean> {
  if (targetPage < 1) return false;

  let pag = await readTablePagination(page);
  if (!pag) {
    console.warn('[andreani] goToTablePage: sin paginación visible');
    return false;
  }

  let cur = tablePageIndex(pag);
  if (cur === targetPage) return true;

  if (await clickTablePageNumber(page, targetPage)) {
    console.log(`[andreani] goToTablePage ${cur} → ${targetPage} (número directo)`);
    return true;
  }

  if (targetPage < cur && (await clickTablePageNumber(page, 1))) {
    pag = await readTablePagination(page);
    cur = pag ? tablePageIndex(pag) : 1;
  }

  for (let guard = 0; guard < 80; guard += 1) {
    pag = await readTablePagination(page);
    if (!pag) return false;
    cur = tablePageIndex(pag);
    if (cur === targetPage) return true;
    if (cur < targetPage) {
      if (!(await goNextPage(page))) break;
    } else if (!(await goPrevPage(page))) break;
  }

  pag = await readTablePagination(page);
  const ok = pag ? tablePageIndex(pag) === targetPage : false;
  if (!ok) console.warn(`[andreani] goToTablePage: no se llegó a página ${targetPage}`);
  return ok;
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

/** True si la grilla Pagados ya tiene filas / paginación con total. */
async function hasShipmentRows(page: Page): Promise<boolean> {
  const pag = await readTablePagination(page);
  if (pag && pag.total > 0) return true;
  const rows = await scrapeCurrentPage(page);
  return rows.length > 0;
}

async function clickPagadosTab(page: Page): Promise<void> {
  const pagados = page
    .getByRole('tab', { name: /^pagados$/i })
    .or(page.getByRole('button', { name: /^pagados$/i }))
    .or(page.locator('[role="tab"], button, a').filter({ hasText: /^pagados$/i }))
    .first();
  if (await pagados.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pagados.click();
    await page.waitForTimeout(1000);
  }
}

async function waitForShipmentRows(page: Page, timeoutMs = 12_000): Promise<void> {
  await Promise.race([
    page.waitForSelector('table tbody tr', { timeout: timeoutMs }),
    page.waitForSelector('[role="row"]', { timeout: timeoutMs }),
    page.waitForFunction(
      () => /\b36\d{12,}\b/.test(document.body?.innerText || ''),
      { timeout: timeoutMs },
    ),
    page.waitForFunction(
      () => /(\d+)\s*[-–]\s*(\d+)\s+de\s+(\d+)/i.test(document.body?.innerText || ''),
      { timeout: timeoutMs },
    ),
  ]).catch(() => undefined);
  await page.waitForTimeout(800);
}

/**
 * A veces al pasar de "Últimos 7" → "30 días" el portal queda en vacío
 * ("No encontramos resultados") aunque haya envíos. Recuperar sin perder el rango.
 */
async function recoverEmptyPaidList(page: Page, config: WorkerConfig): Promise<void> {
  console.warn('[andreani] grilla Pagados vacía — recuperando filtros…');

  const clearBtn = page.getByRole('button', { name: /limpiar filtros/i }).first();
  if (await clearBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
    await clearBtn.click();
    await page.waitForTimeout(1500);
  }

  await restorePaidListView(page);
  await clickPagadosTab(page);
  await ensureLast30DaysFilter(page);
  await waitForShipmentRows(page, Math.min(config.andreani.timeoutMs, 15_000));

  if (await hasShipmentRows(page)) return;

  console.warn('[andreani] grilla sigue vacía — reload /ver-envios…');
  await page.goto('https://pymes.andreani.com/ver-envios', {
    waitUntil: 'domcontentloaded',
    timeout: config.andreani.timeoutMs,
  });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await clickPagadosTab(page);
  await ensureLast30DaysFilter(page);
  await waitForShipmentRows(page, Math.min(config.andreani.timeoutMs, 15_000));
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

  // El portal a veces pinta vacío unos segundos al cambiar el rango.
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await waitForShipmentRows(page, 12_000);

  const after = await readLabel();
  if (!/[uú]ltimos\s*30\s*d[ií]as/i.test(after)) {
    console.warn(`[andreani] filtro quedó en "${after}" (se esperaba Últimos 30 días)`);
  } else {
    console.log(`[andreani] filtro fechas después: "${after}"`);
  }
  return after || String(clicked);
}

/** Destilda TODOS los checkboxes del DOM (también filas ocultas por búsqueda). */
async function uncheckVisible(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    for (const box of boxes) {
      if (box.disabled) continue;
      if (box.checked) {
        box.click();
        if (box.checked) {
          box.checked = false;
          box.dispatchEvent(new Event('change', { bubbles: true }));
          box.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  })()`);
  await page.waitForTimeout(200);
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

  await row.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(200);

  // OJO: page.evaluate con string debe ser un IIFE. Un string tipo
  // "(arg) => {...}" se evalúa como expresión → devuelve una función → undefined.
  const jsOk = await page.evaluate(`(() => {
    const tracking = ${JSON.stringify(tracking)};
    const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
    for (const tr of rows) {
      if ((tr.innerText || '').indexOf(tracking) === -1) continue;
      const box = tr.querySelector('input[type="checkbox"]');
      if (!box) continue;
      if (!box.checked) box.click();
      return !!box.checked;
    }
    return false;
  })()`);
  if (jsOk) return true;

  // MUI esconde el input (opacity 0); el área clickeable es el span contenedor.
  const muiBox = row.locator('.MuiCheckbox-root, span[class*="Checkbox"]').first();
  if (await muiBox.count().catch(() => 0)) {
    await muiBox.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(300);
    if (await isTrackingChecked(page, tracking)) return true;
  }

  const box = row.locator('input[type="checkbox"]').first();
  if (await box.count().catch(() => 0)) {
    if (await box.isChecked().catch(() => false)) return true;
    try {
      await box.check({ force: true, timeout: 5000 });
    } catch {
      await box.click({ force: true }).catch(() => undefined);
    }
    if (await isTrackingChecked(page, tracking)) return true;
  }

  await row.locator('td').first().click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(300);
  return isTrackingChecked(page, tracking);
}

/** Lee del DOM si la fila del tracking quedó tildada. */
async function isTrackingChecked(page: Page, tracking: string): Promise<boolean> {
  const checked = await page.evaluate(`(() => {
    const tracking = ${JSON.stringify(tracking)};
    const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
    for (const tr of rows) {
      if ((tr.innerText || '').indexOf(tracking) === -1) continue;
      const box = tr.querySelector('input[type="checkbox"]');
      return !!(box && box.checked);
    }
    return false;
  })()`);
  return checked === true;
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

/** Restaura la grilla Pagados sin re-login (evita clickHistory que rompe sesión). */
async function ensurePaidShipmentsGrid(
  page: Page,
  config: WorkerConfig,
): Promise<boolean> {
  await restorePaidListView(page);
  if (await readTablePagination(page)) return true;

  const url = page.url();
  if (!url.includes('ver-envios')) {
    console.log('[andreani] restaurando grilla → /ver-envios');
    await page.goto('https://pymes.andreani.com/ver-envios', {
      waitUntil: 'domcontentloaded',
      timeout: config.andreani.timeoutMs,
    });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
  }

  const pagados = page
    .getByRole('tab', { name: /^pagados$/i })
    .or(page.getByRole('button', { name: /^pagados$/i }))
    .or(page.locator('[role="tab"], button, a').filter({ hasText: /^pagados$/i }))
    .first();
  if (await pagados.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pagados.click();
    await page.waitForTimeout(800);
  }

  await ensureLast30DaysFilter(page);
  await waitForShipmentRows(page, 12_000);

  const ok = !!(await readTablePagination(page)) || (await hasShipmentRows(page));
  if (!ok) console.warn('[andreani] ensurePaidShipmentsGrid: grilla sin paginación');
  return ok;
}

/** Ir a página N: restaura grilla si hace falta y usa paginación. */
async function goToPaidTablePage(
  page: Page,
  config: WorkerConfig,
  targetPage: number,
): Promise<boolean> {
  await ensurePaidShipmentsGrid(page, config);
  const ok = await goToTablePage(page, targetPage);
  if (ok) {
    await page.waitForSelector('table tbody tr, [role="row"]', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  return ok;
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

  await clickPagadosTab(page);
  await ensureLast30DaysFilter(page);
  await waitForShipmentRows(page, 12_000);

  // Race: al cambiar a 30 días el portal a veces deja "sin resultados" aunque haya envíos.
  if (!(await hasShipmentRows(page))) {
    await page.waitForTimeout(3000);
    await waitForShipmentRows(page, 10_000);
  }
  if (!(await hasShipmentRows(page))) {
    await recoverEmptyPaidList(page, config);
  }

  if (!(await hasShipmentRows(page))) {
    console.warn('[andreani] goToPaidShipments: grilla vacía tras reintentos');
  }
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
    for (const tracking of trackings) {
      if (await isTrackingChecked(page, tracking)) selected.push(tracking);
    }
  }
  if (!selected.length) {
    console.warn(
      `[andreani] no se pudo marcar ningún tracking en la grilla: ${trackings.join(', ')}`,
    );
    return null;
  }
  console.log(`[andreani] imprimiendo ${selected.length} etiqueta(s): ${selected.join(', ')}`);
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

/** Diagnóstico: qué ve el scraper en la grilla actual. */
async function describeGrid(page: Page, tracking: string): Promise<string> {
  const result = (await page.evaluate(`(() => {
    const tracking = ${JSON.stringify(tracking)};
    const rows = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
    const tracks = [];
    let rowFound = false;
    let boxes = 0;
    let boxDisabled = false;
    let rowHtml = '';
    for (const tr of rows) {
      const text = (tr.innerText || '').replace(/\\s+/g, ' ');
      const m = text.match(/(36\\d{12,})/);
      if (m) tracks.push(m[1]);
      if (text.indexOf(tracking) !== -1) {
        rowFound = true;
        const found = tr.querySelectorAll('input[type="checkbox"]');
        boxes = found.length;
        boxDisabled = found.length > 0 && !!found[0].disabled;
        rowHtml = (tr.outerHTML || '').slice(0, 600);
      }
    }
    const headerBoxes = document.querySelectorAll('thead input[type="checkbox"]').length;
    return {
      rows: rows.length,
      tracks: tracks,
      rowFound: rowFound,
      boxes: boxes,
      boxDisabled: boxDisabled,
      headerBoxes: headerBoxes,
      rowHtml: rowHtml,
    };
  })()`)) as {
    rows: number;
    tracks: string[];
    rowFound: boolean;
    boxes: number;
    boxDisabled: boolean;
    headerBoxes: number;
    rowHtml: string;
  } | null;

  if (!result) return '(evaluate devolvió null)';
  return [
    `filas=${result.rows}`,
    `trackings=[${result.tracks.join(',')}]`,
    `fila=${result.rowFound}`,
    `checkboxes=${result.boxes}`,
    `disabled=${result.boxDisabled}`,
    `headerCheckbox=${result.headerBoxes}`,
    `html=${result.rowHtml}`,
  ].join(' ');
}

/** Filtra la grilla por un tracking usando el buscador del portal. */
async function searchTracking(page: Page, tracking: string): Promise<boolean> {
  const search = page
    .getByPlaceholder(/env[ií]o|operaci|destinatario|seguimiento/i)
    .or(page.locator('input[type="search"], input[placeholder*="envío" i], input[placeholder*="Envío" i]'))
    .first();

  if (!(await search.isVisible({ timeout: 2000 }).catch(() => false))) {
    console.warn('[andreani] no se encontró el buscador de la grilla');
    return false;
  }

  await search.click({ force: true }).catch(() => undefined);
  await search.fill('');
  await page.waitForTimeout(300);
  await search.fill(tracking);
  await page.keyboard.press('Enter').catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);

  const row = page
    .locator('table tbody tr', { hasText: tracking })
    .or(page.locator('[role="row"]', { hasText: tracking }))
    .first();
  return row.isVisible({ timeout: 8000 }).catch(() => false);
}

/**
 * Descarga la etiqueta Zebra de UN tracking usando el buscador del portal.
 * No depende de la paginación (que se rompe al imprimir).
 */
export async function downloadLabelByTracking(
  page: Page,
  config: WorkerConfig,
  tracking: string,
): Promise<Buffer | null> {
  await ensurePaidShipmentsGrid(page, config);

  // Importante: destildar en la grilla completa ANTES de filtrar por búsqueda.
  // Si no, quedan checkboxes ocultos tildados y el PDF sale multi-hoja cruzado.
  await restorePaidListView(page);
  await uncheckVisible(page);

  if (!(await searchTracking(page, tracking))) {
    console.warn(`[andreani] ${tracking}: no apareció en la búsqueda del portal`);
    await restorePaidListView(page);
    return null;
  }

  await uncheckVisible(page);

  if (!(await checkTracking(page, tracking, { allowSearch: false }))) {
    const info = await describeGrid(page, tracking).catch(() => '(sin info)');
    console.warn(`[andreani] ${tracking}: no se pudo marcar el checkbox — ${info}`);
    await restorePaidListView(page);
    return null;
  }

  const checkedCount = await page.evaluate(`(() => {
    return Array.from(document.querySelectorAll('input[type="checkbox"]')).filter((b) => b.checked && !b.disabled).length;
  })()`);
  if (typeof checkedCount === 'number' && checkedCount > 1) {
    console.warn(
      `[andreani] ${tracking}: ${checkedCount} checkboxes tildados — se reintenta destildar y marcar solo este`,
    );
    await uncheckVisible(page);
    if (!(await checkTracking(page, tracking, { allowSearch: false }))) {
      await restorePaidListView(page);
      return null;
    }
  }

  console.log(`[andreani] imprimiendo etiqueta ${tracking}`);
  try {
    const pdf = await printZebraAndDownload(page, config.andreani.timeoutMs);
    await restorePaidListView(page);
    await uncheckVisible(page);

    // Si el portal mandó varias hojas o la hoja equivocada, no devolver basura.
    const pages = await splitPdfPages(new Uint8Array(pdf));
    const idx = indexOfPdfPageWithTracking(pages, tracking);
    if (idx < 0) {
      console.warn(
        `[andreani] ${tracking}: PDF descargado (${pages.length} hoja(s)) no contiene ese tracking — descartado`,
      );
      return null;
    }
    if (pages.length === 1) return pdf;
    console.warn(
      `[andreani] ${tracking}: PDF tenía ${pages.length} hojas; se usa la hoja ${idx + 1} que contiene el tracking`,
    );
    return Buffer.from(pages[idx]);
  } catch (error) {
    await restorePaidListView(page);
    await saveArtifacts(page, config.artifactsDir, 'print-zebra-error').catch(() => undefined);
    throw error;
  }
}

export {
  scrapeCurrentPage,
  goNextPage,
  readTablePagination,
  restorePaidListView,
  goToTablePage,
  ensurePaidShipmentsGrid,
  goToPaidTablePage,
  describeGrid,
};
