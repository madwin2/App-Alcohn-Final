import { describe, expect, it } from 'vitest';
import { buildSellosFromWebCheckout, resolveWebSelloTipo } from './webCart';

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
