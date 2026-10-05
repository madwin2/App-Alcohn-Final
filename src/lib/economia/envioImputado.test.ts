import { describe, expect, it } from 'vitest';
import type { Order, OrderItem } from '@/lib/types';
import {
  ECONOMIA_ENVIO_SIN_TIPO_ARS,
  economiaEnvioImputadoArs,
  ordenAndreaniConLinkAsignado,
} from './envioImputado';

function item(shippingState: OrderItem['shippingState']): OrderItem {
  return {
    id: 'i1',
    orderId: 'o1',
    designName: 'Test',
    requestedWidthMm: 20,
    requestedHeightMm: 20,
    quantity: 1,
    itemValue: 50000,
    depositValueItem: 20000,
    fabricationState: 'HECHO',
    saleState: 'TRANSFERIDO',
    shippingState,
    stampType: 'PLANO',
  } as unknown as OrderItem;
}

function order(partial: Partial<Order> & { shippingState?: OrderItem['shippingState'] }): Order {
  const shippingState = partial.shippingState ?? 'SEGUIMIENTO_ENVIADO';
  const { shippingState: _s, ...rest } = partial;
  return {
    id: 'o1',
    orderNumber: 1,
    createdAt: '2026-01-01',
    customer: { id: 'c1', name: 'Cliente', phone: '111' },
    totalValue: 50000,
    depositTotal: 20000,
    restPaidAmountOrder: 30000,
    saleState: 'TRANSFERIDO',
    shipping: {
      carrier: 'ANDREANI',
      service: 'SUCURSAL',
      origin: 'ENTREGA_EN_SUCURSAL',
      trackingNumber: null,
    },
    items: [item(shippingState)],
    ...rest,
  } as unknown as Order;
}

describe('ordenAndreaniConLinkAsignado', () => {
  it('detecta link actual o histórico', () => {
    expect(ordenAndreaniConLinkAsignado(order({ andreaniLinkUrl: 'https://andreani.com/x' }))).toBe(true);
    expect(ordenAndreaniConLinkAsignado(order({ andreaniTuvoLink: true }))).toBe(true);
    expect(ordenAndreaniConLinkAsignado(order({}))).toBe(false);
    expect(
      ordenAndreaniConLinkAsignado(
        order({
          shipping: {
            carrier: 'CORREO_ARGENTINO',
            service: 'SUCURSAL',
            origin: 'ENTREGA_EN_SUCURSAL',
          },
          andreaniLinkUrl: 'https://andreani.com/x',
        }),
      ),
    ).toBe(false);
  });
});

describe('economiaEnvioImputadoArs', () => {
  it('no imputa envío Andreani con link (plata no entra)', () => {
    const costs = { o1: 5000 };
    expect(economiaEnvioImputadoArs(order({ andreaniLinkUrl: 'https://x' }), costs)).toBe(0);
    expect(economiaEnvioImputadoArs(order({ andreaniTuvoLink: true }), costs)).toBe(0);
  });

  it('sí imputa Andreani sin link y Correo', () => {
    const costs = { o1: 5000 };
    expect(economiaEnvioImputadoArs(order({}), costs)).toBe(5000);
    expect(
      economiaEnvioImputadoArs(
        order({
          shipping: {
            carrier: 'CORREO_ARGENTINO',
            service: 'DOMICILIO',
            origin: 'ENTREGA_EN_SUCURSAL',
          },
        }),
        { o1: 9000 },
      ),
    ).toBe(9000);
  });

  it('no imputa si el pedido aún no despachó', () => {
    expect(
      economiaEnvioImputadoArs(order({ shippingState: 'ETIQUETA_LISTA', andreaniLinkUrl: null }), {
        o1: 5000,
      }),
    ).toBe(0);
  });

  it('usa default si no hay carrier/servicio', () => {
    expect(
      economiaEnvioImputadoArs(
        order({
          shipping: { carrier: null, service: null, origin: 'ENTREGA_EN_SUCURSAL' },
        }),
        {},
      ),
    ).toBe(ECONOMIA_ENVIO_SIN_TIPO_ARS);
  });
});
