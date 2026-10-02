import { describe, expect, it } from 'vitest';
import { contarDiasHabiles, listarDiasHabiles } from './diasHabiles';

describe('contarDiasHabiles', () => {
  it('cuenta lunes a viernes en un rango simple', () => {
    // Lun 5 oct 2026 → Vie 9 oct 2026 = 5
    expect(contarDiasHabiles('2026-10-05', '2026-10-09', [])).toBe(5);
  });

  it('excluye fin de semana', () => {
    // Vie 9 → Lun 12 = vie + lun = 2 (sáb/dom fuera)
    expect(contarDiasHabiles('2026-10-09', '2026-10-12', [])).toBe(2);
  });

  it('excluye feriados', () => {
    // Lun 5 → Vie 9 con miércoles feriado → 4
    expect(contarDiasHabiles('2026-10-05', '2026-10-09', ['2026-10-07'])).toBe(4);
  });

  it('rango solo fin de semana → 0', () => {
    expect(contarDiasHabiles('2026-10-10', '2026-10-11', [])).toBe(0);
  });

  it('rango que cruza el año', () => {
    // Vie 25 dic 2026 → Lun 5 ene 2027
    // hábil: 28,29,30 dic + 1? 1 ene feriado, 2? sáb=0, 4? wait
    // 25 vie, 28 lun, 29 mar, 30 mié, 31 jue, 1 ene (vie) feriado, 2 sáb, 3 dom, 4 lun, 5 mar
    const feriados = ['2026-12-25', '2027-01-01'];
    // desde 28/12 (lun) a 5/1: 28,29,30,31, (1 feriado), 4,5 = 6
    expect(contarDiasHabiles('2026-12-28', '2027-01-05', feriados)).toBe(6);
  });

  it('listarDiasHabiles coincide con el conteo', () => {
    const feriados = ['2026-10-07'];
    const list = listarDiasHabiles('2026-10-05', '2026-10-09', feriados);
    expect(list).toEqual(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09']);
    expect(list.length).toBe(contarDiasHabiles('2026-10-05', '2026-10-09', feriados));
  });
});
