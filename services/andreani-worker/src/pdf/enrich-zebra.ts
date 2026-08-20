import { PDFDocument, StandardFonts, rgb, type PDFImage } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MM_TO_PT = 72 / 25.4;
const LABEL_W_PT = 100 * MM_TO_PT;
const LABEL_H_PT = 152 * MM_TO_PT;
const FOOTER_FRAC_OF_PAGE = 0.1;
const FIT_ZOOM = 0.97;
const TOP_PRINT_MARGIN_PT = MM_TO_PT * 1.5;
const BOTTOM_FOOTER_GAP_PT = MM_TO_PT * 1.2;

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
  const iw = embedded.width;
  const ih = embedded.height;
  const availableH = Math.max(40, LABEL_H_PT - TOP_PRINT_MARGIN_PT - bandH - BOTTOM_FOOTER_GAP_PT);
  const scale = Math.min(LABEL_W_PT / iw, availableH / ih) * FIT_ZOOM;
  const dw = iw * scale;
  const dh = ih * scale;
  const xImg = (LABEL_W_PT - dw) / 2;
  const yImg = LABEL_H_PT - TOP_PRINT_MARGIN_PT - dh;

  labelPage.drawPage(embedded, { x: xImg, y: yImg, width: dw, height: dh });

  const pad = Math.max(3, dw * 0.024);
  const bandY = BOTTOM_FOOTER_GAP_PT * 0.4;
  labelPage.drawRectangle({
    x: xImg - 2,
    y: bandY,
    width: dw + 4,
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

  const leftColW = dw * 0.24;
  const rightColW = dw * 0.24;
  const centerX = xImg + leftColW + pad * 0.5;
  const centerW = Math.max(28, dw - leftColW - rightColW - pad);
  const logoMaxH = bandH * 0.78;
  const logoMaxW = leftColW - pad * 1.2;

  if (alcohn) {
    const ls = Math.min(logoMaxW / alcohn.width, logoMaxH / alcohn.height);
    const lw = alcohn.width * ls;
    const lh = alcohn.height * ls;
    labelPage.drawImage(alcohn, {
      x: xImg + (leftColW - lw) / 2,
      y: bandY + (bandH - lh) / 2,
      width: lw,
      height: lh,
    });
  }

  const textLines = centerLines.slice(0, 3);
  const textSize = Math.max(3.6, Math.min(4.6, bandH * 0.18));
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
    let px = xImg + dw - rightColW + (rightColW - totalPrevW) / 2;
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
