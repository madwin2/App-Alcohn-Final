import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  VIA_CARGO_LABEL_H_PT,
  VIA_CARGO_LABEL_W_PT,
  buildViaCargoLabelsPdf,
  isViaCargoAccessoryItemType,
  toWinAnsiText,
  type ViaCargoLabelData,
} from './viaCargoLabelPdf';

/** PNG 1×1 negro válido. */
const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const label = (overrides: Partial<ViaCargoLabelData> = {}): ViaCargoLabelData => ({
  orderId: '0b7c1f3e-1111-2222-3333-444455556666',
  tipoEnvio: 'Domicilio',
  nombre: 'María José Gobbi',
  dni: '30123456',
  domicilio: 'Av. Siempre Viva 742, piso 3, depto B',
  localidad: 'San Carlos de Bariloche',
  provincia: 'Río Negro',
  codigoPostal: '8400',
  telefono: '5492944123456',
  email: 'cliente@example.com',
  ...overrides,
});

describe('buildViaCargoLabelsPdf', () => {
  it('arma una página de 100×152 mm por pedido', async () => {
    const bytes = await buildViaCargoLabelsPdf([label(), label({ tipoEnvio: 'Sucursal' })]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(VIA_CARGO_LABEL_W_PT, 1);
    expect(height).toBeCloseTo(VIA_CARGO_LABEL_H_PT, 1);
  });

  it('no falla con datos vacíos, muy largos o con caracteres fuera de WinAnsi', async () => {
    const bytes = await buildViaCargoLabelsPdf([
      label({ dni: '', email: '', telefono: '', tipoEnvio: null }),
      label({
        nombre: 'Nombre 🙂 extremadamente largo para la etiqueta con muchos apellidos compuestos',
        domicilio: 'Calle '.repeat(40),
        email: 'una.direccion.de.correo.larguisima.de.verdad@dominio-muy-largo.com.ar',
      }),
    ]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('incluye logos de sellos y texto de accesorios sin romper el PDF', async () => {
    const bytes = await buildViaCargoLabelsPdf([
      label({
        tipoEnvio: 'Sucursal',
        items: [
          { name: 'DIJON', isAccessory: false, imagePng: PNG_1X1 },
          { name: 'Superflag', isAccessory: false, imagePng: PNG_1X1 },
          { name: 'Narrow', isAccessory: false },
          { name: 'Mango de golpe', isAccessory: true },
          { name: 'Soldador 60W', isAccessory: true },
        ],
      }),
    ]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe('toWinAnsiText', () => {
  it('conserva tildes y eñes y descarta lo que Helvetica no puede dibujar', () => {
    expect(toWinAnsiText('  Peña   Ñandú ')).toBe('Peña Ñandú');
    expect(toWinAnsiText('Hola 🙂 Ştefan')).toBe('Hola Stefan');
  });
});

describe('isViaCargoAccessoryItemType', () => {
  it('marca accesorios y abecedario, no sellos', () => {
    expect(isViaCargoAccessoryItemType('SELLO')).toBe(false);
    expect(isViaCargoAccessoryItemType('MANGO_GOLPE')).toBe(true);
    expect(isViaCargoAccessoryItemType('SOLDADOR')).toBe(true);
    expect(isViaCargoAccessoryItemType('BASE_REMACHADORA')).toBe(true);
    expect(isViaCargoAccessoryItemType('ABECEDARIO')).toBe(true);
  });
});
