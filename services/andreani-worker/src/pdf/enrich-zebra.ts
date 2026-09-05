/**
 * Enrich Zebra → 100×152 mm térmico. Flujo simple:
 * 1) Si el PDF ya tiene pie "Pedido:", se recorta (evita duplicar).
 * 2) Se dibuja la etiqueta Andreani arriba (achicada para dejar aire).
 * 3) Un solo pie fino abajo, sin tapar el stub (2 QR).
 */
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
import { inflateSync } from 'node:zlib';

const MM_TO_PT = 72 / 25.4;
const LABEL_W_PT = 100 * MM_TO_PT;
const LABEL_H_PT = 152 * MM_TO_PT;

/** Pie fino (~8 mm texto / ~11 mm con preview). */
const FOOTER_H_TEXT_PT = 8 * MM_TO_PT;
const FOOTER_H_PREVIEW_PT = 11 * MM_TO_PT;
/** Aire claro entre stub (2 QR) y el pie Pedido. */
const GAP_PT = 8 * MM_TO_PT;
const TOP_MARGIN_PT = 0.5 * MM_TO_PT;
const BOTTOM_SAFE_PT = 1.5 * MM_TO_PT;
/** Andreani un poco más chica que el hueco → aire bajo el stub. */
const FIT_ZOOM = 0.92;

const A4_LABEL_W_PT = 106 * MM_TO_PT;
const A4_LABEL_H_PT = 130 * MM_TO_PT;
const A4_MARGIN_TOP_PT = 4 * MM_TO_PT;
const A4_MARGIN_LEFT_PT = 4 * MM_TO_PT;

export type EnrichOrderInput = {
  id: string;
  designNames: string[];
  caption: string;
  imageUrls: string[][];
};

type CropBox = { x: number; y: number; width: number; height: number };

const isSmallPage = (w: number, h: number) => w > 0 && h > 0 && w < 500 && h < 700;

/** Texto PDF + streams Flate inflados (Pedido suele ir comprimido). */
function pdfSearchableText(pdfBytes: Uint8Array): string {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const chunks = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    try {
      const bin = Buffer.from(m[1], 'latin1');
      if (bin.length > 2 && bin[0] === 0x78) {
        chunks.push(inflateSync(bin).toString('latin1'));
      }
    } catch {
      /* stream no zlib */
    }
  }
  return chunks.join('\n');
}

/** True si el PDF (o una hoja) contiene el número de seguimiento en texto/streams. */
export function pdfContainsTracking(pdfBytes: Uint8Array, tracking: string): boolean {
  const t = tracking.trim();
  if (!t || t.length < 8) return false;
  const text = pdfSearchableText(pdfBytes);
  if (text.includes(t)) return true;
  // Andreani suele emitir dígitos sueltos `(3) Tj (6) Tj…` → no quedan contiguos en el stream.
  const onlyDigits = text.replace(/\D+/g, '');
  if (onlyDigits.includes(t)) return true;
  // Hex ASCII del tracking (a veces en streams).
  const hex = Buffer.from(t, 'ascii').toString('hex');
  if (hex && text.toLowerCase().includes(hex.toLowerCase())) return true;
  return false;
}

/**
 * Elige la hoja cuyo contenido incluye el tracking.
 * Evita guardar página i como tracking j cuando el portal devuelve un PDF multi-hoja.
 */
export function indexOfPdfPageWithTracking(pages: Uint8Array[], tracking: string): number {
  const t = tracking.trim();
  if (!t || t.length < 8) return -1;
  for (let i = 0; i < pages.length; i += 1) {
    if (pdfContainsTracking(pages[i], t)) return i;
  }
  return -1;
}

/**
 * Si ya enriquecimos este PDF, recortar pies Pedido viejos (a veces 2–3 apilados + hueco).
 * Zebra crudo del portal no tiene "Pedido:" → 0.
 * pdf-lib suele escribir el texto en hex (<50656469646f…>) dentro de streams Flate.
 */
function autoDiscardBottomFrac(pdfBytes: Uint8Array, iw: number, ih: number): number {
  if (!isSmallPage(iw, ih)) return 0;
  const text = pdfSearchableText(pdfBytes);
  const literal = text.match(/Pedido\s*:/gi)?.length ?? 0;
  // "Pedido" en hex PDF: 50 65 64 69 64 6f
  const hex = text.match(/50656469646f/gi)?.length ?? 0;
  const hits = Math.max(literal, hex);
  if (!hits) return 0;
  // 1 pie fino ≈ 12 %; pies viejos/duplicados + hueco pueden llegar a ~50 %.
  return Math.min(0.52, 0.1 + hits * 0.14);
}

