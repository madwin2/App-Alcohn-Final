import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ItemType, OrderItem } from '@/lib/types';
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';

/** Papel de la Zebra ZD220 (el mismo de Correo y Andreani). */
const MM_TO_PT = 72 / 25.4;
export const VIA_CARGO_LABEL_W_PT = 100 * MM_TO_PT;
export const VIA_CARGO_LABEL_H_PT = 152 * MM_TO_PT;

/** La térmica corta los bordes: márgenes físicos generosos. */
const MARGIN_X = 6 * MM_TO_PT;
const MARGIN_TOP = 8 * MM_TO_PT;
const MARGIN_BOTTOM = 6 * MM_TO_PT;
const CONTENT_W = VIA_CARGO_LABEL_W_PT - MARGIN_X * 2;
const BAR_H = 15;
const FOOTER_RESERVED = MARGIN_BOTTOM + 12;
const MAX_LOGO_PT = 90;
const MAX_LOGOS = 12;
const NAME_H = 9;
const LOGO_FETCH_MAX_PX = 512;

export const VIA_CARGO_REMITENTE = {
  nombre: 'Julian Moreno',
  dni: '41306528',
  domicilio: 'Alberti 1254',
  localidad: 'Mar del Plata',
  codigoPostal: '7600',
  telefono: '5492234468196',
  email: 'julian.475@hotmail.com',
} as const;

export interface ViaCargoLabelData {
  orderId: string;
  tipoEnvio: 'Domicilio' | 'Sucursal' | null;
  nombre: string;
  dni: string;
  domicilio: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
  telefono: string;
  email: string;
  /** Sellos (con logo) y accesorios/abecedario (texto). */
  items?: ViaCargoLabelItem[];
}

export interface ViaCargoLabelItem {
  name: string;
  /** Accesorios y abecedario: van como texto, sin imagen. */
  isAccessory: boolean;
  /** PNG ya rasterizado (ver `loadImageAsPngBytes`). */
  imagePng?: Uint8Array | null;
}

const ACCESSORY_TYPES = new Set<ItemType>(['SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA']);

export const isViaCargoAccessoryItemType = (itemType: ItemType | null | undefined): boolean =>
  Boolean(itemType && (ACCESSORY_TYPES.has(itemType) || itemType === 'ABECEDARIO'));

/** Helvetica estándar solo codifica WinAnsi: lo que no entra se pasa a su versión sin tilde. */
export const toWinAnsiText = (value: string): string =>
  (value || '')
    .normalize('NFC')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, (ch) =>
      ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ''),
    )
    .replace(/\s+/g, ' ')
    .trim();

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines;
};

/** Achica la letra hasta que el texto entre en `maxLines` renglones. */
const fitText = (
  text: string,
  font: PDFFont,
  size: number,
  minSize: number,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; size: number } => {
  let current = size;
  let lines = wrapText(text, font, current, maxWidth);
  while (lines.length > maxLines && current > minSize) {
    current -= 0.5;
    lines = wrapText(text, font, current, maxWidth);
  }
  return { lines: lines.slice(0, maxLines), size: current };
};

class LabelCursor {
  y: number;

  constructor(
    private readonly page: PDFPage,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.y = VIA_CARGO_LABEL_H_PT - MARGIN_TOP;
  }

  bar(title: string) {
    this.page.drawRectangle({
      x: MARGIN_X,
      y: this.y - BAR_H,
      width: CONTENT_W,
      height: BAR_H,
      color: rgb(0, 0, 0),
    });
    this.page.drawText(title, {
      x: MARGIN_X + 5,
      y: this.y - BAR_H + 4,
      size: 10,
      font: this.bold,
      color: rgb(1, 1, 1),
    });
    this.y -= BAR_H + 6;
  }

  /** `label` va en negrita adelante del valor; valor vacío deja una raya para completar a mano. */
  field(
    label: string | null,
    value: string,
    opts: { size?: number; minSize?: number; bold?: boolean; maxLines?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const clean = toWinAnsiText(value);
    const labelText = label ? `${label} ` : '';
    const labelW = labelText ? this.bold.widthOfTextAtSize(labelText, size) : 0;
    const shown = clean || '____________________';
    const fitted = fitText(shown, font, size, opts.minSize ?? size, CONTENT_W - labelW, opts.maxLines ?? 1);
    const lineH = fitted.size * 1.25;

    fitted.lines.forEach((line, index) => {
      const baseline = this.y - fitted.size;
      if (index === 0 && labelText) {
        this.page.drawText(labelText, { x: MARGIN_X, y: baseline, size: fitted.size, font: this.bold });
      }
      this.page.drawText(line, { x: MARGIN_X + labelW, y: baseline, size: fitted.size, font });
      this.y -= lineH;
    });
    this.y -= 1.5;
  }

  gap(pt: number) {
    this.y -= pt;
  }

  dashedDivider() {
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: MARGIN_X + CONTENT_W, y: this.y },
      thickness: 1,
      dashArray: [4, 3],
      color: rgb(0, 0, 0),
    });
  }
}

