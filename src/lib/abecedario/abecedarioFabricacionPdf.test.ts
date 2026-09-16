import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Order, OrderItem } from '@/lib/types';
import { generateAbecedarioHojaFabricacionPdf } from './abecedarioFabricacionPdf';

const templateBytes = new Uint8Array(readFileSync('public/abecedario/hoja-fabricacion.pdf'));

const abcItem: OrderItem = {
  id: 'abc-1',
  orderId: 'ord-1',
  designName: 'Abecedario',
  requestedWidthMm: 1,
  requestedHeightMm: 1,
  stampType: 'ABC',
  itemType: 'ABECEDARIO',
  itemConfig: {
    abecedarioTipografia: 'Didot',
    abecedarioAlturaMm: 25,
    abecedarioMayusculas: 2,
    abecedarioMinusculas: 1,
    abecedarioExtraLetterCounts: { A: 2, E: 1, Z: 1 },
    abecedarioSpecialCharsCount: 3,
    abecedarioSpecialCharsDescription: 'ñ, ü y @',
  },
  notes: 'Hacer con relieve suave',
  fabricationState: 'SIN_HACER',
  isPriority: false,
  saleState: 'SEÑADO',
  shippingState: 'SIN_ENVIO',
  paidAmountItemCached: 0,
  balanceItemCached: 0,
  contact: { channel: 'WHATSAPP', phoneE164: '5491100000000' },
};

const selloItem: OrderItem = {
  ...abcItem,
  id: 'sello-1',
  itemType: 'SELLO',
  stampType: 'CLASICO',
  designName: 'Logo cafe',
  itemConfig: undefined,
  notes: undefined,
};

const order: Order = {
  id: 'ord-1',
  customer: {
    id: 'c1',
    firstName: 'Ana',
    lastName: 'Perez',
    phoneE164: '5491100000000',
  },
  orderDate: '2026-09-16',
  totalValue: 100,
  paidAmountCached: 0,
  balanceAmountCached: 100,
  shipping: { carrier: 'ANDREANI', service: 'DOMICILIO', origin: 'ENTREGA_EN_SUCURSAL' },
  items: [abcItem, selloItem],
};

describe('generateAbecedarioHojaFabricacionPdf', () => {
  it('arma un PDF con los datos del abecedario', async () => {
    const bytes = await generateAbecedarioHojaFabricacionPdf(order, [abcItem], templateBytes);
    expect(bytes.byteLength).toBeGreaterThan(500);
    const header = new TextDecoder('latin1').decode(bytes.slice(0, 8));
    expect(header.startsWith('%PDF-')).toBe(true);
  });
});