function contentCrop(iw: number, ih: number, discardBottomFrac: number): CropBox {
  if (isSmallPage(iw, ih)) {
    const frac = Math.min(0.55, Math.max(0, discardBottomFrac));
    const height = ih * (1 - frac);
    // y = borde inferior del crop (origen PDF abajo-izq)
    return { x: 0, y: ih - height, width: iw, height };
  }
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

/** Dibuja el crop escalado, centrado en X, alineado ARRIBA dentro de dest. */
function drawCroppedPage(
  page: PDFPage,
  embedded: { width: number; height: number },
  crop: CropBox,
  dest: { x: number; y: number; width: number; height: number },
  draw: (args: { x: number; y: number; width: number; height: number }) => void,
): void {
  const scale = Math.min(dest.width / crop.width, dest.height / crop.height) * FIT_ZOOM;
  const drawnW = crop.width * scale;
  const drawnH = crop.height * scale;
  const destX = dest.x + (dest.width - drawnW) / 2;
  const destTop = dest.y + dest.height;
  const destY = destTop - drawnH;

  const pageX = destX - crop.x * scale;
  const pageY = destY - crop.y * scale;

  clipRect(page, dest.x, dest.y, dest.width, dest.height);
  draw({
    x: pageX,
    y: pageY,
    width: embedded.width * scale,
    height: embedded.height * scale,
  });
  endClip(page);
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

/**
 * Zebra Andreani → etiqueta 100×152 con pie Pedido (una sola vez, sin tapar stub).
 */
export async function enrichZebraLabelPdf(
  pageBytes: Uint8Array,
  tracking: string,
  order: EnrichOrderInput | undefined,
  logoPath?: string,
  opts?: { discardBottomFrac?: number },
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pageBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const [embedded] = await outDoc.embedPages(srcDoc.getPages());
  if (!embedded) return pageBytes;

  const iw = embedded.width;
  const ih = embedded.height;
  const discard =
    opts?.discardBottomFrac ?? autoDiscardBottomFrac(pageBytes, iw, ih);
  if (discard > 0) {
    console.log(
      `[enrich] ${tracking}: fuente ya tenía pie Pedido → discardBottom=${(discard * 100).toFixed(0)}%`,
    );
  }

  const hasPreviews = (order?.imageUrls ?? []).some((u) => u.length > 0);
  const bandH = hasPreviews ? FOOTER_H_PREVIEW_PT : FOOTER_H_TEXT_PT;
  const footerY = BOTTOM_SAFE_PT;
  const andreaniBottom = footerY + bandH + GAP_PT;
  const availableH = Math.max(40, LABEL_H_PT - TOP_MARGIN_PT - andreaniBottom);

  const page = outDoc.addPage([LABEL_W_PT, LABEL_H_PT]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: LABEL_W_PT,
    height: LABEL_H_PT,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  const crop = contentCrop(iw, ih, discard);
  drawCroppedPage(
    page,
    embedded,
    crop,
    { x: 0, y: andreaniBottom, width: LABEL_W_PT, height: availableH },
    (args) => page.drawPage(embedded, args),
  );

  // Pie: solo la franja (NO blanquear andeaniBottom entero — eso comía los QR del stub).
  const pad = 3;
  page.drawRectangle({
    x: 0,
    y: footerY,
    width: LABEL_W_PT,
    height: bandH,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  page.drawLine({
    start: { x: 3, y: footerY + bandH },
    end: { x: LABEL_W_PT - 3, y: footerY + bandH },
    thickness: 0.6,
    color: rgb(0.35, 0.35, 0.35),
  });

  const alcohn = await embedLogo(outDoc, logoPath);
  const lines: string[] = [];
  if (order) {
    lines.push(`Pedido: ${order.id.replace(/-/g, '').slice(0, 14)}`);
    const seen = new Set<string>();
    for (const name of order.designNames.slice(0, 2)) {
      const t = name.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      lines.push(t.length > 34 ? `${t.slice(0, 31)}…` : t);
    }
  } else {
    lines.push(`Andreani ${tracking}`);
  }

  const leftW = LABEL_W_PT * 0.14;
  const rightW = LABEL_W_PT * 0.4;
  const textX = leftW + pad;
  const textW = Math.max(36, LABEL_W_PT - leftW - rightW - pad * 2);
  const contentTop = footerY + bandH - 2;
  const imgH = bandH - 4;

  if (alcohn) {
    const sc = Math.min((leftW - 2) / alcohn.width, imgH / alcohn.height);
    const lw = alcohn.width * sc;
    const lh = alcohn.height * sc;
    page.drawImage(alcohn, {
      x: (leftW - lw) / 2,
      y: contentTop - lh,
      width: lw,
      height: lh,
    });
  }

  const fontSize = Math.max(6, Math.min(7.2, bandH * 0.35));
  let y = contentTop - fontSize;
  for (const line of lines.slice(0, 2)) {
    page.drawText(line, {
      x: textX,
      y,
      size: fontSize,
      font,
      color: rgb(0.05, 0.05, 0.05),
      maxWidth: textW,
    });
    y -= fontSize + 1;
    if (y < footerY + 1) break;
  }

  const urls = (order?.imageUrls ?? []).slice(0, 2);
  if (urls.length) {
    const gap = 2;
    const slot = Math.min(40, (rightW - pad - gap * (urls.length - 1)) / urls.length);
    let px = LABEL_W_PT - rightW + 2;
    for (const group of urls) {
      let img: PDFImage | null = null;
      for (const url of group) {
        img = await embedPreview(outDoc, url);
        if (img) break;
      }
      if (!img) continue;
      const sc = Math.min(slot / img.width, imgH / img.height);
      const dw = img.width * sc;
      const dh = img.height * sc;
      page.drawImage(img, {
        x: px + (slot - dw) / 2,
        y: contentTop - dh,
        width: dw,
        height: dh,
      });
      px += slot + gap;
    }
  }

  return outDoc.save();
}
