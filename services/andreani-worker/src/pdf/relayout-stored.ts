/**
 * Reescribe una etiqueta 100×152 ya guardada:
 * - detecta bloque Andreani (arriba) y pie Alcohn (abajo) por tinta
 * - vuelve a armar: etiqueta arriba + pie pegado debajo, sin hueco ni solape
 * - escala a ANCHO completo de la térmica (corrige etiquetas achicadas a la izquierda)
 */
import { PDFDocument, rgb } from 'pdf-lib';
import type { Browser } from 'playwright';

const MM_TO_PT = 72 / 25.4;
export const LABEL_W_PT = 100 * MM_TO_PT;
export const LABEL_H_PT = 152 * MM_TO_PT;
const TOP_MARGIN_PT = MM_TO_PT * 0.6;
const BOTTOM_SAFE_PT = MM_TO_PT * 2.0;
const GAP_PT = MM_TO_PT * 1.5;

export type RelayoutMetrics = {
  firstInkPct: number;
  gapPct: number;
  labelBottomPct: number;
  footerTopPct: number;
  changed: boolean;
  reason: string;
};

type Split = {
  labelTop: number;
  labelBottom: number;
  footerTop: number;
  footerBottom: number;
  gapRows: number;
};

/** Separa Andreani (arriba) del pie. Porcentajes relativos al bloque con tinta. */
export function splitLabelAndFooter(rowInk: number[], width: number): Split | null {
  const h = rowInk.length;
  const thr = Math.max(3, width * 0.008);
  let first = -1;
  let last = -1;
  for (let y = 0; y < h; y += 1) {
    if (rowInk[y] > thr) {
      if (first < 0) first = y;
      last = y;
    }
  }
  if (first < 0 || last < 0 || last - first < h * 0.2) return null;

  const span = last - first + 1;
  type Cand = { len: number; start: number; end: number; footerFrac: number; posFrac: number };
  const candidates: Cand[] = [];
  let runStart = -1;
  for (let y = first; y <= last + 1; y += 1) {
    const white = y > last || rowInk[y] <= thr;
    if (white) {
      if (runStart < 0) runStart = y;
    } else if (runStart >= 0) {
      const end = y - 1;
      const len = end - runStart + 1;
      const mid = (runStart + end) / 2;
      const posFrac = (mid - first) / span;
      const footerTop = end + 1;
      const footerFrac = (last - footerTop + 1) / span;
      // Hueco en la mitad inferior del contenido (no de la hoja completa).
      // Si el hueco es enorme (>20% del contenido), aceptar pie chico (1 línea).
      const minFooter = len >= span * 0.2 ? 0.008 : 0.03;
      if (posFrac >= 0.45 && posFrac <= 0.98 && len >= Math.max(2, Math.floor(span * 0.01))) {
        if (footerFrac >= minFooter && footerFrac <= 0.45) {
          candidates.push({ len, start: runStart, end, footerFrac, posFrac });
        }
      }
      runStart = -1;
    }
  }

  const good = candidates
    .filter((c) => c.footerFrac <= 0.45)
    .sort((a, b) => b.posFrac - a.posFrac || b.len - a.len);

  let best = good[0] ?? null;

  let labelBottom: number;
  let footerTop: number;
  let gapRows: number;

  if (best) {
    labelBottom = best.start - 1;
    while (labelBottom > first && rowInk[labelBottom] <= thr) labelBottom -= 1;
    footerTop = best.end + 1;
    while (footerTop < last && rowInk[footerTop] <= thr) footerTop += 1;
    gapRows = best.len;
  } else {
    footerTop = first + Math.floor(span * 0.88);
    while (footerTop < last && rowInk[footerTop] <= thr) footerTop += 1;
    labelBottom = footerTop - 1;
    while (labelBottom > first && rowInk[labelBottom] <= thr) labelBottom -= 1;
    gapRows = Math.max(0, footerTop - labelBottom - 1);
  }

  const footerBottom = last;
  const footerH = footerBottom - footerTop + 1;
  const labelH = labelBottom - first + 1;
  if (footerH < span * 0.008 || footerH > span * 0.45) return null;
  if (labelH < span * 0.3) return null;

  return {
    labelTop: first,
    labelBottom,
    footerTop,
    footerBottom,
    gapRows,
  };
}

