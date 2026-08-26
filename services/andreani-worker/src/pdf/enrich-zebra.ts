import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFPage,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MM_TO_PT = 72 / 25.4;
const LABEL_W_PT = 100 * MM_TO_PT;
const LABEL_H_PT = 152 * MM_TO_PT;
/** Zócalo del pedido (más alto → texto legible). */
const FOOTER_FRAC_OF_PAGE = 0.125;
const FIT_ZOOM = 0.995;
const TOP_PRINT_MARGIN_PT = MM_TO_PT * 1.0;
const BOTTOM_FOOTER_GAP_PT = MM_TO_PT * 0.8;

/** Páginas chicas tipo Zebra 10×15 (p. ej. 196×298 pt). */
const isZebraSourcePage = (widthPt: number, heightPt: number): boolean =>
  widthPt > 0 && heightPt > 0 && widthPt < 500 && heightPt < 700;

/**
 * En A4 el bloque de etiqueta suele estar arriba-izquierda (~100×150 mm).
 * No usar inset lateral porcentual: corta el contenido (se veía el N° de seguimiento partido).
 */
const A4_LABEL_W_PT = 106 * MM_TO_PT;
const A4_LABEL_H_PT = 128 * MM_TO_PT;
const A4_MARGIN_TOP_PT = 5 * MM_TO_PT;
const A4_MARGIN_LEFT_PT = 5 * MM_TO_PT;
/**
 * Antes se descartaba ~11% inferior (stub QR + tracking).
 * Eso era justo lo que faltaba en el despacho — no descartar nada en Zebra.
 */
const ZEBRA_BOTTOM_DISCARD_FRAC = 0;

export type EnrichOrderInput = {
  id: string;
  designNames: string[];
  caption: string;
  imageUrls: string[][];
};

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

async function embedLogo(doc: PDFDocument, logoPath: string | undefined): Promise<PDFImage | null> {
  if (!logoPath || !existsSync(logoPath)) return null;
  try {
    const bytes = await readFile(logoPath);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes);
    return doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function splitPdfPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes);
  const out: Uint8Array[] = [];
  for (let i = 0; i < src.getPageCount(); i += 1) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [i]);
    doc.addPage(page);
    out.push(await doc.save());
  }
  return out;
}

type CropBox = { x: number; y: number; width: number; height: number };

/** Ventana de contenido útil (coords PDF, origen abajo-izq). */
function contentCrop(iw: number, ih: number): CropBox {
  if (isZebraSourcePage(iw, ih)) {
    const height = ih * (1 - ZEBRA_BOTTOM_DISCARD_FRAC);
    return { x: 0, y: ih - height, width: iw, height };
  }
  // A4 / hoja grande: ventana fija arriba-izquierda del tamaño de una etiqueta térmica.
  const width = Math.min(A4_LABEL_W_PT, iw - A4_MARGIN_LEFT_PT);
  const height = Math.min(A4_LABEL_H_PT, ih - A4_MARGIN_TOP_PT);
  return {
    x: A4_MARGIN_LEFT_PT,
    y: ih - A4_MARGIN_TOP_PT - height,
    width,
    height,
  };
}

function clipRect(page: PDFPage, x: number, y: number, w: number, h: number): void {
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
    clip(),
    endPath(),
  );
}

function endClip(page: PDFPage): void {
  page.pushOperators(popGraphicsState());
}

/**
 * Escala la ventana `crop` para llenar `dest`, alineada arriba y centrada en X.
 * (No centrar en Y: dejaba un hueco enorme entre etiqueta y pie.)
 */
function drawCroppedPage(
  page: PDFPage,
  embedded: { width: number; height: number },
  crop: CropBox,
  dest: { x: number; y: number; width: number; height: number },
  draw: (args: { x: number; y: number; width: number; height: number }) => void,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(dest.width / crop.width, dest.height / crop.height) * FIT_ZOOM;
  const drawnCropW = crop.width * scale;
  const drawnCropH = crop.height * scale;
  const destX = dest.x + (dest.width - drawnCropW) / 2;
  // Top-align dentro del área disponible (dest.y es el borde inferior del área).
  const destTop = dest.y + dest.height;
  const destY = destTop - drawnCropH;

  const fullW = embedded.width * scale;
  const fullH = embedded.height * scale;
  const pageX = destX - crop.x * scale;
  const pageY = destY - crop.y * scale;

  clipRect(page, dest.x, dest.y, dest.width, dest.height);
  draw({ x: pageX, y: pageY, width: fullW, height: fullH });
  endClip(page);

  return { x: destX, y: destY, width: drawnCropW, height: drawnCropH };
}

