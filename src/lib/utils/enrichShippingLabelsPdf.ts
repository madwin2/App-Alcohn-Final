import { PDFDocument, StandardFonts, rgb, type PDFImage } from 'pdf-lib';
import { getDocument, Util } from 'pdfjs-dist';
import type { PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import type { Order, OrderItem } from '@/lib/types';
import { listTrackingNumbersByPage } from '@/lib/utils/trackingPdfParser';

/**
 * Etiqueta **100 mm × 152 mm**.
 * - Del PDF MiCorreo (A4 apaisado) solo se **elimina la franja superior** (logo Correo + PAQ.AR CLASICO).
 * - Se recortan márgenes blancos del A4.
 * - Logos Alcohn / cliente y texto del pedido van **dentro del rectángulo inferior** de la tarjeta (sobre la imagen).
 */
const MM_TO_PT = 72 / 25.4;
const LABEL_W_MM = 100;
const LABEL_H_MM = 152;
const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;

/** Fracción de la **altura de la etiqueta dibujada** reservada al rectángulo inferior (pedido + logos). */
const FOOTER_FRAC_OF_LABEL = 0.21;
const RENDER_SCALE = 2.75;
const HEADER_CROP_MARGIN_PX = 16;
const MAX_HEADER_CROP_FRAC = 0.26;
/** Umbral para recorte de márgenes A4 (más alto = más agresivo, menos “gris” como tinta). */
const TRIM_WHITE_THRESHOLD = 252;
const TRIM_PADDING_PX = 4;
/** Si el recorte por texto casi no avanza, se recorta este % extra del alto ya aislado (franja PAQ en imagen). */
const POST_TRIM_HEADER_FRAC_WEAK = 0.052;
const POST_TRIM_HEADER_MAX_PX = 105;
const WEAK_TEXT_CROP_PX = 14;
const POST_TRIM_BOTTOM_CROP_PX = 86;
const LABEL_BOUNDS_PAD_X = 28;
const LABEL_BOUNDS_PAD_Y_TOP = 30;
const LABEL_BOUNDS_PAD_Y_BOTTOM = 58;
const LABEL_ASPECT_W_OVER_H = LABEL_W_MM / LABEL_H_MM;
const FIT_ZOOM = 1.07;
const TOP_PRINT_MARGIN_PT = MM_TO_PT * 13.2; // margen superior extra para evitar corte
const HORIZONTAL_NUDGE_PT = MM_TO_PT * 1.2; // pequeño corrimiento a la derecha

const itemTypeShortLabel = (item: OrderItem): string | null => {
  switch (item.itemType) {
    case 'MANGO_GOLPE':
      return '+ mango de golpe';
    case 'SOLDADOR':
      return '+ soldador';
    case 'BASE_REMACHADORA':
      return '+ base remachadora';
    case 'ABECEDARIO':
      return 'abecedario';
    case 'SELLO':
      return item.designName?.trim() ? item.designName.trim().slice(0, 48) : 'sello';
    default:
      return null;
  }
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const buildFooterContent = (order: Order): { imageCandidates: string[][]; caption: string } => {
  const imageCandidates: string[][] = [];
  const captionBits: string[] = [];

  for (const item of order.items) {
    const rawUrls = [item.files?.baseUrl, item.files?.vectorPreviewUrl];
    const candidates = rawUrls.filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
    );
    if (candidates.length > 0) imageCandidates.push(candidates);

    const t = itemTypeShortLabel(item);
    if (t) captionBits.push(t);
  }

  return {
    imageCandidates: imageCandidates.slice(0, 3),
    caption: [...new Set(captionBits)].join(' · '),
  };
};

const buildCenterFooterLines = (order: Order | undefined, trackingNumber: string | null): string[] => {
  const lines: string[] = [];
  if (order) {
    const shortId = order.id.replace(/-/g, '').slice(0, 14);
    lines.push(`Pedido: ${shortId}`);
    const designNames = order.items
      .map((i) => i.designName?.trim())
      .filter((n): n is string => Boolean(n));
    if (designNames.length > 0) {
      const joined = designNames.slice(0, 3).join(', ');
      lines.push(joined.length > 120 ? `${joined.slice(0, 117)}…` : joined);
    }
    const { caption } = buildFooterContent(order);
    if (caption) lines.push(caption);
  } else if (trackingNumber) {
    lines.push(`TN ${trackingNumber}`);
  }
  return lines;
};

const buildTextBuckets = (viewport: PageViewport, items: TextItem[]) => {
  type Bucket = { y: number; parts: Array<{ x: number; text: string }> };
  const buckets: Bucket[] = [];

  for (const item of items) {
    const text = normalizeWhitespace(item.str || '');
    if (!text) continue;
    const m = Util.transform(viewport.transform, item.transform);
    const x = m[4];
    const y = m[5];
    let bucket = buckets.find((b) => Math.abs(b.y - y) <= 2);
    if (!bucket) {
      bucket = { y, parts: [] };
      buckets.push(bucket);
    }
    bucket.parts.push({ x, text });
  }

  buckets.sort((a, b) => a.y - b.y);
  return buckets;
};

const isCorreoTopHeaderToken = (t: string): boolean => {
  const u = t.toUpperCase();
  if (u.includes('CORREO') && u.includes('ARGENTINO')) return true;
  if (u.includes('PAQ.AR')) return true;
  if (u.includes('PAQ') && u.includes('CLASICO')) return true;
  return false;
};

/**
 * Primera fila de píxeles a **conservar**: todo lo anterior (franja PAQ / Correo) se descarta.
 */
const computeCorreoTopHeaderCropBottomPx = (
  viewport: PageViewport,
  items: TextItem[],
  canvasHeight: number,
): number => {
  let maxY = -1;
  const yScanMax = viewport.height * 0.34;

  const buckets = buildTextBuckets(viewport, items);
  for (const bucket of buckets) {
    if (bucket.y > yScanMax) break;
    const line = normalizeWhitespace(
      bucket.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join(' '),
    );
    if (!isCorreoTopHeaderToken(line)) continue;
    for (const item of items) {
      const t = normalizeWhitespace(item.str || '');
      if (!t) continue;
      const m = Util.transform(viewport.transform, item.transform);
      if (Math.abs(m[5] - bucket.y) <= 2) maxY = Math.max(maxY, m[5]);
    }
  }

  for (const item of items) {
    const t = normalizeWhitespace(item.str || '');
    if (!t || t.length > 90) continue;
    const m = Util.transform(viewport.transform, item.transform);
    if (m[5] > yScanMax) continue;
    if (!isCorreoTopHeaderToken(t)) continue;
    maxY = Math.max(maxY, m[5]);
  }

  if (maxY < 0) return 0;
  const raw = Math.floor(maxY + HEADER_CROP_MARGIN_PX);
  const cap = Math.floor(canvasHeight * MAX_HEADER_CROP_FRAC);
  return Math.max(0, Math.min(raw, cap));
};

const isInkPixel = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  whiteThreshold: number,
): boolean => {
  const xi = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const i = (yi * width + xi) * 4;
  const a = data[i + 3];
  if (a < 12) return false;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return r < whiteThreshold || g < whiteThreshold || b < whiteThreshold;
};

