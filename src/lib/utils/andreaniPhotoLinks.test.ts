import { describe, expect, it } from 'vitest';
import {
  isEmpresaAndreani,
  itemRequiresClientPhoto,
  orderIdsNeedingAndreaniLink,
  type StampForAndreaniPhotoCheck,
} from './andreaniPhotoLinks';

const stamps = (
  orderId: string,
  items: Array<{
    id: string;
    hasPhoto?: boolean;
    requiresPhoto?: boolean;
    isHecho?: boolean;
  }>,
): StampForAndreaniPhotoCheck[] =>
  items.map((item) => ({
    id: item.id,
    ordenId: orderId,
    hasPhoto: Boolean(item.hasPhoto),
    requiresPhoto: item.requiresPhoto !== false,
    isHecho: item.isHecho !== false,
  }));

describe('isEmpresaAndreani', () => {
  it('detecta Andreani aunque varíe mayúsculas', () => {
    expect(isEmpresaAndreani('Andreani')).toBe(true);
    expect(isEmpresaAndreani('ANDREANI')).toBe(true);
    expect(isEmpresaAndreani('Andreani sucursal')).toBe(true);
  });

  it('no toma correo ni retiro', () => {
    expect(isEmpresaAndreani('Correo Argentino')).toBe(false);
    expect(isEmpresaAndreani('Retiro')).toBe(false);
    expect(isEmpresaAndreani(null)).toBe(false);
  });
});

describe('itemRequiresClientPhoto', () => {
  it('sellos y abecedarios requieren foto', () => {
    expect(itemRequiresClientPhoto('SELLO')).toBe(true);
    expect(itemRequiresClientPhoto('ABECEDARIO')).toBe(true);
    expect(itemRequiresClientPhoto(null)).toBe(true);
  });

  it('accesorios no requieren foto en la app', () => {
    expect(itemRequiresClientPhoto('SOLDADOR')).toBe(false);
    expect(itemRequiresClientPhoto('MANGO_GOLPE')).toBe(false);
    expect(itemRequiresClientPhoto('BASE_REMACHADORA')).toBe(false);
  });
});

describe('orderIdsNeedingAndreaniLink', () => {
  it('no pide link si el pedido no es Andreani', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s1'],
      stamps: stamps('o1', [{ id: 's1' }]),
      andreaniOrderIds: [],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual([]);
  });

  it('pide un link cuando se completa el último sello de un pedido Andreani todo Hecho', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s2'],
      stamps: stamps('o1', [{ id: 's1', hasPhoto: true }, { id: 's2' }]),
      andreaniOrderIds: ['o1'],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual(['o1']);
  });

  it('no pide link si todavía queda otro sello sin foto', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s1'],
      stamps: stamps('o1', [{ id: 's1' }, { id: 's2' }]),
      andreaniOrderIds: ['o1'],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual([]);
  });

  it('pide un solo link si se asignan todos los sellos del mismo pedido', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s1', 's2'],
      stamps: stamps('o1', [{ id: 's1' }, { id: 's2' }]),
      andreaniOrderIds: ['o1'],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual(['o1']);
  });

  it('no pide link si el pedido ya tiene uno fresco', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s1'],
      stamps: stamps('o1', [{ id: 's1' }]),
      andreaniOrderIds: ['o1'],
      orderIdsWithFreshLink: ['o1'],
    });
    expect(ids).toEqual([]);
  });

  it('pide un link por cada pedido Andreani que se completa', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['a1', 'b1'],
      stamps: [
        ...stamps('oa', [{ id: 'a1' }]),
        ...stamps('ob', [{ id: 'b1' }]),
        ...stamps('oc', [{ id: 'c1' }]),
      ],
      andreaniOrderIds: ['oa', 'ob'],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual(['oa', 'ob']);
  });

  it('no pide link si hay un accesorio todavía sin Hecho', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s1'],
      stamps: stamps('o1', [
        { id: 's1' },
        { id: 'acc1', requiresPhoto: false, isHecho: false, hasPhoto: false },
      ]),
      andreaniOrderIds: ['o1'],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual([]);
  });

  it('pide link si el accesorio ya está Hecho aunque no tenga foto', () => {
    const ids = orderIdsNeedingAndreaniLink({
      assigningStampIds: ['s1'],
      stamps: stamps('o1', [
        { id: 's1' },
        { id: 'acc1', requiresPhoto: false, isHecho: true, hasPhoto: false },
      ]),
      andreaniOrderIds: ['o1'],
      orderIdsWithFreshLink: [],
    });
    expect(ids).toEqual(['o1']);
  });
});