const BROWSER_SPLIT_JS = `
function splitLabelAndFooter(rowInk, width, height) {
  const thr = Math.max(3, width * 0.008);
  let first = -1, last = -1;
  for (let y = 0; y < height; y++) {
    if (rowInk[y] > thr) { if (first < 0) first = y; last = y; }
  }
  if (first < 0 || last < 0 || last - first < height * 0.2) return null;
  const span = last - first + 1;
  const candidates = [];
  let runStart = -1;
  for (let y = first; y <= last + 1; y++) {
    const white = y > last || rowInk[y] <= thr;
    if (white) { if (runStart < 0) runStart = y; }
    else if (runStart >= 0) {
      const end = y - 1;
      const len = end - runStart + 1;
      const mid = (runStart + end) / 2;
      const posFrac = (mid - first) / span;
      const footerTop = end + 1;
      const footerFrac = (last - footerTop + 1) / span;
      const minFooter = len >= span * 0.2 ? 0.008 : 0.03;
      if (posFrac >= 0.45 && posFrac <= 0.98 && len >= Math.max(2, Math.floor(span * 0.01))) {
        if (footerFrac >= minFooter && footerFrac <= 0.45) {
          candidates.push({ len, start: runStart, end, footerFrac, posFrac });
        }
      }
      runStart = -1;
    }
  }
  let good = candidates.filter(c => c.footerFrac <= 0.45)
    .sort((a,b) => b.posFrac - a.posFrac || b.len - a.len);
  let best = good[0] || null;
  let labelBottom, footerTop, gapRows;
  if (best) {
    labelBottom = best.start - 1;
    while (labelBottom > first && rowInk[labelBottom] <= thr) labelBottom--;
    footerTop = best.end + 1;
    while (footerTop < last && rowInk[footerTop] <= thr) footerTop++;
    gapRows = best.len;
  } else {
    footerTop = first + Math.floor(span * 0.88);
    while (footerTop < last && rowInk[footerTop] <= thr) footerTop++;
    labelBottom = footerTop - 1;
    while (labelBottom > first && rowInk[labelBottom] <= thr) labelBottom--;
    gapRows = Math.max(0, footerTop - labelBottom - 1);
  }
  const footerBottom = last;
  const footerH = footerBottom - footerTop + 1;
  const labelH = labelBottom - first + 1;
  if (footerH < span * 0.008 || footerH > span * 0.45) return null;
  if (labelH < span * 0.3) return null;
  return { labelTop: first, labelBottom, footerTop, footerBottom, gapRows };
}
`;

type RasterSplit = {
  width: number;
  height: number;
  labelPng: Buffer;
  footerPng: Buffer;
  split: Split;
};

async function rasterizeAndCrop(
  pdfBytes: Uint8Array,
  browser: Browser,
  pageIndex = 0,
  scale = 2.2,
): Promise<RasterSplit | null> {
  const page = await browser.newPage({ viewport: { width: 800, height: 1200 } });
  try {
    const b64 = Buffer.from(pdfBytes).toString('base64');
    await page.setContent(
      `<!doctype html><canvas id="c"></canvas>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  ${BROWSER_SPLIT_JS}
  const raw = atob('${b64}');
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: u8 }).promise;
  const pg = await pdf.getPage(${pageIndex + 1});
  const vp = pg.getViewport({ scale: ${scale} });
  const canvas = document.getElementById('c');
  canvas.width = vp.width; canvas.height = vp.height;
  await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const thr = Math.max(3, width * 0.008);
  const rowInk = [];
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (data[o] < 245 || data[o+1] < 245 || data[o+2] < 245) ink++;
    }
    rowInk.push(ink);
  }
  // También bbox horizontal: recortar márgenes laterales vacíos antes del split visual.
  let minX = width, maxX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (data[o] < 245 || data[o+1] < 245 || data[o+2] < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (minX > maxX) { window.__result = null; window.__done = true; }
  else {
    const padX = 2;
    minX = Math.max(0, minX - padX);
    maxX = Math.min(width - 1, maxX + padX);
    const cropW = maxX - minX + 1;
    // Recomputar rowInk solo en la franja con contenido (mejor umbral).
    const rowInk2 = [];
    for (let y = 0; y < height; y++) {
      let ink = 0;
      for (let x = minX; x <= maxX; x++) {
        const o = (y * width + x) * 4;
        if (data[o] < 245 || data[o+1] < 245 || data[o+2] < 245) ink++;
      }
      rowInk2.push(ink);
    }
    const split = splitLabelAndFooter(rowInk2, cropW, height);
    if (!split) {
      window.__result = null;
      window.__done = true;
    } else {
      const pad = 2;
      const crop = (y0, y1) => {
        const top = Math.max(0, y0 - pad);
        const bottom = Math.min(height, y1 + pad + 1);
        const h = Math.max(1, bottom - top);
        const c2 = document.createElement('canvas');
        c2.width = cropW; c2.height = h;
        c2.getContext('2d').drawImage(canvas, minX, top, cropW, h, 0, 0, cropW, h);
        return c2.toDataURL('image/png').split(',')[1];
      };
      window.__result = {
        width: cropW, height, split, minX, maxX,
        labelB64: crop(split.labelTop, split.labelBottom),
        footerB64: crop(split.footerTop, split.footerBottom),
      };
      window.__done = true;
    }
  }
</script>`,
      { waitUntil: 'networkidle' },
    );
    await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
    const result = await page.evaluate('window.__result');
    if (!result) return null;
    const r = result as {
      width: number;
      height: number;
      split: Split;
      labelB64: string;
      footerB64: string;
    };
    return {
      width: r.width,
      height: r.height,
      split: r.split,
      labelPng: Buffer.from(r.labelB64, 'base64'),
      footerPng: Buffer.from(r.footerB64, 'base64'),
    };
  } finally {
    await page.close();
  }
}