export async function enrichZebraLabelPdf(
  pageBytes: Uint8Array,
  tracking: string,
  order: EnrichOrderInput | undefined,
  logoPath?: string,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pageBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const embeddedPages = await outDoc.embedPages(srcDoc.getPages());
  const embedded = embeddedPages[0];
  if (!embedded) return pageBytes;

  const alcohn = await embedLogo(outDoc, logoPath);
  const labelPage = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);
  const bandH = LABEL_H_PT * FOOTER_FRAC_OF_PAGE;
  const bandY = BOTTOM_FOOTER_GAP_PT * 0.4;
  const availableH = Math.max(
    40,
    LABEL_H_PT - TOP_PRINT_MARGIN_PT - bandH - BOTTOM_FOOTER_GAP_PT,
  );

  const iw = embedded.width;
  const ih = embedded.height;
  const crop = contentCrop(iw, ih);

  const drawn = drawCroppedPage(
    labelPage,
    embedded,
    crop,
    {
      x: 0,
      y: bandY + bandH,
      width: LABEL_W_PT,
      height: availableH,
    },
    (args) => {
      labelPage.drawPage(embedded, args);
    },
  );

  // Pegar el pie justo debajo de la etiqueta (no al fondo de la hoja si sobra espacio).
  const snugBandY = Math.max(bandY, drawn.y - BOTTOM_FOOTER_GAP_PT - bandH);
  const pad = Math.max(3, drawn.width * 0.024);
  const footerX = Math.max(0, drawn.x - 2);
  const footerW = Math.min(LABEL_W_PT - footerX, drawn.width + 4);
  labelPage.drawRectangle({
    x: footerX,
    y: snugBandY,
    width: footerW,
    height: bandH,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  const centerLines: string[] = [];
  if (order) {
    centerLines.push(`Pedido: ${order.id.replace(/-/g, '').slice(0, 14)}`);
    const seen = new Set<string>();
    for (const name of order.designNames.slice(0, 3)) {
      const label = name.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      centerLines.push(label.length > 36 ? `${label.slice(0, 33)}…` : label);
    }
    if (order.caption) {
      for (const part of order.caption.split(/\s*[·|]\s*/)) {
        if (centerLines.length >= 4) break;
        const p = part.trim();
        if (!p) continue;
        const key = p.toLowerCase();
        if (seen.has(key)) continue;
        if (order.designNames.some((d) => d.trim().toLowerCase() === key)) continue;
        seen.add(key);
        centerLines.push(p.length > 36 ? `${p.slice(0, 33)}…` : p);
      }
    }
  } else {
    centerLines.push(`Andreani ${tracking}`);
  }

  const leftColW = drawn.width * 0.22;
  const rightColW = drawn.width * 0.28;
  const centerX = drawn.x + leftColW + pad * 0.5;
  const centerW = Math.max(36, drawn.width - leftColW - rightColW - pad);
  const logoMaxH = bandH * 0.82;
  const logoMaxW = leftColW - pad * 1.0;

  if (alcohn) {
    const ls = Math.min(logoMaxW / alcohn.width, logoMaxH / alcohn.height);
    const lw = alcohn.width * ls;
    const lh = alcohn.height * ls;
    labelPage.drawImage(alcohn, {
      x: drawn.x + (leftColW - lw) / 2,
      y: snugBandY + (bandH - lh) / 2,
      width: lw,
      height: lh,
    });
  }

  const textLines = centerLines.slice(0, 4);
  // bandH ~19pt → ~7–8pt legible en térmica
  const textSize = Math.max(6.5, Math.min(8.2, bandH * 0.34));
  const lineStep = textSize + 1.35;
  const textBlockH = textLines.length > 0 ? (textLines.length - 1) * lineStep + textSize : 0;
  let textBaseline = snugBandY + (bandH + textBlockH) / 2 - textSize * 0.15;
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
    if (textBaseline < snugBandY + 1) break;
  }

  const imageCandidates = order?.imageUrls.slice(0, 3) ?? [];
  const maxPrev = imageCandidates.length;
  const slotW = Math.min(maxPrev >= 3 ? 22 : 28, rightColW * (maxPrev >= 3 ? 0.3 : 0.42));
  const totalPrevW = maxPrev > 0 ? maxPrev * slotW + Math.max(0, maxPrev - 1) * 2 : 0;
  if (maxPrev > 0) {
    let px = drawn.x + drawn.width - rightColW + (rightColW - totalPrevW) / 2;
    for (let j = 0; j < maxPrev; j += 1) {
      let img: PDFImage | null = null;
      for (const url of imageCandidates[j] ?? []) {
        img = await embedPreview(outDoc, url);
        if (img) break;
      }
      if (!img) continue;
      const sc = Math.min(slotW / img.width, logoMaxH / img.height);
      const dwj = img.width * sc;
      const dhj = img.height * sc;
      labelPage.drawImage(img, {
        x: px + (slotW - dwj) / 2,
        y: snugBandY + (bandH - dhj) / 2,
        width: dwj,
        height: dhj,
      });
      px += slotW + 2;
    }
  }

  return outDoc.save();
}
