import { describe, expect, it } from 'vitest';
import { diaHabilImputado, diasHabilesDelMes, esDiaHabil, resumenHabiles, ventasPorDiaHabil } from './diasHabiles';

// Octubre 2026: jueves 1; feriado lunes 12 (Diversidad Cultural).
const FERIADOS = new Set(['2026-10-12']);
const HABILES_OCT = diasHabilesDelMes('2026-10', FERIADOS);

describe('días hábiles', () => {
  it('excluye sábados, domingos y feriados', () => {
    expect(esDiaHabil('2026-10-02', FERIADOS)).toBe(true); // viernes
    expect(esDiaHabil('2026-10-03', FERIADOS)).toBe(false); // sábado
    expect(esDiaHabil('2026-10-04', FERIADOS)).toBe(false); // domingo
    expect(esDiaHabil('2026-10-12', FERIADOS)).toBe(false); // feriado
    expect(HABILES_OCT).toHaveLength(21); // 22 días de semana − 1 feriado
    expect(HABILES_OCT[0]).toBe('2026-10-01');
    expect(HABILES_OCT[HABILES_OCT.length - 1]).toBe('2026-10-30');
  });

  it('imputa lo no hábil al próximo hábil, o al último si el mes terminó', () => {
    expect(diaHabilImputado('2026-10-03', HABILES_OCT)).toBe('2026-10-05');
    expect(diaHabilImputado('2026-10-10', HABILES_OCT)).toBe('2026-10-13'); // sábado + domingo + feriado
    expect(diaHabilImputado('2026-10-31', HABILES_OCT)).toBe('2026-10-30'); // sábado 31: no hay hábil después
    expect(diaHabilImputado('2026-10-01', [])).toBeNull();
  });

  it('resumen al día de hoy', () => {
    expect(resumenHabiles(HABILES_OCT, '2026-10-06')).toEqual({ total: 21, completos: 3, restantes: 18, hoyEsHabil: true });
    expect(resumenHabiles(HABILES_OCT, '2026-10-04')).toEqual({ total: 21, completos: 2, restantes: 19, hoyEsHabil: false });
  });

  it('agrupa ventas de fin de semana en el lunes', () => {
    const r = ventasPorDiaHabil(
      [
        { fecha: '2026-10-02', ventas: 100, pedidos: 1, items: 2, sellos: 1 },
        { fecha: '2026-10-03', ventas: 50, pedidos: 1, items: 1, sellos: 1 },
        { fecha: '2026-10-04', ventas: 30, pedidos: 1, items: 1, sellos: 0 },
        { fecha: '2026-10-05', ventas: 200, pedidos: 2, items: 3, sellos: 3 },
      ],
      HABILES_OCT,
    );
    expect(r).toHaveLength(21);
    expect(r[1]).toEqual({ fecha: '2026-10-02', ventas: 100, pedidos: 1, items: 2, sellos: 1, trasladadasDe: [] });
    expect(r[2]).toEqual({ fecha: '2026-10-05', ventas: 280, pedidos: 4, items: 5, sellos: 4, trasladadasDe: ['2026-10-03', '2026-10-04'] });
  });
});