const trimCanvasToInkBounds = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const w = source.width;
  const h = source.height;
  const ctx = source.getContext('2d');
  if (!ctx || w < 2 || h < 2) return source;

  const { data } = ctx.getImageData(0, 0, w, h);

  let top = 0;
  while (top < h) {
    let hit = false;
    for (let x = 0; x < w; x += 2) {
      if (isInkPixel(data, w, h, x, top, TRIM_WHITE_THRESHOLD)) {
        hit = true;
        break;
      }
    }
    if (hit) break;
    top += 1;
  }

  let bottom = h - 1;
  while (bottom > top) {
    let hit = false;
    for (let x = 0; x < w; x += 2) {
      if (isInkPixel(data, w, h, x, bottom, TRIM_WHITE_THRESHOLD)) {
        hit = true;
        break;
      }
    }
    if (hit) break;
    bottom -= 1;
  }

  let left = 0;
  while (left < w) {
    let hit = false;
    for (let y = top; y <= bottom; y += 2) {
      if (isInkPixel(data, w, h, left, y, TRIM_WHITE_THRESHOLD)) {
        hit = true;
        break;
      }
    }
    if (hit) break;
    left += 1;
  }

  let right = w - 1;
  while (right > left) {
    let hit = false;
    for (let y = top; y <= bottom; y += 2) {
      if (isInkPixel(data, w, h, right, y, TRIM_WHITE_THRESHOLD)) {
        hit = true;
        break;
      }
    }
    if (hit) break;
    right -= 1;
  }

  const pad = TRIM_PADDING_PX;
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(h - 1, bottom + pad);
  right = Math.min(w - 1, right + pad);

  const cw = right - left + 1;
  const ch = bottom - top + 1;
  if (cw < 16 || ch < 16 || top > bottom || left > right) {
    return source;
  }

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) return source;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, cw, ch);
  octx.drawImage(source, left, top, cw, ch, 0, 0, cw, ch);
  return out;
};

