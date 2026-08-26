import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
} from 'pdf-lib';
import { getDocument } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import type { Order, OrderItem } from '@/lib/types';
import { listAndreaniTrackingNumbersByPage } from '@/lib/utils/andreaniTrackingPdfParser';

/**
 * Etiqueta Andreani → **siempre 100×152 mm** con logos + info del pedido en el pie.
 * - Zebra / 10×15 (página chica, p. ej. 196×298 pt): se escala en vector, sin recorte A4.
 * - A4: se recortan márgenes blancos y la franja legal / QR inferior, luego se rasteriza.
 */
const MM_TO_PT = 72 / 25.4;
const LABEL_W_MM = 100;
const LABEL_H_MM = 152;
const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;

/** Alto del zócalo (pedido + logos), relativo al alto de página. */
const FOOTER_FRAC_OF_PAGE = 0.085;
const RENDER_SCALE = 2.5;
const TRIM_WHITE_THRESHOLD = 250;
const TRIM_PADDING_PX = 6;
/**
 * Fracción inferior del A4 a descartar: disclaimer IMPORTANTE + QR/tracking duplicado
 * del pie Andreani (así no se come el zócalo).
 */
const BOTTOM_LEGAL_CROP_FRAC = 0.42;
/** Escala de la etiqueta original. */
const FIT_ZOOM = 1;
const TOP_PRINT_MARGIN_PT = MM_TO_PT * 1.0;
const BOTTOM_FOOTER_GAP_PT = MM_TO_PT * 0.8;
const HORIZONTAL_NUDGE_PT = 0;
/** En Zebra, descartar franja inferior de QR duplicado para poder agrandar. */
const ZEBRA_BOTTOM_DISCARD_FRAC = 0.08;

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

const buildFooterContent = (order: Order): { imageCandidates: string[][] } => {
  const imageCandidates: string[][] = [];

  for (const item of order.items) {
    const rawUrls = [item.files?.baseUrl, item.files?.vectorPreviewUrl];
    const candidates = rawUrls.filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
    );
    if (candidates.length > 0) imageCandidates.push(candidates);
  }

  return {
    imageCandidates: imageCandidates.slice(0, 3),
  };
};

/** Una línea por ítem (máx. 3) + Pedido. */
const buildCenterFooterLines = (order: Order | undefined, trackingNumber: string | null): string[] => {
  const lines: string[] = [];
  if (order) {
    const shortId = order.id.replace(/-/g, '').slice(0, 14);
    lines.push(`Pedido: ${shortId}`);
    for (const item of order.items) {
      if (lines.length >= 4) break;
      const label = itemTypeShortLabel(item);
      if (!label) continue;
      lines.push(label.length > 42 ? `${label.slice(0, 39)}…` : label);
    }
  } else if (trackingNumber) {
    lines.push(`Andreani ${trackingNumber}`);
  }
  return lines;
};

const trimCanvasToInkBounds = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = source.getContext('2d');
  if (!ctx) return source;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;

  let top = height;
  let left = width;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 8) continue;
      if (r >= TRIM_WHITE_THRESHOLD && g >= TRIM_WHITE_THRESHOLD && b >= TRIM_WHITE_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return source;

  left = Math.max(0, left - TRIM_PADDING_PX);
  top = Math.max(0, top - TRIM_PADDING_PX);
  right = Math.min(width - 1, right + TRIM_PADDING_PX);
  bottom = Math.min(height - 1, bottom + TRIM_PADDING_PX);

  const tw = right - left + 1;
  const th = bottom - top + 1;
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const octx = out.getContext('2d');
  if (!octx) return source;
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, tw, th);
  octx.drawImage(source, left, top, tw, th, 0, 0, tw, th);
  return out;
};

const renderAndreaniPagePng = async (page: PDFPageProxy): Promise<Uint8Array | null> => {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  await page.render({ canvasContext: ctx, canvas, viewport }).promise;

  // Quitar franja legal inferior antes del trim de tinta
  const legalCrop = Math.floor(canvas.height * BOTTOM_LEGAL_CROP_FRAC);
  const sliced = document.createElement('canvas');
  sliced.width = canvas.width;
  sliced.height = Math.max(1, canvas.height - legalCrop);
  const sctx = sliced.getContext('2d');
  if (!sctx) return null;
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, sliced.width, sliced.height);
  sctx.drawImage(canvas, 0, 0, canvas.width, sliced.height, 0, 0, sliced.width, sliced.height);

  const trimmed = trimCanvasToInkBounds(sliced);

  const pngBlob: Blob = await new Promise((resolve) => {
    trimmed.toBlob((b) => resolve(b!), 'image/png');
  });
  return new Uint8Array(await pngBlob.arrayBuffer());
};

const embedPreviewImage = async (
  doc: PDFDocument,
  url: string,
): Promise<PDFImage | null> => {
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
};

