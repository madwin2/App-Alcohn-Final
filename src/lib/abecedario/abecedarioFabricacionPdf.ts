import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Order, OrderItem } from '@/lib/types';
import { formatDate } from '@/lib/utils/format';
import { sanitizeDownloadFilename } from '@/lib/supabase/services/storage.service';
import {
  abecedarioPreviewUrl,
  formatAbecedarioExtras,
  formatElementosExtraLines,
  resolveAbecedarioSets,
} from './abecedarioConfig';

const BLACK = rgb(0, 0, 0);
const TEMPLATE_URL = '/abecedario/hoja-fabricacion.pdf';

type Line = { x: number; y: number; size: number; maxWidth: number };

const POS = {
  nombre: { x: 16.81, y: 366.56, size: 11, maxWidth: 200 } satisfies Line,
  fecha: { x: 225.18, y: 366.56, size: 10, maxWidth: 42 } satisfies Line,
  altura: { x: 16.81, y: 334.2, size: 11, maxWidth: 248 } satisfies Line,
  tipografia: { x: 16.81, y: 301.66, size: 11, maxWidth: 248 } satisfies Line,
  mayusculas: { x: 100.5, y: 269.48, size: 12, maxWidth: 32 } satisfies Line,
  minusculas: { x: 230.5, y: 269.48, size: 12, maxWidth: 32 } satisfies Line,
  letrasExtra: [
    { x: 108.5, y: 248.96, size: 10, maxWidth: 154 },
    { x: 12.67, y: 238.13, size: 10, maxWidth: 250 },
    { x: 12.67, y: 219.19, size: 10, maxWidth: 250 },
  ] satisfies Line[],
  observaciones: [
    { x: 19.19, y: 173.62, size: 9, maxWidth: 116 },
    { x: 19.19, y: 157.05, size: 9, maxWidth: 116 },
    { x: 19.19, y: 140.48, size: 9, maxWidth: 116 },
    { x: 19.19, y: 124.5, size: 9, maxWidth: 116 },
  ] satisfies Line[],
  preview: { x: 146, y: 110, width: 110, height: 76 },
  elementosExtra: [
    { x: 19.19, y: 57.41, size: 9, maxWidth: 232 },
    { x: 19.19, y: 40.84, size: 9, maxWidth: 232 },
    { x: 19.19, y: 24.3, size: 9, maxWidth: 232 },
  ] satisfies Line[],
};

export async function downloadAbecedarioHojaFabricacion(
  order: Order,
  items?: OrderItem[],
): Promise<void> {
  const targets = (items ?? order.items).filter((item) => item.itemType === 'ABECEDARIO');
  if (targets.length === 0) {
    throw new Error('Este pedido no tiene un abecedario');
  }

  const bytes = await generateAbecedarioHojaFabricacionPdf(order, targets);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const customer = `${order.customer.firstName} ${order.customer.lastName}`.trim();
  link.href = url;
  link.download = `${sanitizeDownloadFilename(`Hoja fabricacion abecedario - ${customer || 'pedido'}`)}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function generateAbecedarioHojaFabricacionPdf(
  order: Order,
  items: OrderItem[],
  templateBytes?: Uint8Array,
): Promise<Uint8Array> {
  const template = await PDFDocument.load(templateBytes ?? (await loadTemplateBytes()));
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  for (const item of items) {
    const [page] = await out.copyPages(template, [0]);
    out.addPage(page);
    const preview = await embedPreview(out, abecedarioPreviewUrl(item));
    fillHoja(page, font, order, item, preview);
  }

  return out.save();
}

async function loadTemplateBytes(): Promise<Uint8Array> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) {
    throw new Error('No se encontró la plantilla de hoja de fabricación');
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function embedPreview(doc: PDFDocument, url: string | undefined): Promise<PDFImage | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const u8 = new Uint8Array(bytes);
    if (u8[0] === 0xff && u8[1] === 0xd8) return doc.embedJpg(bytes);
    if (u8[0] === 0x89 && u8[1] === 0x50) return doc.embedPng(bytes);
    return null;
  } catch {
    return null;
  }
}

function fillHoja(
  page: PDFPage,
  font: PDFFont,
  order: Order,
  item: OrderItem,
  preview: PDFImage | null,
) {
  const config = item.itemConfig;
  const { mayusculas, minusculas } = resolveAbecedarioSets(config);
  const extras =
    formatAbecedarioExtras({
      abecedarioExtraLetterCounts: config?.abecedarioExtraLetterCounts,
      abecedarioSpecialCharsCount: config?.abecedarioSpecialCharsCount,
      abecedarioSpecialCharsDescription: config?.abecedarioSpecialCharsDescription,
    }) || config?.abecedarioExtraLetters || '';

  drawLineText(page, font, `${order.customer.firstName} ${order.customer.lastName}`.trim(), POS.nombre);
  drawLineText(page, font, order.orderDate ? formatDate(order.orderDate) : '', POS.fecha);
  drawLineText(
    page,
    font,
    config?.abecedarioAlturaMm ? `${config.abecedarioAlturaMm} mm` : '',
    POS.altura,
  );
  drawLineText(page, font, config?.abecedarioTipografia?.trim() || '', POS.tipografia);
  if (mayusculas > 0) drawLineText(page, font, String(mayusculas), POS.mayusculas);
  if (minusculas > 0) drawLineText(page, font, String(minusculas), POS.minusculas);
  fillLines(page, font, extras, POS.letrasExtra);
  fillLines(page, font, item.notes?.trim() || '', POS.observaciones);
  formatElementosExtraLines(order, item).forEach((line, index) => {
    const slot = POS.elementosExtra[index];
    if (slot) drawLineText(page, font, line, slot);
  });

  if (preview) {
    const box = POS.preview;
    const scale = Math.min(box.width / preview.width, box.height / preview.height);
    const dw = preview.width * scale;
    const dh = preview.height * scale;
    page.drawImage(preview, {
      x: box.x + (box.width - dw) / 2,
      y: box.y + (box.height - dh) / 2,
      width: dw,
      height: dh,
    });
  }
}

function drawLineText(page: PDFPage, font: PDFFont, text: string, line: Line) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return;
  let output = value;
  while (output.length > 1 && font.widthOfTextAtSize(output, line.size) > line.maxWidth) {
    output = output.slice(0, -1);
  }
  page.drawText(output, {
    x: line.x,
    y: line.y,
    size: line.size,
    font,
    color: BLACK,
  });
}

function fillLines(page: PDFPage, font: PDFFont, text: string, lines: Line[]) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || lines.length === 0) return;

  const words = clean.split(' ');
  let index = 0;
  for (const line of lines) {
    if (index >= words.length) break;
    let current = '';
    while (index < words.length) {
      const next = current ? `${current} ${words[index]}` : words[index];
      if (font.widthOfTextAtSize(next, line.size) > line.maxWidth) {
        if (!current) {
          current = next;
          index += 1;
        }
        break;
      }
      current = next;
      index += 1;
    }
    if (current) {
      page.drawText(current, {
        x: line.x,
        y: line.y,
        size: line.size,
        font,
        color: BLACK,
      });
    }
  }
}
