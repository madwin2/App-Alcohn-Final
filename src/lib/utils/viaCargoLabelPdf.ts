import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

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
}

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

const drawLabel = (page: PDFPage, regular: PDFFont, bold: PDFFont, data: ViaCargoLabelData) => {
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

  const footer = `VIA CARGO${data.tipoEnvio ? ` - ${data.tipoEnvio}` : ''} - Pedido ${data.orderId.replace(/-/g, '').slice(0, 8)}`;
  page.drawText(footer, {
    x: MARGIN_X,
    y: MARGIN_BOTTOM,
    size: 8,
    font: regular,
    color: rgb(0.3, 0.3, 0.3),
  });
};

/** Un PDF con una etiqueta de 100×152 mm por pedido. */
export async function buildViaCargoLabelsPdf(labels: ViaCargoLabelData[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Etiquetas Via Cargo');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const data of labels) {
    const page = pdf.addPage([VIA_CARGO_LABEL_W_PT, VIA_CARGO_LABEL_H_PT]);
    drawLabel(page, regular, bold, data);
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