const truncateToWidth = (text: string, font: PDFFont, size: number, maxWidth: number): string => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text.length;
  while (cut > 1 && font.widthOfTextAtSize(`${text.slice(0, cut)}...`, size) > maxWidth) cut -= 1;
  return `${text.slice(0, cut)}...`;
};

/** Columnas que dan el logo más grande para `n` logos en el alto disponible. */
const chooseLogoGrid = (n: number, availH: number): { cols: number; rows: number; size: number } => {
  let best = { cols: 1, rows: n, size: 0 };
  for (let cols = 1; cols <= Math.min(n, 5); cols += 1) {
    const rows = Math.ceil(n / cols);
    const size = Math.min(CONTENT_W / cols - 6, availH / rows - NAME_H - 4, MAX_LOGO_PT);
    if (size > best.size) best = { cols, rows, size };
  }
  return best;
};

const extrasLabel = (extras: ViaCargoLabelItem[]): string => {
  const hasAbc = extras.some((item) => /^abecedario$/i.test(item.name.trim()));
  const hasAcc = extras.some((item) => !/^abecedario$/i.test(item.name.trim()));
  if (hasAcc && !hasAbc) return 'Accesorios: ';
  if (!hasAcc && hasAbc) return '';
  return 'También: ';
};

const drawContents = async (
  pdf: PDFDocument,
  page: PDFPage,
  c: LabelCursor,
  regular: PDFFont,
  bold: PDFFont,
  items: ViaCargoLabelItem[],
) => {
  if (!items.length) return;
  const sellos = items.filter((item) => !item.isAccessory);
  const extras = items.filter((item) => item.isAccessory);

  c.gap(6);
  c.bar('CONTENIDO');

  if (extras.length) {
    const text = toWinAnsiText(extras.map((item) => item.name).join(', '));
    const labelText = extrasLabel(extras);
    const size = 10;
    const labelW = bold.widthOfTextAtSize(labelText, size);
    const { lines, size: fitted } = fitText(text, regular, size, 7, CONTENT_W - labelW, 2);
    const lineH = fitted * 1.25;
    for (let i = 0; i < lines.length; i += 1) {
      const baseline = c.y - fitted;
      if (i === 0 && labelText) {
        page.drawText(labelText, { x: MARGIN_X, y: baseline, size: fitted, font: bold });
      }
      page.drawText(lines[i], { x: MARGIN_X + labelW, y: baseline, size: fitted, font: regular });
      c.gap(lineH);
    }
    c.gap(4);
  }

  const shown = sellos.slice(0, MAX_LOGOS);
  if (!shown.length) return;
  const extraCount = sellos.length - shown.length;
  const bottom = FOOTER_RESERVED;
  const availH = Math.max(0, c.y - bottom);
  const { cols, rows, size } = chooseLogoGrid(shown.length, availH);
  if (size < 12) return;

  const cellW = CONTENT_W / cols;
  const cellH = size + NAME_H + 4;
  const gridH = rows * cellH;
  const top = c.y - Math.max(0, (availH - gridH) / 2);
  const nameSize = Math.min(8, Math.max(5.5, size / 9));

  for (let i = 0; i < shown.length; i += 1) {
    const item = shown[i];
    const row = Math.floor(i / cols);
    const col = i % cols;
    const itemsInRow = Math.min(cols, shown.length - row * cols);
    const rowOffset = ((cols - itemsInRow) * cellW) / 2;
    const cx = MARGIN_X + rowOffset + col * cellW + cellW / 2;
    const boxTop = top - row * cellH;
    const boxBottom = boxTop - size;

    let drewImage = false;
    if (item.imagePng?.length) {
      try {
        const img = await pdf.embedPng(item.imagePng);
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: cx - w / 2, y: boxBottom + (size - h) / 2, width: w, height: h });
        drewImage = true;
      } catch {
        drewImage = false;
      }
    }
    if (!drewImage) {
      page.drawRectangle({
        x: cx - size / 2,
        y: boxBottom,
        width: size,
        height: size,
        borderColor: rgb(0.6, 0.6, 0.6),
        borderWidth: 0.75,
      });
    }

    const name = truncateToWidth(toWinAnsiText(item.name), regular, nameSize, cellW - 4);
    page.drawText(name, {
      x: cx - regular.widthOfTextAtSize(name, nameSize) / 2,
      y: boxBottom - nameSize - 2,
      size: nameSize,
      font: regular,
    });
  }

  if (extraCount > 0) {
    const more = `+${extraCount} sellos mas`;
    page.drawText(more, {
      x: MARGIN_X + CONTENT_W - bold.widthOfTextAtSize(more, 8),
      y: bottom,
      size: 8,
      font: bold,
    });
  }
};