const isZebraSourcePage = (widthPt: number, heightPt: number): boolean =>
  widthPt > 0 && heightPt > 0 && widthPt < 500 && heightPt < 700;

const enrichZebraVector = async (
  root: Uint8Array,
  trackingPerPage: (string | null)[],
  trackingToOrder: Map<string, Order>,
): Promise<Uint8Array> => {
  const srcDoc = await PDFDocument.load(root);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const embeddedPages = await outDoc.embedPages(srcDoc.getPages());

  let embeddedAlcohn: PDFImage | null = null;
  try {
    const logoRes = await fetch('/logo-alcohn.jpg');
    if (logoRes.ok) embeddedAlcohn = await outDoc.embedJpg(await logoRes.arrayBuffer());
  } catch {
    embeddedAlcohn = null;
  }

  for (let i = 0; i < embeddedPages.length; i += 1) {
    const embeddedPng = embeddedPages[i];
    const labelPage = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);
    const bandH = LABEL_H_PT * FOOTER_FRAC_OF_PAGE;
    const bandY = BOTTOM_FOOTER_GAP_PT * 0.4;
    const iw = embeddedPng.width;
    const ih = embeddedPng.height;
    const contentH = ih * (1 - ZEBRA_BOTTOM_DISCARD_FRAC);
    const availableH = Math.max(
      40,
      LABEL_H_PT - TOP_PRINT_MARGIN_PT - bandH - BOTTOM_FOOTER_GAP_PT,
    );
    const scale = Math.min(LABEL_W_PT / iw, availableH / contentH) * FIT_ZOOM;
    const dw = iw * scale;
    const dhFull = ih * scale;
    const xImg = (LABEL_W_PT - dw) / 2 + HORIZONTAL_NUDGE_PT;
    const yTop = LABEL_H_PT - TOP_PRINT_MARGIN_PT;
    const yImg = yTop - dhFull;

    const clipY = bandY + bandH;
    labelPage.pushOperators(
      pushGraphicsState(),
      moveTo(0, clipY),
      lineTo(LABEL_W_PT, clipY),
      lineTo(LABEL_W_PT, LABEL_H_PT),
      lineTo(0, LABEL_H_PT),
      closePath(),
      clip(),
      endPath(),
    );
    labelPage.drawPage(embeddedPng, { x: xImg, y: yImg, width: dw, height: dhFull });
    labelPage.pushOperators(popGraphicsState());

    const pad = Math.max(3, dw * 0.024);
    labelPage.drawRectangle({
      x: xImg - 2,
      y: bandY,
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
    const logoMaxH = bandH * 0.78;
    const logoMaxW = leftColW - pad * 1.2;

    if (embeddedAlcohn) {
      const ls = Math.min(logoMaxW / embeddedAlcohn.width, logoMaxH / embeddedAlcohn.height);
      const lw = embeddedAlcohn.width * ls;
      const lh = embeddedAlcohn.height * ls;
      labelPage.drawImage(embeddedAlcohn, {
        x: xImg + (leftColW - lw) / 2,
        y: bandY + (bandH - lh) / 2,
        width: lw,
        height: lh,
      });
    }

    const nPrev = imageCandidates.length;
    const maxPrev = Math.min(3, nPrev);
    const slotW = Math.min(maxPrev >= 3 ? 22 : 28, rightColW * (maxPrev >= 3 ? 0.3 : 0.42));
    const totalPrevW = maxPrev > 0 ? maxPrev * slotW + Math.max(0, maxPrev - 1) * 2 : 0;

    const textLines = centerLines.slice(0, 4);
    const textSize = Math.max(4.6, Math.min(6.2, bandH * 0.2));
    const lineStep = textSize + 1.0;
    const textBlockH = textLines.length > 0 ? (textLines.length - 1) * lineStep + textSize : 0;
    let textBaseline = bandY + (bandH + textBlockH) / 2 - textSize;
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
      if (textBaseline < bandY + 1) break;
    }

    if (order && maxPrev > 0) {
      let px = xImg + dw - rightColW + (rightColW - totalPrevW) / 2;
      for (let j = 0; j < maxPrev; j += 1) {
        let embedded: PDFImage | null = null;
        for (const candidateUrl of imageCandidates[j] ?? []) {
          embedded = await embedPreviewImage(outDoc, candidateUrl);
          if (embedded) break;
        }
        if (!embedded) continue;
        const sc = Math.min(slotW / embedded.width, logoMaxH / embedded.height);
        const dwj = embedded.width * sc;
        const dhj = embedded.height * sc;
        labelPage.drawImage(embedded, {
          x: px + (slotW - dwj) / 2,
          y: bandY + (bandH - dhj) / 2,
          width: dwj,
          height: dhj,
        });
        px += slotW + 2;
      }
    }
  }

  return outDoc.save();
};