export async function relayoutStoredLabelPdf(
  pdfBytes: Uint8Array,
  opts?: { force?: boolean; browser?: Browser },
): Promise<{ bytes: Uint8Array; metrics: RelayoutMetrics }> {
  const force = opts?.force ?? true;
  const { chromium } = await import('playwright');
  const owned = !opts?.browser;
  const browser = opts?.browser ?? (await chromium.launch({ headless: true }));

  try {
    const raster = await rasterizeAndCrop(pdfBytes, browser);
    if (!raster) {
      return {
        bytes: pdfBytes,
        metrics: {
          firstInkPct: 0,
          gapPct: 0,
          labelBottomPct: 0,
          footerTopPct: 0,
          changed: false,
          reason: 'no-split',
        },
      };
    }

    const { split } = raster;
    const gapPct = (100 * split.gapRows) / raster.height;
    const firstInkPct = (100 * split.labelTop) / raster.height;
    const metricsBase = {
      firstInkPct: +firstInkPct.toFixed(1),
      gapPct: +gapPct.toFixed(1),
      labelBottomPct: +((100 * split.labelBottom) / raster.height).toFixed(1),
      footerTopPct: +((100 * split.footerTop) / raster.height).toFixed(1),
    };

    const needsFix = gapPct > 6 || firstInkPct > 5 || split.footerTop / raster.height < 0.7;
    if (!needsFix && !force) {
      return {
        bytes: pdfBytes,
        metrics: { ...metricsBase, changed: false, reason: 'already-ok' },
      };
    }

    const outDoc = await PDFDocument.create();
    const labelImg = await outDoc.embedPng(raster.labelPng);
    const footerImg = await outDoc.embedPng(raster.footerPng);
    const page = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);

    const footerMaxH = LABEL_H_PT * 0.18;
    const footerScale = Math.min(LABEL_W_PT / footerImg.width, footerMaxH / footerImg.height);
    const footerW = footerImg.width * footerScale;
    const footerH = footerImg.height * footerScale;
    const footerX = (LABEL_W_PT - footerW) / 2;

    const reservedBottom = BOTTOM_SAFE_PT + footerH + GAP_PT;
    const availH = Math.max(40, LABEL_H_PT - TOP_MARGIN_PT - reservedBottom);

    // Llenar ANCHO de la térmica (corrige etiquetas al 40% izquierda).
    let labelScale = LABEL_W_PT / labelImg.width;
    let labelW = LABEL_W_PT;
    let labelH = labelImg.height * labelScale;
    if (labelH > availH) {
      labelScale = availH / labelImg.height;
      labelH = availH;
      labelW = labelImg.width * labelScale;
    }
    const labelX = (LABEL_W_PT - labelW) / 2;
    const labelTopY = LABEL_H_PT - TOP_MARGIN_PT - labelH;
    const footerY = Math.max(BOTTOM_SAFE_PT, labelTopY - GAP_PT - footerH);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: LABEL_W_PT,
      height: LABEL_H_PT,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
    page.drawImage(labelImg, { x: labelX, y: labelTopY, width: labelW, height: labelH });
    page.drawImage(footerImg, { x: footerX, y: footerY, width: footerW, height: footerH });

    return {
      bytes: await outDoc.save(),
      metrics: {
        ...metricsBase,
        changed: true,
        reason: needsFix ? 'fixed-gap' : 'forced-tighten',
      },
    };
  } finally {
    if (owned) await browser.close();
  }
}
