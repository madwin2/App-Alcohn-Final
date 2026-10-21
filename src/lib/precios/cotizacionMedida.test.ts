import { describe, expect, it } from 'vitest';
import { parseMedidaMmAString } from './cotizacionMedida';

describe('parseMedidaMmAString', () => {
  it('acepta el formato mostrado en la tabla de pedidos (50×30mm)', () => {
    expect(parseMedidaMmAString('50×30mm')).toEqual({ anchoMm: 50, altoMm: 30 });
  });

  it('acepta la x común del teclado, con o sin espacios', () => {
    expect(parseMedidaMmAString('50x30')).toEqual({ anchoMm: 50, altoMm: 30 });
    expect(parseMedidaMmAString('50 x 30 mm')).toEqual({ anchoMm: 50, altoMm: 30 });
    expect(parseMedidaMmAString('50X30')).toEqual({ anchoMm: 50, altoMm: 30 });
  });

  it('acepta decimales con coma o punto y los ordena largo × corto', () => {
    expect(parseMedidaMmAString('25×35,5')).toEqual({ anchoMm: 36, altoMm: 25 });
    expect(parseMedidaMmAString('35.5x25')).toEqual({ anchoMm: 36, altoMm: 25 });
  });

  it('una sola medida es un cuadrado', () => {
    expect(parseMedidaMmAString('40')).toEqual({ anchoMm: 40, altoMm: 40 });
  });

  it('rechaza texto sin medida válida', () => {
    expect(parseMedidaMmAString('grande')).toBeNull();
    expect(parseMedidaMmAString('')).toBeNull();
    expect(parseMedidaMmAString('0x30')).toBeNull();
  });
});
