/**
 * Reconstruye una etiqueta 100×152:
 * 1) extrae SOLO el bloque Andreani (sin el pie Alcohn viejo)
 * 2) lo dibuja arriba a ancho completo, escalado para dejar zona de pie
 * 3) redibuja el pie Pedido desde datos del pedido (limpio, sin solape)
 */
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Browser } from 'playwright';
import type { EnrichOrderInput } from './enrich-zebra.js';

const MM_TO_PT = 72 / 25.4;
export const LABEL_W_PT = 100 * MM_TO_PT;
export const LABEL_H_PT = 152 * MM_TO_PT;

/** Pie Alcohn ~16 mm + gap visible ~7 mm (stub libre) + margen inferior. */
const FOOTER_BAND_PT = 16 * MM_TO_PT;
const GAP_PT = 7 * MM_TO_PT;
const TOP_MARGIN_PT = 0.5 * MM_TO_PT;
const BOTTOM_SAFE_PT = 2.5 * MM_TO_PT;
/** Escala de raster: más alto = menos pixelado al reescalar. */
const RENDER_SCALE = 3.2;

export type RebuildMetrics = {
  andreaniBottomPct: number;
  gapPct: number;
  changed: boolean;
  reason: string;
};

function findAndreaniBottom(
  rowInk: number[],
  width: number,
  footerCutY: number | null,
): { top: number; bottom: number; gapPct: number } | null {
  const h = rowInk.length;
  const thr = Math.max(3, width * 0.008);
  let first = -1;
  let last = -1;
  for (let y = 0; y < h; y++) {
    if (rowInk[y] > thr) {
      if (first < 0) first = y;
      last = y;
    }
  }
  if (first < 0 || last < 0 || last - first < h * 0.25) return null;

  // Corte por texto del pie Alcohn — solo si está en el tercio inferior.
  let cut = last;
  if (
    footerCutY != null &&
    footerCutY >= h * 0.62 &&
    footerCutY > first + h * 0.35 &&
    footerCutY < last + 4
  ) {
    cut = Math.min(last, Math.max(first, footerCutY - 2));
  } else {
    const span = last - first + 1;
    type Cand = { start: number; end: number; len: number; footerFrac: number; posFrac: number };
    const cands: Cand[] = [];
    let run = -1;
    for (let y = first; y <= last + 1; y++) {
      const white = y > last || rowInk[y] <= thr;
      if (white) {
        if (run < 0) run = y;
      } else if (run >= 0) {
        const end = y - 1;
        const len = end - run + 1;
        const mid = (run + end) / 2;
        const posFrac = (mid - first) / span;
        const footerFrac = (last - (end + 1) + 1) / span;
        if (posFrac >= 0.62 && len >= Math.max(2, Math.floor(span * 0.006))) {
          cands.push({ start: run, end, len, footerFrac, posFrac });
        }
        run = -1;
      }
    }
    const good = cands
      .filter((c) => {
        if (c.footerFrac > 0.28) return false;
        if (c.len >= span * 0.1) return c.footerFrac >= 0.01;
        return c.footerFrac >= 0.02;
      })
      .sort((a, b) => b.posFrac - a.posFrac || b.len - a.len);
    if (good[0]) cut = good[0].start - 1;
  }

  // PDFs viejos: etiqueta chica arriba + hueco enorme + basura abajo.
  // Si dentro de [first, cut] hay un hueco blanco grande (>10%), quedarse con el bloque de arriba.
  {
    const span = Math.max(1, cut - first + 1);
    let run = -1;
    let best: { start: number; len: number } | null = null;
    for (let y = first; y <= cut + 1; y++) {
      const white = y > cut || rowInk[y] <= thr;
      if (white) {
        if (run < 0) run = y;
      } else if (run >= 0) {
        const len = y - run;
        const midFrac = ((run + y - 1) / 2 - first) / span;
        if (midFrac >= 0.25 && len >= span * 0.1) {
          if (!best || len > best.len) best = { start: run, len };
        }
        run = -1;
      }
    }
    // Solo huecos ENORMES (etiqueta chica arriba + vacío). No cortar gaps normales post-barcode.
    if (best && best.len >= span * 0.28) {
      cut = best.start - 1;
    }
  }

  while (cut > first && rowInk[cut] <= thr) cut--;

  // Quitar solo el zócalo muy ralo al final (no subir más del 18% inferior).
  const denseThr = Math.max(thr * 5, width * 0.035);
  const minKeep = first + Math.floor((cut - first) * 0.82);
  let tight = cut;
  while (tight > minKeep && rowInk[tight] < denseThr) tight--;
  cut = Math.min(cut, tight + 3);

  return {
    top: first,
    bottom: cut,
    gapPct: (100 * Math.max(0, last - cut)) / h,
  };
}

