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

const buildFooterContent = (order: Order): { imageUrls: string[]; caption: string } => {
  const imageUrls: string[] = [];
  const captionBits: string[] = [];

  for (const item of order.items) {
    const url = item.files?.vectorPreviewUrl || item.files?.photoUrl;
    if (url && /^https?:\/\//i.test(url)) {
      imageUrls.push(url);
    }

    const accessory =
      item.itemType === 'MANGO_GOLPE' ||
      item.itemType === 'SOLDADOR' ||
      item.itemType === 'BASE_REMACHADORA';

    if (accessory) {
      const t = itemTypeShortLabel(item);
      if (t) captionBits.push(t);
    } else if (!url) {
      const t = itemTypeShortLabel(item);
      if (t) captionBits.push(t);
    }
  }

  return {
    imageUrls: imageUrls.slice(0, MAX_PREVIEWS),
    caption: [...new Set(captionBits)].join(' · '),
  };
};

const embedPreviewImage = async (pdfDoc: PDFDocument, url: string) => {
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
};

/**
 * Superpone en la parte inferior de cada página las previews del pedido y una leyenda breve.
 * Requiere que el TN de cada página coincida con una clave en `trackingToOrder`.
 */
export const enrichShippingLabelsPdf = async (
  pdfBytes: ArrayBuffer,
  trackingToOrder: Map<string, Order>
): Promise<Uint8Array> => {
  const trackingPerPage = await listTrackingNumbersByPage(pdfBytes);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const tn = trackingPerPage[i] ?? null;
    if (!tn) continue;

    const order = trackingToOrder.get(tn);
    if (!order) continue;

    const page = pages[i];
    const { width } = page.getSize();
    const { imageUrls, caption } = buildFooterContent(order);

    if (imageUrls.length === 0 && !caption) continue;

    const innerLeft = FOOTER_MARGIN_X;
    const innerRight = width - FOOTER_MARGIN_X;
    const innerWidth = innerRight - innerLeft;

    /** Leyenda pegada al borde inferior de la franja; las imágenes van encima. */
    const captionBaselineY = FOOTER_BOTTOM_Y + 5;
    const imageStackBottom = FOOTER_BOTTOM_Y + 22;

    if (caption) {
      page.drawText(caption, {
        x: innerLeft,
        y: captionBaselineY,
        size: CAPTION_FONT_SIZE,
        font,
        color: rgb(0.12, 0.12, 0.12),
        maxWidth: innerWidth,
        lineHeight: CAPTION_LINE_HEIGHT,
      });
    }
    const n = imageUrls.length;
    if (n === 0) continue;

    const slotW = (innerWidth - (n - 1) * IMAGE_GAP) / n;
    const maxSlotW = Math.min(slotW, 130);

    for (let j = 0; j < n; j++) {
      const embedded = await embedPreviewImage(pdfDoc, imageUrls[j]);
      if (!embedded) continue;

      const iw = embedded.width;
      const ih = embedded.height;
      const scale = Math.min(maxSlotW / iw, IMAGE_MAX_HEIGHT / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const slotLeft = innerLeft + j * (slotW + IMAGE_GAP);
      const x = slotLeft + (slotW - dw) / 2;

      page.drawImage(embedded, {
        x,
        y: imageStackBottom,
        width: dw,
        height: dh,
      });
    }
  }

  return pdfDoc.save();
};
