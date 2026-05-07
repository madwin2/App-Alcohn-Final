import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Order, OrderItem } from '@/lib/types';
import { listTrackingNumbersByPage } from '@/lib/utils/trackingPdfParser';

/** Franja inferior tipo MiCorreo A4 apaisado (~841×595 pt): previews + leyenda chica. */
const FOOTER_MARGIN_X = 36;
const FOOTER_BOTTOM_Y = 10;
const CAPTION_FONT_SIZE = 6;
const CAPTION_LINE_HEIGHT = 7;
const IMAGE_MAX_HEIGHT = 48;
const IMAGE_GAP = 5;
const MAX_PREVIEWS = 4;
const LOGO_MAX_H = 18;
const LOGO_MAX_W = 48;
const PREVIEW_SLOT_W = 72;
const PREVIEW_START_Y = FOOTER_BOTTOM_Y + 6;
/** Separación entre la franja gráfica (logo + previews) y la leyenda de texto. */
const CAPTION_RIGHT_OF_GRAPHICS_GAP = 10;
/** La leyenda va por encima de las miniaturas para que no pise los diseños. */
const CAPTION_ABOVE_PREVIEWS = 14;

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

const buildFooterContent = (order: Order): { imageCandidates: string[][]; caption: string } => {
  const imageCandidates: string[][] = [];
  const captionBits: string[] = [];

  for (const item of order.items) {
    // Priorizar archivo base y luego preview vectorial.
    const rawUrls = [item.files?.baseUrl, item.files?.vectorPreviewUrl];
    const candidates = rawUrls.filter(
      (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
    );
    if (candidates.length > 0) imageCandidates.push(candidates);

    // Siempre mostrar etiquetas de items (aunque haya preview), así el PDF enriquecido nunca queda "igual".
    const t = itemTypeShortLabel(item);
    if (t) captionBits.push(t);
  }

  return {
    imageCandidates: imageCandidates.slice(0, MAX_PREVIEWS),
    caption: [...new Set(captionBits)].join(' · '),
  };
};

const svgUrlToPngBytes = async (svgUrl: string, pixelW = 256): Promise<Uint8Array | null> => {
  try {
    const res = await fetch(svgUrl);
    if (!res.ok) return null;
    const svgText = await res.text();
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
    const objectUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo cargar el SVG del logo.'));
    });

    const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
    const w = Math.max(1, Math.round(pixelW));
    const h = Math.max(1, Math.round(w / ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    URL.revokeObjectURL(objectUrl);

    const pngBlob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    const ab = await pngBlob.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
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

/**
 * Superpone en la parte inferior de cada página las previews del pedido y una leyenda breve.
 * Requiere que el TN de cada página coincida con una clave en `trackingToOrder`.
 */
export const enrichShippingLabelsPdf = async (
  pdfBytes: ArrayBuffer,
  trackingToOrder: Map<string, Order>
): Promise<Uint8Array> => {
  // Usamos copias separadas del PDF para pdfjs y pdf-lib para evitar errores de ArrayBuffer "detached".
  const asUint8 = new Uint8Array(pdfBytes);
  const bytesForPdfJs = asUint8.slice();
  const bytesForPdfLib = asUint8.slice();

  const trackingPerPage = await listTrackingNumbersByPage(bytesForPdfJs);
  const pdfDoc = await PDFDocument.load(bytesForPdfLib);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  // Logo (SVG -> PNG) embebido una sola vez.
  const logoPngBytes = await svgUrlToPngBytes('/isologo-pagina.svg');
  const embeddedLogo = logoPngBytes ? await pdfDoc.embedPng(logoPngBytes) : null;

  for (let i = 0; i < pages.length; i++) {
    const tn = trackingPerPage[i] ?? null;
    if (!tn) continue;

    const order = trackingToOrder.get(tn);
    if (!order) continue;

    const page = pages[i];
    const { width } = page.getSize();
    const { imageCandidates, caption } = buildFooterContent(order);

    if (imageCandidates.length === 0 && !caption && !embeddedLogo) continue;

    const innerLeft = FOOTER_MARGIN_X;
    const innerRight = width - FOOTER_MARGIN_X;

    const imageStackBottom = PREVIEW_START_Y;
    const n = imageCandidates.length;

    /** Ancho ocupado por el isologo a la izquierda de las previews (sin solaparse con la primera). */
    const logoColumnW = embeddedLogo ? LOGO_MAX_W + IMAGE_GAP : 0;
    const previewsRowW =
      n > 0 ? n * PREVIEW_SLOT_W + Math.max(0, n - 1) * IMAGE_GAP : 0;
    const graphicsBlockEnd = innerLeft + logoColumnW + previewsRowW;

    /** Leyenda: más arriba y a la derecha del bloque de imágenes para que sea legible. */
    const captionBaselineY =
      imageStackBottom + IMAGE_MAX_HEIGHT + CAPTION_ABOVE_PREVIEWS;
    const captionX =
      n > 0 || embeddedLogo ? graphicsBlockEnd + CAPTION_RIGHT_OF_GRAPHICS_GAP : innerLeft;
    const captionMaxWidth = Math.max(80, innerRight - captionX);

    // Logo a la izquierda de la hilera de previews (misma altura útil que las miniaturas).
    if (embeddedLogo) {
      const scale = Math.min(LOGO_MAX_W / embeddedLogo.width, LOGO_MAX_H / embeddedLogo.height);
      const dw = embeddedLogo.width * scale;
      const dh = embeddedLogo.height * scale;
      page.drawImage(embeddedLogo, {
        x: innerLeft,
        y: imageStackBottom + IMAGE_MAX_HEIGHT - dh,
        width: dw,
        height: dh,
      });
    }

    const slotW = PREVIEW_SLOT_W;
    const maxSlotW = PREVIEW_SLOT_W;
    const startX = innerLeft + logoColumnW;

    for (let j = 0; j < n; j++) {
      let embedded = null;
      for (const candidateUrl of imageCandidates[j]) {
        embedded = await embedPreviewImage(pdfDoc, candidateUrl);
        if (embedded) break;
      }
      if (!embedded) continue;

      const iw = embedded.width;
      const ih = embedded.height;
      const scale = Math.min(maxSlotW / iw, IMAGE_MAX_HEIGHT / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const slotLeft = startX + j * (slotW + IMAGE_GAP);
      const x = slotLeft + (slotW - dw) / 2;

      page.drawImage(embedded, {
        x,
        y: imageStackBottom,
        width: dw,
        height: dh,
      });
    }

    if (caption) {
      page.drawText(caption, {
        x: captionX,
        y: captionBaselineY,
        size: CAPTION_FONT_SIZE,
        font,
        color: rgb(0.12, 0.12, 0.12),
        maxWidth: captionMaxWidth,
        lineHeight: CAPTION_LINE_HEIGHT,
      });
    }
  }

  return pdfDoc.save();
};
