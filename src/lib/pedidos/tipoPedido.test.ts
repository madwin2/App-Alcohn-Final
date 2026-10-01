import { describe, expect, it } from 'vitest';
import {
  esOrdenSinCargo,
  esPruebaCerrada,
  itemCuentaComoVenta,
  ordenCuentaComoVenta,
  orderTypeLabel,
} from './tipoPedido';
import type { Order, OrderItem } from '@/lib/types/index';

const baseItem = (overrides: Partial<OrderItem> = {}): OrderItem =>
  ({
    id: 'i1',
    orderId: 'o1',
    designName: 'Test',
    requestedWidthMm: 40,
    requestedHeightMm: 30,
    stampType: 'CLASICO',
    fabricationState: 'SIN_HACER',
    isPriority: false,
    saleState: 'SEÑADO',
    shippingState: 'SIN_ENVIO',
    paidAmountItemCached: 0,
    balanceItemCached: 0,
    contact: { channel: 'WHATSAPP', phoneE164: '+54911' },
    isGift: false,
    ...overrides,
  }) as OrderItem;

const baseOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: 'o1',
    customer: { id: 'c1', firstName: 'A', lastName: 'B', phoneE164: '+54911' },
    orderDate: '2026-10-01',
    totalValue: 0,
    paidAmountCached: 0,
    balanceAmountCached: 0,
    shipping: { carrier: null, service: null, origin: 'ENTREGA_EN_SUCURSAL' },
    orderType: 'VENTA',
    items: [baseItem()],
    ...overrides,
  }) as Order;

describe('itemCuentaComoVenta', () => {
  it('cuenta ítems normales de una venta', () => {
    expect(itemCuentaComoVenta(baseOrder(), baseItem())).toBe(true);
  });

  it('no cuenta ítems regalo dentro de una venta', () => {
    expect(itemCuentaComoVenta(baseOrder(), baseItem({ isGift: true }))).toBe(false);
  });

  it('no cuenta nada de prueba ni regalo aparte', () => {
    expect(itemCuentaComoVenta(baseOrder({ orderType: 'PRUEBA' }), baseItem())).toBe(false);
    expect(itemCuentaComoVenta(baseOrder({ orderType: 'REGALO' }), baseItem({ isGift: true }))).toBe(
      false,
    );
  });

  it('trata orderType ausente como Venta', () => {
    expect(itemCuentaComoVenta(baseOrder({ orderType: undefined }), baseItem())).toBe(true);
  });
});

describe('ordenCuentaComoVenta', () => {
  it('solo Venta', () => {
    expect(ordenCuentaComoVenta(baseOrder())).toBe(true);
    expect(ordenCuentaComoVenta(baseOrder({ orderType: 'PRUEBA' }))).toBe(false);
    expect(ordenCuentaComoVenta(baseOrder({ orderType: 'REGALO' }))).toBe(false);
  });
});

describe('esPruebaCerrada', () => {
  it('requiere tipo Prueba y todos Hecho', () => {
    expect(esPruebaCerrada(baseOrder({ orderType: 'PRUEBA' }))).toBe(false);
    expect(
      esPruebaCerrada(
        baseOrder({
          orderType: 'PRUEBA',
          items: [baseItem({ fabricationState: 'HECHO' }), baseItem({ id: 'i2', fabricationState: 'HECHO' })],
        }),
      ),
    ).toBe(true);
    expect(
      esPruebaCerrada(
        baseOrder({
          orderType: 'PRUEBA',
          items: [baseItem({ fabricationState: 'HECHO' }), baseItem({ id: 'i2', fabricationState: 'HACIENDO' })],
        }),
      ),
    ).toBe(false);
    expect(
      esPruebaCerrada(baseOrder({ orderType: 'VENTA', items: [baseItem({ fabricationState: 'HECHO' })] })),
    ).toBe(false);
  });
});

describe('esOrdenSinCargo / orderTypeLabel', () => {
  it('marca prueba y regalo como sin cargo', () => {
    expect(esOrdenSinCargo(baseOrder({ orderType: 'PRUEBA' }))).toBe(true);
    expect(esOrdenSinCargo(baseOrder({ orderType: 'REGALO' }))).toBe(true);
    expect(esOrdenSinCargo(baseOrder())).toBe(false);
  });

  it('etiqueta legible', () => {
    expect(orderTypeLabel('VENTA')).toBe('Venta');
    expect(orderTypeLabel('PRUEBA')).toBe('Prueba');
    expect(orderTypeLabel('REGALO')).toBe('Regalo');
  });
});