async function embedLogo(doc: PDFDocument, logoPath?: string): Promise<PDFImage | null> {
  if (!logoPath || !existsSync(logoPath)) return null;
  try {
    const bytes = await readFile(logoPath);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes);
    return doc.embedPng(bytes);
  } catch {
    return null;
  }
}

async function embedPreview(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const u8 = new Uint8Array(bytes);
    if (u8[0] === 0xff && u8[1] === 0xd8) return doc.embedJpg(bytes);
    return doc.embedPng(bytes);
  } catch {
    return null;
  }
}

async function extractAndreaniPng(
  pdfBytes: Uint8Array,
  browser: Browser,
): Promise<{ png: Buffer; topPct: number; bottomPct: number; gapPct: number } | null> {
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  try {
    const b64 = Buffer.from(pdfBytes).toString('base64');
    await page.setContent(
      `<!doctype html><canvas id="c"></canvas>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: u8 }).promise;
  const pg = await pdf.getPage(1);
  const scale = ${RENDER_SCALE};
  const vp = pg.getViewport({ scale });
  const canvas = document.getElementById('c');
  canvas.width = vp.width; canvas.height = vp.height;
  await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  // Detectar Y del pie Alcohn por texto (Pedido: / Andreani+tracking suelto).
  let footerCutY = null;
  try {
    const tc = await pg.getTextContent();
    for (const item of tc.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const isPedido = /^Pedido\\s*:/i.test(str);
      const isAndreaniJunk = /^Andreani\\s+\\d{10,}/i.test(str);
      if (!isPedido && !isAndreaniJunk) continue;
      const m = item.transform || [1,0,0,1,0,0];
      // Y PDF (origen abajo) → Y canvas (origen arriba).
      const yTop = vp.height - (m[5] * scale) - Math.max(8, (item.height || 8) * scale);
      if (footerCutY == null || yTop < footerCutY) footerCutY = Math.max(0, yTop - 6);
    }
  } catch (e) {
    console.warn('text-detect', e);
  }

  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width, maxX = 0;
  const rowInk = [];
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (data[o] < 245 || data[o+1] < 245 || data[o+2] < 245) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    rowInk.push(ink);
  }
  if (minX > maxX) { window.__out = null; window.__done = true; }
  else {
    minX = Math.max(0, minX - 2);
    maxX = Math.min(width - 1, maxX + 2);
    const cropW = maxX - minX + 1;
    const rowInk2 = [];
    for (let y = 0; y < height; y++) {
      let ink = 0;
      for (let x = minX; x <= maxX; x++) {
        const o = (y * width + x) * 4;
        if (data[o] < 245 || data[o+1] < 245 || data[o+2] < 245) ink++;
      }
      rowInk2.push(ink);
    }
    window.__rowInk = rowInk2;
    window.__w = cropW;
    window.__h = height;
    window.__minX = minX;
    window.__footerCutY = footerCutY;
    window.__done = true;
  }
</script>`,
      { waitUntil: 'load' },
    );
    await page.waitForFunction('window.__done === true', null, { timeout: 90000 });
    const meta = (await page.evaluate(
      '({ rowInk: window.__rowInk, w: window.__w, h: window.__h, minX: window.__minX, footerCutY: window.__footerCutY, out: window.__out })',
    )) as {
      rowInk?: number[];
      w?: number;
      h?: number;
      minX?: number;
      footerCutY?: number | null;
      out: null | undefined;
    };
    if (!meta.rowInk || meta.out === null || meta.w == null || meta.h == null) return null;

    const bounds = findAndreaniBottom(meta.rowInk, meta.w, meta.footerCutY ?? null);
    if (!bounds) return null;

    const pad = 2;
    const top = Math.max(0, bounds.top - pad);
    const bottom = Math.min(meta.h, bounds.bottom + pad + 1);
    const cropH = Math.max(1, bottom - top);
    const minX = meta.minX ?? 0;
    const cropW = meta.w;

    // Crop en el mismo contexto del browser (evita evaluate string + args de Playwright).
    const b64png = (await page.evaluate(`(() => {
      const minX = ${minX};
      const top = ${top};
      const cropW = ${cropW};
      const cropH = ${cropH};
      const canvas = document.getElementById('c');
      if (!canvas) return null;
      const c2 = document.createElement('canvas');
      c2.width = cropW;
      c2.height = cropH;
      const ctx = c2.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(canvas, minX, top, cropW, cropH, 0, 0, cropW, cropH);
      const url = c2.toDataURL('image/png');
      const parts = url.split(',');
      return parts[1] || null;
    })()`)) as string | null;

    if (!b64png) return null;

    return {
      png: Buffer.from(b64png, 'base64'),
      topPct: (100 * bounds.top) / meta.h,
      bottomPct: (100 * bounds.bottom) / meta.h,
      gapPct: bounds.gapPct,
    };
  } finally {
    await page.close();
  }
}