const drawLabel = async (
  pdf: PDFDocument,
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  data: ViaCargoLabelData,
) => {
  const r = VIA_CARGO_REMITENTE;
  const c = new LabelCursor(page, regular, bold);

  c.bar('REMITENTE');
  c.field(null, r.nombre, { size: 12, bold: true });
  c.field('DNI:', r.dni);
  c.field(null, r.domicilio);
  c.field(null, `${r.localidad} - CP ${r.codigoPostal}`);
  c.field('Tel:', r.telefono);
  c.field('Email:', r.email);

  c.gap(8);
  c.dashedDivider();
  c.gap(10);

  const isSucursal = data.tipoEnvio === 'Sucursal';
  c.bar(isSucursal ? 'DESTINATARIO - RETIRA EN SUCURSAL' : 'DESTINATARIO');
  c.field(null, data.nombre, { size: 16, minSize: 11, bold: true, maxLines: 2 });
  c.gap(2);
  c.field('DNI:', data.dni, { size: 12 });
  c.field(isSucursal ? 'Sucursal:' : 'Domicilio:', data.domicilio, { size: 12, minSize: 9, maxLines: 3 });
  c.field('Localidad:', data.localidad, { size: 12, minSize: 9, maxLines: 2 });
  c.field('Provincia:', data.provincia, { size: 12, minSize: 9 });
  c.field('CP:', data.codigoPostal, { size: 14, bold: true });
  c.field('Tel:', data.telefono, { size: 12 });
  c.field('Email:', data.email, { size: 11, minSize: 7 });

  await drawContents(pdf, page, c, regular, bold, data.items ?? []);

  const footer = `VIA CARGO${data.tipoEnvio ? ` - ${data.tipoEnvio}` : ''} - Pedido ${data.orderId.replace(/-/g, '').slice(0, 8)}`;
  page.drawText(footer, {
    x: MARGIN_X,
    y: MARGIN_BOTTOM,
    size: 8,
    font: regular,
    color: rgb(0.3, 0.3, 0.3),
  });
};

/**
 * Rasteriza cualquier imagen (jpg/png/webp/svg renderizable) a PNG para pdf-lib.
 * Devuelve null si no se puede cargar.
 */
export async function loadImageAsPngBytes(url: string): Promise<Uint8Array | null> {
  if (!url || typeof document === 'undefined') return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
        el.src = objectUrl;
      });
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) return null;
      const scale = Math.min(1, LOGO_FETCH_MAX_PX / Math.max(srcW, srcH));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(srcW * scale));
      canvas.height = Math.max(1, Math.round(srcH * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!pngBlob) return null;
      return new Uint8Array(await pngBlob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

type ResolveDisplayUrl = (url: string, mockupSolicitudId?: string | null) => Promise<string>;

/** Arma los ítems de la etiqueta: logos de sellos + texto de accesorios/abecedario. */
export async function buildViaCargoLabelItems(
  orderItems: OrderItem[],
  resolveDisplayUrl: ResolveDisplayUrl,
): Promise<ViaCargoLabelItem[]> {
  const result: ViaCargoLabelItem[] = [];

  for (const item of orderItems) {
    const name = getOrderItemDisplayName(item);
    if (isViaCargoAccessoryItemType(item.itemType)) {
      result.push({ name, isAccessory: true });
      continue;
    }

    const rawUrls = [item.files?.baseUrl, item.files?.vectorPreviewUrl].filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0,
    );
    let imagePng: Uint8Array | null = null;
    for (const raw of rawUrls) {
      try {
        const displayUrl = await resolveDisplayUrl(raw, item.mockupSolicitudId);
        imagePng = await loadImageAsPngBytes(displayUrl);
        if (imagePng?.length) break;
      } catch {
        // Probar el siguiente candidato.
      }
    }
    result.push({ name, isAccessory: false, imagePng });
  }

  return result;
}

/** Un PDF con una etiqueta de 100×152 mm por pedido. */
export async function buildViaCargoLabelsPdf(labels: ViaCargoLabelData[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Etiquetas Via Cargo');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const data of labels) {
    const page = pdf.addPage([VIA_CARGO_LABEL_W_PT, VIA_CARGO_LABEL_H_PT]);
    await drawLabel(pdf, page, regular, bold, data);
  }

  return pdf.save();
}

export function downloadViaCargoLabelsPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
