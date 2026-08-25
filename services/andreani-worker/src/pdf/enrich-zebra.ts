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
/** Zócalo del pedido: compacto para dejar más alto a la etiqueta. */
const FOOTER_FRAC_OF_PAGE = 0.085;
const FIT_ZOOM = 1;
const TOP_PRINT_MARGIN_PT = MM_TO_PT * 1.0;
const BOTTOM_FOOTER_GAP_PT = MM_TO_PT * 0.8;

/** Páginas chicas tipo Zebra 10×15 (p. ej. 196×298 pt). */
const isZebraSourcePage = (widthPt: number, heightPt: number): boolean =>
  widthPt > 0 && heightPt > 0 && widthPt < 500 && heightPt < 700;

/**
 * Fracción inferior a descartar del PDF fuente al escalar:
 * - Zebra: franja chica de QR/duplicado Andreani
 * - A4: disclaimer legal + márgenes; además se recortan laterales
 */
const ZEBRA_BOTTOM_DISCARD_FRAC = 0.08;
const A4_BOTTOM_DISCARD_FRAC = 0.42;
const A4_SIDE_INSET_FRAC = 0.14;

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

/** Ventana de contenido útil dentro de la página fuente (coords PDF, origen abajo-izq). */
function contentCrop(iw: number, ih: number): CropBox {
  if (isZebraSourcePage(iw, ih)) {
    const height = ih * (1 - ZEBRA_BOTTOM_DISCARD_FRAC);
    return { x: 0, y: ih - height, width: iw, height };
  }
  const height = ih * (1 - A4_BOTTOM_DISCARD_FRAC);
  const x = iw * A4_SIDE_INSET_FRAC;
  const width = iw * (1 - 2 * A4_SIDE_INSET_FRAC);
  return { x, y: ih - height, width, height };
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
 * Dibuja solo la ventana `crop` de la página embebida, escalada para llenar
 * el rectángulo destino (letterbox centrado).
 */
function drawCroppedPage(
  page: PDFPage,
  embedded: { width: number; height: number; /* drawPage-compatible */ },
  crop: CropBox,
  dest: { x: number; y: number; width: number; height: number },
  draw: (args: { x: number; y: number; width: number; height: number }) => void,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(dest.width / crop.width, dest.height / crop.height) * FIT_ZOOM;
  const drawnCropW = crop.width * scale;
  const drawnCropH = crop.height * scale;
  const destX = dest.x + (dest.width - drawnCropW) / 2;
  const destY = dest.y + (dest.height - drawnCropH) / 2;

  // Posición del drawPage (página completa) para que `crop` caiga en destX/destY
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

  const pad = Math.max(3, drawn.width * 0.024);
  // Pie a ancho completo de la etiqueta dibujada (centrado como la etiqueta)
  const footerX = drawn.x - 2;
  const footerW = drawn.width + 4;
  labelPage.drawRectangle({
    x: footerX,
    y: bandY,
    width: footerW,
    height: bandH,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  const centerLines: string[] = [];
  if (order) {
    centerLines.push(`Pedido: ${order.id.replace(/-/g, '').slice(0, 14)}`);
    if (order.designNames.length) {
      const joined = order.designNames.slice(0, 3).join(', ');
      centerLines.push(joined.length > 120 ? `${joined.slice(0, 117)}…` : joined);
    }
    if (order.caption) centerLines.push(order.caption);
  } else {
    centerLines.push(`Andreani ${tracking}`);
  }

  const leftColW = drawn.width * 0.24;
  const rightColW = drawn.width * 0.24;
  const centerX = drawn.x + leftColW + pad * 0.5;
  const centerW = Math.max(28, drawn.width - leftColW - rightColW - pad);
  const logoMaxH = bandH * 0.78;
  const logoMaxW = leftColW - pad * 1.2;

  if (alcohn) {
    const ls = Math.min(logoMaxW / alcohn.width, logoMaxH / alcohn.height);
    const lw = alcohn.width * ls;
    const lh = alcohn.height * ls;
    labelPage.drawImage(alcohn, {
      x: drawn.x + (leftColW - lw) / 2,
      y: bandY + (bandH - lh) / 2,
      width: lw,
      height: lh,
    });
  }

  const textLines = centerLines.slice(0, 3);
  const textSize = Math.max(3.8, Math.min(5.2, bandH * 0.2));
  const lineStep = textSize + 0.7;
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

  const imageCandidates = order?.imageUrls.slice(0, 2) ?? [];
  const slotW = Math.min(30, rightColW * 0.44);
  const maxPrev = imageCandidates.length;
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
        y: bandY + (bandH - dhj) / 2,
        width: dwj,
        height: dhj,
      });
      px += slotW + 2;
    }
  }

  return outDoc.save();
}