export const enrichAndreaniLabelsPdf = async (
  pdfBytes: ArrayBuffer,
  trackingToOrder: Map<string, Order>,
): Promise<Uint8Array> => {
  const root = new Uint8Array(pdfBytes);
  const trackingPerPage = await listAndreaniTrackingNumbersByPage(root.slice());

  const probe = await PDFDocument.load(root.slice());
  const probePage = probe.getPage(0);
  if (probePage && isZebraSourcePage(probePage.getWidth(), probePage.getHeight())) {
    return enrichZebraVector(root.slice(), trackingPerPage, trackingToOrder);
  }

  const srcPdf = await getDocument({ data: root.slice() }).promise;
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  let embeddedAlcohn: PDFImage | null = null;
  try {
    const logoRes = await fetch('/logo-alcohn.jpg');
    if (logoRes.ok) {
      embeddedAlcohn = await outDoc.embedJpg(await logoRes.arrayBuffer());
    }
  } catch {
    embeddedAlcohn = null;
  }

  for (let i = 0; i < srcPdf.numPages; i += 1) {
    const page = await srcPdf.getPage(i + 1);
    const pngBytes = await renderAndreaniPagePng(page);
    if (!pngBytes) continue;

    const embeddedPng = await outDoc.embedPng(pngBytes);
    const labelPage = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);

    const bandH = LABEL_H_PT * FOOTER_FRAC_OF_PAGE;
    const iw = embeddedPng.width;
    const ih = embeddedPng.height;
    // Espacio útil para la etiqueta: arriba del zócalo (sin solaparse)
    const availableH = Math.max(
      40,
      LABEL_H_PT - TOP_PRINT_MARGIN_PT - bandH - BOTTOM_FOOTER_GAP_PT,
    );
    const fitW = LABEL_W_PT / iw;
    const fitH = availableH / ih;
    const scale = Math.min(fitW, fitH) * FIT_ZOOM;
    const dw = iw * scale;
    const dh = ih * scale;
    const xImg = (LABEL_W_PT - dw) / 2 + HORIZONTAL_NUDGE_PT;
    // Pegada arriba; el zócalo queda abajo, separado
    const yImg = LABEL_H_PT - TOP_PRINT_MARGIN_PT - dh;

    labelPage.drawImage(embeddedPng, { x: xImg, y: yImg, width: dw, height: dh });

    const pad = Math.max(3, dw * 0.024);
    // Zócalo fijo abajo de la página (sin tapar la etiqueta)
    const bandY = BOTTOM_FOOTER_GAP_PT * 0.4;
    labelPage.drawRectangle({
      x: xImg - 2,
      y: bandY,
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
    const logoMaxH = bandH * 0.78;
    const logoMaxW = leftColW - pad * 1.2;

    if (embeddedAlcohn) {
      const ls = Math.min(logoMaxW / embeddedAlcohn.width, logoMaxH / embeddedAlcohn.height);
      const lw = embeddedAlcohn.width * ls;
      const lh = embeddedAlcohn.height * ls;
      labelPage.drawImage(embeddedAlcohn, {
        x: xImg + (leftColW - lw) / 2,
        y: bandY + (bandH - lh) / 2,
        width: lw,
        height: lh,
      });
    }

    const nPrev = imageCandidates.length;
    const maxPrev = Math.min(3, nPrev);
    const slotW = Math.min(maxPrev >= 3 ? 22 : 28, rightColW * (maxPrev >= 3 ? 0.3 : 0.42));
    const totalPrevW = maxPrev > 0 ? maxPrev * slotW + Math.max(0, maxPrev - 1) * 2 : 0;

    const textLines = centerLines.slice(0, 4);
    const textSize = Math.max(4.6, Math.min(6.2, bandH * 0.2));
    const lineStep = textSize + 1.0;
    const textBlockH = textLines.length > 0 ? (textLines.length - 1) * lineStep + textSize : 0;
    let textBaseline = bandY + (bandH + textBlockH) / 2 - textSize;
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
      if (textBaseline < bandY + 1) break;
    }

    if (order && maxPrev > 0) {
      let px = xImg + dw - rightColW + (rightColW - totalPrevW) / 2;
      for (let j = 0; j < maxPrev; j += 1) {
        let embedded: PDFImage | null = null;
        for (const candidateUrl of imageCandidates[j] ?? []) {
          embedded = await embedPreviewImage(outDoc, candidateUrl);
          if (embedded) break;
        }
        if (!embedded) continue;
        const sc = Math.min(slotW / embedded.width, logoMaxH / embedded.height);
        const dwj = embedded.width * sc;
        const dhj = embedded.height * sc;
        labelPage.drawImage(embedded, {
          x: px + (slotW - dwj) / 2,
          y: bandY + (bandH - dhj) / 2,
          width: dwj,
          height: dhj,
        });
        px += slotW + 2;
      }
    }
  }

  return outDoc.save();
};