function drawFooterBand(
  page: PDFPage,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  footerY: number,
  bandH: number,
  order: EnrichOrderInput | undefined,
  tracking: string,
  alcohn: PDFImage | null,
  previews: PDFImage[],
): void {
  page.drawRectangle({
    x: 0,
    y: footerY,
    width: LABEL_W_PT,
    height: bandH,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  page.drawLine({
    start: { x: 4, y: footerY + bandH },
    end: { x: LABEL_W_PT - 4, y: footerY + bandH },
    thickness: 1.0,
    color: rgb(0.25, 0.25, 0.25),
  });

  const pad = 4;
  const leftColW = LABEL_W_PT * 0.16;
  const rightColW = LABEL_W_PT * 0.42;
  const centerX = leftColW + pad;
  const centerW = Math.max(40, LABEL_W_PT - leftColW - rightColW - pad * 2);
  const contentTop = footerY + bandH - pad;
  const imgMaxH = bandH - pad * 2;

  if (alcohn) {
    const ls = Math.min((leftColW - pad) / alcohn.width, imgMaxH / alcohn.height);
    const lw = alcohn.width * ls;
    const lh = alcohn.height * ls;
    page.drawImage(alcohn, {
      x: (leftColW - lw) / 2,
      y: contentTop - lh,
      width: lw,
      height: lh,
    });
  }

  const lines: string[] = [];
  if (order) {
    lines.push(`Pedido: ${order.id.replace(/-/g, '').slice(0, 14)}`);
    const fromCaption = (order.caption || '')
      .split(/\s*·\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const details =
      fromCaption.length > 0
        ? fromCaption
        : (() => {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const name of order.designNames) {
              const t = name.trim();
              if (!t) continue;
              const k = t.toLowerCase();
              if (seen.has(k)) continue;
              seen.add(k);
              out.push(t);
            }
            return out;
          })();
    for (const detail of details.slice(0, 3)) {
      lines.push(detail.length > 36 ? `${detail.slice(0, 33)}…` : detail);
    }
  } else {
    lines.push(`Andreani ${tracking}`);
  }

  const textSize = Math.max(7.5, Math.min(9, bandH * 0.28));
  const step = textSize + 1.5;
  let baseline = contentTop - textSize;
  for (const line of lines.slice(0, 4)) {
    page.drawText(line, {
      x: centerX,
      y: baseline,
      size: textSize,
      font,
      color: rgb(0.06, 0.06, 0.06),
      maxWidth: centerW,
    });
    baseline -= step;
    if (baseline < footerY + 2) break;
  }

  if (previews.length) {
    const gap = 3;
    const n = Math.min(3, previews.length);
    const slotW = Math.min(52, (rightColW - pad - gap * (n - 1)) / n);
    let px = LABEL_W_PT - rightColW + (rightColW - (n * slotW + (n - 1) * gap)) / 2;
    for (let i = 0; i < n; i++) {
      const img = previews[i];
      const sc = Math.min(slotW / img.width, imgMaxH / img.height);
      const dw = img.width * sc;
      const dh = img.height * sc;
      page.drawImage(img, {
        x: px + (slotW - dw) / 2,
        y: contentTop - dh,
        width: dw,
        height: dh,
      });
      px += slotW + gap;
    }
  }
}

/**
 * Etiqueta Andreani limpia arriba + pie Pedido nuevo abajo (sin solape).
 */
export async function rebuildCleanLabelPdf(
  pdfBytes: Uint8Array,
  tracking: string,
  order: EnrichOrderInput | undefined,
  opts?: { browser?: Browser; logoPath?: string },
): Promise<{ bytes: Uint8Array; metrics: RebuildMetrics }> {
  const { chromium } = await import('playwright');
  const owned = !opts?.browser;
  const browser = opts?.browser ?? (await chromium.launch({ headless: true }));

  try {
    const extracted = await extractAndreaniPng(pdfBytes, browser);
    if (!extracted) {
      return {
        bytes: pdfBytes,
        metrics: { andreaniBottomPct: 0, gapPct: 0, changed: false, reason: 'no-andreani' },
      };
    }

    const outDoc = await PDFDocument.create();
    const font = await outDoc.embedFont(StandardFonts.Helvetica);
    const andreaniImg = await outDoc.embedPng(extracted.png);
    const alcohn = await embedLogo(outDoc, opts?.logoPath);

    const previews: PDFImage[] = [];
    for (const urls of order?.imageUrls.slice(0, 3) ?? []) {
      for (const url of urls) {
        const img = await embedPreview(outDoc, url);
        if (img) {
          previews.push(img);
          break;
        }
      }
    }

    const page = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: LABEL_W_PT,
      height: LABEL_H_PT,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    const bandH = previews.length ? FOOTER_BAND_PT * 1.15 : FOOTER_BAND_PT;
    const reservedBelow = BOTTOM_SAFE_PT + bandH + GAP_PT;
    const availH = Math.max(40, LABEL_H_PT - TOP_MARGIN_PT - reservedBelow);

    // Ancho completo; si no entra en alto, achicar. Uniforme entre páginas.
    let scale = LABEL_W_PT / andreaniImg.width;
    let dw = LABEL_W_PT;
    let dh = andreaniImg.height * scale;
    if (dh > availH) {
      scale = availH / andreaniImg.height;
      dh = availH;
      dw = andreaniImg.width * scale;
    }
    const dx = (LABEL_W_PT - dw) / 2;
    const dy = LABEL_H_PT - TOP_MARGIN_PT - dh;

    page.drawImage(andreaniImg, { x: dx, y: dy, width: dw, height: dh });

    // Pie debajo de la etiqueta con gap fijo (mismo criterio en las 5).
    const footerY = Math.max(BOTTOM_SAFE_PT, dy - GAP_PT - bandH);
    drawFooterBand(page, font, footerY, bandH, order, tracking, alcohn, previews);

    return {
      bytes: await outDoc.save(),
      metrics: {
        andreaniBottomPct: +extracted.bottomPct.toFixed(1),
        gapPct: +extracted.gapPct.toFixed(1),
        changed: true,
        reason: 'rebuilt-clean',
      },
    };
  } finally {
    if (owned) await browser.close();
  }
}
