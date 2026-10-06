import { describe, expect, it } from 'vitest';
import { metaDelDia } from './dinamica';

describe('metaDelDia', () => {
  const meta = { equilibrioSellos: 147, objetivoSellos: 210 };
  it('lo necesario por día se mide desde hoy, sobre los hábiles terminados', () => {
    // Octubre 2026: 21 hábiles (feriado 12). Hoy martes 6: completos 1, 2 y 5 (con el finde).
    const r = metaDelDia({
      meta,
      mes: '2026-10',
      hoy: '2026-10-06',
      feriados: ['2026-10-12'],
      sellosPorDia: [
        { fecha: '2026-10-01', sellos: 9 },
        { fecha: '2026-10-02', sellos: 10 },
        { fecha: '2026-10-03', sellos: 2 },
        { fecha: '2026-10-05', sellos: 8 },
        { fecha: '2026-10-06', sellos: 3 },
      ],
    });
    expect(r.vendidosMes).toBe(32);
    expect(r.vendidosHoy).toBe(3);
    expect(r.hoyEsHabil).toBe(true);
    expect(r.habilesRestantes).toBe(18);
    expect(r.necesarioPorDiaObjetivo).toBeCloseTo((210 - 29) / 18, 6);
    expect(r.necesarioPorDiaEquilibrio).toBeCloseTo((147 - 29) / 18, 6);
    expect(r.zona).toBe('perdida');
  });
  it('un sábado: lo de hoy se imputa al lunes', () => {
    const r = metaDelDia({ meta, mes: '2026-10', hoy: '2026-10-03', feriados: [], sellosPorDia: [{ fecha: '2026-10-03', sellos: 4 }] });
    expect(r.hoyEsHabil).toBe(false);
    expect(r.vendidosHoy).toBe(0);
    expect(r.vendidosMes).toBe(4);
  });
});