/** Recorta `px` filas desde arriba (tras aislar la tarjeta). */
const cropTopPixels = (source: HTMLCanvasElement, px: number): HTMLCanvasElement => {
  const p = Math.floor(px);
  if (p <= 0) return source;
  const w = source.width;
  const nh = source.height - p;
  if (nh < 40) return source;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = nh;
  const octx = out.getContext('2d');
  if (!octx) return source;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, w, nh);
  octx.drawImage(source, 0, p, w, nh, 0, 0, w, nh);
  return out;
};

/** Recorta `px` filas desde abajo para quitar líneas residuales. */
const cropBottomPixels = (source: HTMLCanvasElement, px: number): HTMLCanvasElement => {
  const p = Math.floor(px);
  if (p <= 0) return source;
  const w = source.width;
  const nh = source.height - p;
  if (nh < 120) return source;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = nh;
  const octx = out.getContext('2d');
  if (!octx) return source;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, w, nh);
  octx.drawImage(source, 0, 0, w, nh, 0, 0, w, nh);
  return out;
};

/** Aísla la etiqueta real del A4 usando el bloque de texto detectado. */
const cropLabelByTextBounds = (
  source: HTMLCanvasElement,
  viewport: PageViewport,
  items: TextItem[],
  cropTop: number,
): HTMLCanvasElement => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    const text = normalizeWhitespace(item.str || '');
    if (!text) continue;
    const m = Util.transform(viewport.transform, item.transform);
    const x = m[4];
    const y = m[5] - cropTop;
    if (y < -4 || y > source.height + 4) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return source;
  }

  let left = Math.max(0, Math.floor(minX - LABEL_BOUNDS_PAD_X));
  const top = Math.max(0, Math.floor(minY - LABEL_BOUNDS_PAD_Y_TOP));
  let right = Math.min(source.width - 1, Math.ceil(maxX + LABEL_BOUNDS_PAD_X * 2.2));
  const bottom = Math.min(source.height - 1, Math.ceil(maxY + LABEL_BOUNDS_PAD_Y_BOTTOM));

  let cw = right - left + 1;
  const ch = bottom - top + 1;
  const minWidthFromAspect = Math.floor(ch * LABEL_ASPECT_W_OVER_H);

  // Si falta ancho (caso típico: se corta el borde derecho), expandimos priorizando derecha.
  if (cw < minWidthFromAspect) {
    const missing = minWidthFromAspect - cw;
    const growRight = Math.min(missing, source.width - 1 - right);
    right += growRight;
    const growLeft = Math.min(missing - growRight, left);
    left -= growLeft;
    cw = right - left + 1;
  }

  if (cw < 80 || ch < 120 || left >= right || top >= bottom) {
    return source;
  }

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) return source;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, cw, ch);
  octx.drawImage(source, left, top, cw, ch, 0, 0, cw, ch);
  return out;
};

