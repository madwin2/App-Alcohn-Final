import { describe, expect, it } from 'vitest';
import {
  cortarMetros,
  elegirPieza,
  formatCortes,
  parseCortes,
  resumenAncho,
  sugerirCompra,
  type BroncePieza,
} from './stock';

const pieza = (id: string, largoMm: number, anchoRef: BroncePieza['anchoRef'] = 25, estado: BroncePieza['estado'] = 'disponible'): BroncePieza =>
  ({ id, anchoRef, largoMm, estado });

describe('elegirPieza', () => {
  const piezas = [pieza('a', 400), pieza('b', 180), pieza('c', 120), pieza('d', 20, 25, 'retazo'), pieza('e', 300, 38)];

  it('elige la más corta en la que entra la fila', () => {
    expect(elegirPieza(piezas, 25, 'C', 100)?.pieza.id).toBe('c');
    expect(elegirPieza(piezas, 25, 'C', 150)?.pieza.id).toBe('b');
    expect(elegirPieza(piezas, 25, 'C', 200)?.pieza.id).toBe('a');
  });

  it('no usa retazos ni otro ancho, y devuelve null si nada alcanza', () => {
    expect(elegirPieza(piezas, 25, 'C', 10)?.pieza.id).toBe('c');
    expect(elegirPieza(piezas, 25, 'C', 401)).toBeNull();
  });

  it('en la G prefiere piezas de hasta 250 y si no hay usa una más larga (sobresale)', () => {
    const g = [pieza('larga', 400, 38), pieza('corta', 200, 38)];
    expect(elegirPieza(g, 38, 'G', 150)).toEqual({ pieza: g[1], sobresale: false });
    expect(elegirPieza(g, 38, 'G', 220)).toEqual({ pieza: g[0], sobresale: true });
  });

  it('en la C nunca pasa el máximo de 400', () => {
    expect(elegirPieza([pieza('x', 500)], 25, 'C', 100)).toBeNull();
  });
});

describe('resumenAncho', () => {
  it('separa filas completas y parciales por máquina', () => {
    const r = resumenAncho([pieza('a', 400, 38), pieza('b', 180, 38), pieza('c', 20, 38, 'retazo'), pieza('d', 300, 38)], 38);
    expect(r.utilMm).toBe(880);
    expect(r.retazos).toBe(1);
    expect(r.porMaquina).toEqual([
      { maquina: 'C', maxMm: 400, completas: 1, parciales: [300, 180] },
      { maquina: 'G', maxMm: 250, completas: 2, parciales: [180] },
    ]);
  });
});

describe('compra', () => {
  it('corta por metro con el largo de cada ancho', () => {
    expect(cortarMetros(1, 400)).toEqual([400, 400, 200]);
    expect(cortarMetros(1, 250)).toEqual([250, 250, 250, 250]);
    expect(formatCortes([400, 400, 200])).toBe('2 × 400 + 1 × 200');
  });

  it('avisa cuando la cobertura baja del umbral y sugiere metros', () => {
    // 600 mm en 60 días = 10 mm/día; 50 mm útiles = 5 días.
    const s = sugerirCompra({ anchoRef: 25, utilMm: 50, consumoMm: 600 });
    expect(s.avisar).toBe(true);
    expect(s.coberturaDias).toBeCloseTo(5);
    expect(s.metros).toBe(1);
    expect(s.cortes).toEqual([400, 400, 200]);
  });

  it('no avisa sin consumo', () => {
    expect(sugerirCompra({ anchoRef: 63, utilMm: 0, consumoMm: 0 }).avisar).toBe(false);
  });
});

describe('parseCortes', () => {
  it('lee los formatos habituales', () => {
    expect(parseCortes('2x400 + 1x200')).toEqual([400, 400, 200]);
    expect(parseCortes('2 × 400, 200')).toEqual([400, 400, 200]);
    expect(parseCortes('400 400 250mm')).toEqual([400, 400, 250]);
  });

  it('rechaza texto que no entiende', () => {
    expect(() => parseCortes('')).toThrow();
    expect(() => parseCortes('dos de 400')).toThrow();
    expect(() => parseCortes('3000')).toThrow();
  });
});
