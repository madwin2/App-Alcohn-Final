import { PDFDocument, StandardFonts, rgb, type PDFImage } from 'pdf-lib';
import { getDocument, Util } from 'pdfjs-dist';
import type { PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import type { Order, OrderItem } from '@/lib/types';
import { listTrackingNumbersByPage } from '@/lib/utils/trackingPdfParser';

/** Zebra ZD220: 50 mm (ancho del rollo) × 152 mm (avance), vertical. */
const MM_TO_PT = 72 / 25.4;
const LABEL_W_MM = 50;
const LABEL_H_MM = 152;
const LABEL_W_PT = (LABEL_W_MM * MM_TO_PT) as number;
const LABEL_H_PT = (LABEL_H_MM * MM_TO_PT) as number;

const FOOTER_PT = 36;
const FOOTER_PAD_X = 3;
const LOGO_ALCOHN_MAX_H = 22;
const LOGO_ALCOHN_MAX_W = 36;
const CLIENT_PREVIEW_MAX = 3;
const CLIENT_PREVIEW_MAX_H = 22;
const CLIENT_PREVIEW_MAX_W = 28;
const CLIENT_PREVIEW_GAP = 2;
const RENDER_SCALE = 3.25;
/** Si no aparece «REMITENTE», recortar este % superior del raster. */
const DEFAULT_TOP_CROP_FRAC = 0.19;

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
    imageCandidates: imageCandidates.slice(0, CLIENT_PREVIEW_MAX),
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
      lines.push(joined.length > 90 ? `${joined.slice(0, 87)}…` : joined);
    }
    const { caption } = buildFooterContent(order);
    if (caption) lines.push(caption);
  } else if (trackingNumber) {
    lines.push(`TN ${trackingNumber}`);
  }
  return lines;
};

/** Fila superior de píxeles a descartar (encabezado del correo hasta ~REMITENTE). */
const computeRemitenteCropTopPxStable = (viewport: PageViewport, items: TextItem[]): number | null => {
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
  for (const bucket of buckets) {
    const line = normalizeWhitespace(
      bucket.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.text)
        .join(' '),
    );
    if (line.toUpperCase().includes('REMITENTE')) {
      const ty: number[] = [];
      for (const item of items) {
        const t = normalizeWhitespace(item.str || '');
        if (!t) continue;
        const m = Util.transform(viewport.transform, item.transform);
        if (Math.abs(m[5] - bucket.y) <= 2) ty.push(m[5]);
      }
      if (ty.length === 0) return Math.max(0, Math.floor(bucket.y - 6));
      return Math.max(0, Math.floor(Math.min(...ty) - 6));
    }
  }
  return null;
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
  const cropTop =
    computeRemitenteCropTopPxStable(viewport, items) ??
    Math.round(viewport.height * DEFAULT_TOP_CROP_FRAC);
  const safeCrop = Math.min(Math.max(0, cropTop), Math.floor(viewport.height * 0.52));

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

  const sliceH = Math.max(1, canvas.height - safeCrop);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = sliceH;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.drawImage(canvas, 0, safeCrop, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

  const pngBlob: Blob = await new Promise((resolve) => {
    out.toBlob((b) => resolve(b!), 'image/png');
  });
  const ab = await pngBlob.arrayBuffer();
  return new Uint8Array(ab);
};

/**
 * Genera un PDF para Zebra 50×152 mm: recorta el encabezado del correo (desde «REMITENTE»),
 * escala el cuerpo y agrega pie con logo Alcohn (izq.), datos del pedido (centro) y previews del cliente (der.).
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
    const bodyH = LABEL_H_PT - FOOTER_PT;

    const iw = embeddedPng.width;
    const ih = embeddedPng.height;
    const scale = Math.min(LABEL_W_PT / iw, bodyH / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const xImg = (LABEL_W_PT - dw) / 2;
    const yImg = FOOTER_PT + (bodyH - dh) / 2;

    labelPage.drawImage(embeddedPng, {
      x: xImg,
      y: yImg,
      width: dw,
      height: dh,
    });

    labelPage.drawLine({
      start: { x: 0, y: FOOTER_PT },
      end: { x: LABEL_W_PT, y: FOOTER_PT },
      thickness: 0.35,
      color: rgb(0.35, 0.35, 0.35),
    });

    const tn = trackingPerPage[i] ?? null;
    const order = tn ? trackingToOrder.get(tn) : undefined;
    const centerLines = buildCenterFooterLines(order, tn);

    const leftColW = embeddedAlcohn ? LOGO_ALCOHN_MAX_W + 2 : 0;
    const rightColW = 40;
    const centerX = FOOTER_PAD_X + leftColW;
    const centerW = Math.max(24, LABEL_W_PT - FOOTER_PAD_X * 2 - leftColW - rightColW);

    if (embeddedAlcohn) {
      const ls = Math.min(LOGO_ALCOHN_MAX_W / embeddedAlcohn.width, LOGO_ALCOHN_MAX_H / embeddedAlcohn.height);
      const lw = embeddedAlcohn.width * ls;
      const lh = embeddedAlcohn.height * ls;
      labelPage.drawImage(embeddedAlcohn, {
        x: FOOTER_PAD_X,
        y: (FOOTER_PT - lh) / 2,
        width: lw,
        height: lh,
      });
    }

    let lineBaselineY = FOOTER_PT - 4;
    for (const line of centerLines.slice(0, 4)) {
      labelPage.drawText(line, {
        x: centerX,
        y: lineBaselineY,
        size: 4.2,
        font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: centerW,
        lineHeight: 5,
      });
      lineBaselineY -= 5.2;
      if (lineBaselineY < 2) break;
    }

    if (order) {
      const { imageCandidates } = buildFooterContent(order);
      const nPrev = imageCandidates.length;
      const slotW = CLIENT_PREVIEW_MAX_W;
      const totalW = nPrev * slotW + Math.max(0, nPrev - 1) * CLIENT_PREVIEW_GAP;
      let px = LABEL_W_PT - FOOTER_PAD_X - totalW;

      for (let j = 0; j < nPrev; j += 1) {
        let embedded = null;
        for (const candidateUrl of imageCandidates[j]) {
          embedded = await embedPreviewImage(outDoc, candidateUrl);
          if (embedded) break;
        }
        if (!embedded) continue;
        const pw = embedded.width;
        const ph = embedded.height;
        const sc = Math.min(slotW / pw, CLIENT_PREVIEW_MAX_H / ph);
        const dwj = pw * sc;
        const dhj = ph * sc;
        labelPage.drawImage(embedded, {
          x: px + (slotW - dwj) / 2,
          y: (FOOTER_PT - dhj) / 2,
          width: dwj,
          height: dhj,
        });
        px += slotW + CLIENT_PREVIEW_GAP;
      }
    }
  }

  if (outDoc.getPageCount() === 0) {
    throw new Error('No se pudo generar ninguna página del PDF de etiquetas.');
  }

  return outDoc.save();
};