const embedPreviewImage = async (pdfDoc: PDFDocument, url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('svg') || url.toLowerCase().includes('.svg')) {
      return null;
    }
    try {
      if (ct.includes('png') || url.toLowerCase().includes('.png')) {
        return await pdfDoc.embedPng(bytes);
      }
      if (ct.includes('jpeg') || ct.includes('jpg') || /\.jpe?g$/i.test(url)) {
        return await pdfDoc.embedJpg(bytes);
      }
      return await pdfDoc.embedPng(bytes);
    } catch {
      try {
        return await pdfDoc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
};

const renderCroppedPagePng = async (page: PDFPageProxy): Promise<Uint8Array | null> => {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const textContent = await page.getTextContent();
  const items = textContent.items.filter((i): i is TextItem => 'str' in i);

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const renderTask = page.render({
    canvasContext: ctx,
    canvas,
    viewport,
  });
  await renderTask.promise;

  const cropTop = computeCorreoTopHeaderCropBottomPx(viewport, items, canvas.height);
  const sliceH = Math.max(1, canvas.height - cropTop);

  const sliced = document.createElement('canvas');
  sliced.width = canvas.width;
  sliced.height = sliceH;
  const sctx = sliced.getContext('2d');
  if (!sctx) return null;
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, sliced.width, sliced.height);
  sctx.drawImage(canvas, 0, cropTop, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

  const labelByText = cropLabelByTextBounds(sliced, viewport, items, cropTop);
  let trimmed = trimCanvasToInkBounds(labelByText);
  if (cropTop < WEAK_TEXT_CROP_PX && trimmed.height > 80) {
    const shave = Math.min(
      POST_TRIM_HEADER_MAX_PX,
      Math.floor(trimmed.height * POST_TRIM_HEADER_FRAC_WEAK),
    );
    trimmed = cropTopPixels(trimmed, shave);
  }
  trimmed = cropBottomPixels(trimmed, POST_TRIM_BOTTOM_CROP_PX);

  const pngBlob: Blob = await new Promise((resolve) => {
    trimmed.toBlob((b) => resolve(b!), 'image/png');
  });
  const ab = await pngBlob.arrayBuffer();
  return new Uint8Array(ab);
};

/**
 * PDF **100×152 mm**: sin franja superior MiCorreo; pedido y logos **dentro** del rectángulo inferior de la etiqueta.
 */
export const enrichShippingLabelsPdf = async (
  pdfBytes: ArrayBuffer,
  trackingToOrder: Map<string, Order>,
): Promise<Uint8Array> => {
  const root = new Uint8Array(pdfBytes);
  const bytesForList = root.slice();
  const bytesForRender = root.slice();

  const trackingPerPage = await listTrackingNumbersByPage(bytesForList);

  const loadingTask = getDocument({ data: bytesForRender });
  const srcPdf = await loadingTask.promise;
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  let embeddedAlcohn: PDFImage | null = null;
  try {
    const logoRes = await fetch('/logo-alcohn.jpg');
    if (logoRes.ok) {
      const logoBytes = await logoRes.arrayBuffer();
      embeddedAlcohn = await outDoc.embedJpg(logoBytes);
    }
  } catch {
    embeddedAlcohn = null;
  }

  const n = srcPdf.numPages;
  for (let i = 0; i < n; i += 1) {
    const page = await srcPdf.getPage(i + 1);
    const pngBytes = await renderCroppedPagePng(page);
    if (!pngBytes) continue;

    const embeddedPng = await outDoc.embedPng(pngBytes);
    const labelPage = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);

    const iw = embeddedPng.width;
    const ih = embeddedPng.height;
    const fitW = LABEL_W_PT / iw;
    const fitH = (LABEL_H_PT - TOP_PRINT_MARGIN_PT) / ih;
    const scale = Math.min(fitW, fitH) * FIT_ZOOM;
    const dw = iw * scale;
    const dh = ih * scale;
    const xImg = (LABEL_W_PT - dw) / 2 + HORIZONTAL_NUDGE_PT;
    const yImg = Math.max(0, LABEL_H_PT - TOP_PRINT_MARGIN_PT - dh);

    labelPage.drawImage(embeddedPng, {
      x: xImg,
      y: yImg,
      width: dw,
      height: dh,
    });

    const bandH = dh * FOOTER_FRAC_OF_LABEL;
    const pad = Math.max(3, dw * 0.024);
    labelPage.drawRectangle({
      x: xImg - 2,
      y: yImg,
      width: dw + 4,
      height: bandH,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    const tn = trackingPerPage[i] ?? null;
    const order = tn ? trackingToOrder.get(tn) : undefined;
    const footerContent = order ? buildFooterContent(order) : null;
    const imageCandidates = footerContent?.imageCandidates ?? [];
    const centerLines = buildCenterFooterLines(order, tn);

    const leftColW = dw * 0.24;
    const rightColW = dw * 0.24;
    const centerX = xImg + leftColW + pad * 0.5;
    const centerW = Math.max(28, dw - leftColW - rightColW - pad);
    const logoMaxH = bandH * 0.72;
    const logoMaxW = leftColW - pad * 1.2;
    let leftBlockW = leftColW;

    if (embeddedAlcohn) {
      const ls = Math.min(logoMaxW / embeddedAlcohn.width, logoMaxH / embeddedAlcohn.height);
      const lw = embeddedAlcohn.width * ls;
      const lh = embeddedAlcohn.height * ls;
      const ly = yImg + (bandH - lh) / 2;
      labelPage.drawImage(embeddedAlcohn, {
        x: xImg + (leftColW - lw) / 2,
        y: ly,
        width: lw,
        height: lh,
      });
      leftBlockW = leftColW;
    }

    const slotW = Math.min(30, rightColW * 0.44);
    const nPrev = imageCandidates.length;
    const maxPrev = Math.min(2, nPrev);
    const totalPrevW =
      maxPrev > 0 ? maxPrev * slotW + Math.max(0, maxPrev - 1) * 2 : 0;
    const rightBlockW = rightColW;

    const textLines = centerLines.slice(0, 3);
    const textSize = Math.max(3.9, Math.min(5, bandH * 0.1));
    const lineStep = textSize + 0.9;
    const textBlockH = textLines.length > 0 ? (textLines.length - 1) * lineStep + textSize : 0;
    let textBaseline = yImg + (bandH + textBlockH) / 2 - textSize;
    for (const line of textLines) {
      labelPage.drawText(line, {
        x: centerX,
        y: textBaseline,
        size: textSize,
        font,
        color: rgb(0.06, 0.06, 0.06),
        maxWidth: centerW,
        lineHeight: lineStep,
      });
      textBaseline -= lineStep;
      if (textBaseline < yImg + 1) break;
    }

    let drewClientPreview = false;
    if (order && maxPrev > 0) {
      let px = xImg + dw - rightColW + (rightColW - totalPrevW) / 2;

      for (let j = 0; j < maxPrev; j += 1) {
        let embedded: PDFImage | null = null;
        for (const candidateUrl of imageCandidates[j] ?? []) {
          embedded = await embedPreviewImage(outDoc, candidateUrl);
          if (embedded) break;
        }
        if (!embedded) continue;
        const pw = embedded.width;
        const ph = embedded.height;
        const sc = Math.min(slotW / pw, logoMaxH / ph);
        const dwj = pw * sc;
        const dhj = ph * sc;
        const py = yImg + (bandH - dhj) / 2;
        labelPage.drawImage(embedded, {
          x: px + (slotW - dwj) / 2,
          y: py,
          width: dwj,
          height: dhj,
        });
        drewClientPreview = true;
        px += slotW + 2;
      }
    }

    // Fallback visual: si no hubo logo cliente, mostramos Alcohn en la columna derecha.
    if (!drewClientPreview && embeddedAlcohn) {
      const rs = Math.min(rightColW * 0.62 / embeddedAlcohn.width, logoMaxH / embeddedAlcohn.height);
      const rw = embeddedAlcohn.width * rs;
      const rh = embeddedAlcohn.height * rs;
      labelPage.drawImage(embeddedAlcohn, {
        x: xImg + dw - rightColW + (rightColW - rw) / 2,
        y: yImg + (bandH - rh) / 2,
        width: rw,
        height: rh,
      });
    }
  }

  if (outDoc.getPageCount() === 0) {
    throw new Error('No se pudo generar ninguna página del PDF de etiquetas.');
  }

  return outDoc.save();
};
