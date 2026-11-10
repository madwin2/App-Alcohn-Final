import { describe, expect, it } from 'vitest';
import { buildSellosFromWebCheckout, resolveWebItemType, resolveWebSelloTipo } from './webCart';

describe('resolveWebSelloTipo', () => {
  it('usa el process del carrito web', () => {
    expect(resolveWebSelloTipo({ process: 'Alimento' })).toBe('Alimento');
    expect(resolveWebSelloTipo({ process: 'Lacre' })).toBe('Lacre');
    expect(resolveWebSelloTipo({ process: 'CNC' })).toBe('Clasico');
    expect(resolveWebSelloTipo({})).toBe('Clasico');
  });

  it('llega a los sellos de un pedido web', () => {
    const sellos = buildSellosFromWebCheckout({
      ordenId: 'orden-1',
      carritoJson: [
        { title: 'Sello personalizado (Pan, 4x4cm)', price: 80000, qty: 1, variantSize: '4x4cm', process: 'Alimento' },
      ],
      metodoPago: 'Transferencia',
      seniaMonto: 30000,
    });
    expect(sellos[0].tipo).toBe('Alimento');
  });
});

describe('accesorios del carrito web', () => {
  const mockup = {
    id: 'mockup-1',
    imagen_optimizada_url: 'https://cdn/base.png',
    nombre_muestra: 'Logo Pan',
    medidas_cotizacion_json: [{ size: '4x4cm' }],
  } as never;

  it('carrito con sello + soldador + mango: cada uno con su item_type', () => {
    const sellos = buildSellosFromWebCheckout({
      ordenId: 'orden-2',
      carritoJson: [
        { id: 'a', title: 'Sello personalizado', price: 80000, qty: 1, variantSize: '4x4cm', process: 'CNC', designSlug: 'personalizado-x', collection: 'Personalizado' },
        { id: 'b', title: 'Calentador Eléctrico', price: 75000, qty: 1, variantSize: 'Único', designSlug: 'calentador-electrico', collection: 'Accesorios', item_type: 'SOLDADOR' },
        { id: 'c', title: 'Mango Metálico', price: 25000, qty: 1, variantSize: 'Único', designSlug: 'mango-de-golpe', collection: 'Accesorios', item_type: 'MANGO_GOLPE' },
      ],
      metodoPago: 'Transferencia',
      seniaMonto: 30000,
      mockup,
      mockupSolicitudId: 'mockup-1',
    });

    expect(sellos.map((s) => s.item_type)).toEqual(['SELLO', 'SOLDADOR', 'MANGO_GOLPE']);

    const [sello, soldador, mango] = sellos;
    expect(sello.mockup_solicitud_id).toBe('mockup-1');
    expect(sello.archivo_base).toBe('https://cdn/base.png');
    expect(sello.ancho_real).toBe(4);

    for (const acc of [soldador, mango]) {
      expect(acc.tipo).toBe('Clasico');
      expect(acc.ancho_real).toBeNull();
      expect(acc.largo_real).toBeNull();
      expect(acc.archivo_base).toBeNull();
      expect(acc.mockup_solicitud_id).toBeNull();
    }
    expect(soldador.diseno).toBe('Calentador Eléctrico');
    expect(soldador.item_config).toMatchObject({
      item_type: 'SOLDADOR',
      accessory_code: 'soldador',
      accessory_slug: 'calentador-electrico',
      soldadorPower: '200W',
    });
    expect(mango.diseno).toBe('Mango Metálico');
    expect(mango.item_config).toMatchObject({
      item_type: 'MANGO_GOLPE',
      accessory_code: 'mango_golpe',
      accessory_slug: 'mango-de-golpe',
    });
    expect(mango.item_config).not.toHaveProperty('soldadorPower');
    // Valores y seña: mismo reparto que antes (secuencial hasta agotar).
    expect(sellos.map((s) => s.valor)).toEqual([80000, 75000, 25000]);
    expect(sellos.map((s) => s.senia)).toEqual([30000, 0, 0]);
  });

  it('respeta item_type explícito aunque el slug no sea del catálogo', () => {
    expect(resolveWebItemType({ item_type: 'BASE_REMACHADORA', designSlug: 'otro' })).toBe('BASE_REMACHADORA');
    expect(resolveWebItemType({ item_type: 'ABECEDARIO' })).toBe('ABECEDARIO');
    // item_type inválido: se ignora y cae a la heurística.
    expect(resolveWebItemType({ item_type: 'CUALQUIERA', designSlug: 'mango-de-golpe' })).toBe('MANGO_GOLPE');

    const [base] = buildSellosFromWebCheckout({
      ordenId: 'orden-3',
      carritoJson: [{ title: 'Base remachadora', price: 40000, item_type: 'BASE_REMACHADORA' }],
      metodoPago: 'Transferencia',
      seniaMonto: 0,
    });
    expect(base.item_type).toBe('BASE_REMACHADORA');
    expect(base.tipo).toBe('Clasico');
    expect(base.diseno).toBe('Base remachadora');
    expect(base.item_config).toMatchObject({ accessory_slug: 'base-aluminio-remachadora' });
  });

  it('sin item_type detecta accesorios por slug y abecedario', () => {
    expect(resolveWebItemType({ designSlug: 'calentador-electrico' })).toBe('SOLDADOR');
    expect(resolveWebItemType({ designSlug: 'base-aluminio-remachadora' })).toBe('BASE_REMACHADORA');
    expect(resolveWebItemType({ collection: 'Accesorios', title: 'Soldador eléctrico' })).toBe('SOLDADOR');
    expect(resolveWebItemType({ designSlug: 'sol-de-mayo', collection: 'Patrio' })).toBe('SELLO');

    const sellos = buildSellosFromWebCheckout({
      ordenId: 'orden-4',
      carritoJson: [
        { title: 'Calentador', price: 75000, qty: 2, designSlug: 'calentador-electrico' },
        { title: 'Abecedario 10mm', price: 120000, designSlug: 'abecedario-10mm', process: 'CNC' },
      ],
      metodoPago: 'Transferencia',
      seniaMonto: 20000,
      mockup,
      mockupSolicitudId: 'mockup-1',
      disenoNombre: 'Logo Pan',
    });
    expect(sellos.map((s) => s.item_type)).toEqual(['SOLDADOR', 'SOLDADOR', 'ABECEDARIO']);
    expect(sellos[0].diseno).toBe('Calentador Eléctrico');
    expect(sellos[0].item_config).toMatchObject({ soldadorPower: '200W' });
    const abc = sellos[2];
    expect(abc.tipo).toBe('ABC');
    expect(abc.mockup_solicitud_id).toBeNull();
    expect(abc.archivo_base).toBeNull();
    expect(abc.diseno).toBe('Abecedario 10mm');
  });
});
