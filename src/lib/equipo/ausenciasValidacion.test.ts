import { describe, expect, it } from 'vitest';
import {
  aniosDelRango,
  ausenciasPropiasSuperpuestas,
  fechaNoPermitidaParaNoAdmin,
} from './ausenciasValidacion';

describe('fechaNoPermitidaParaNoAdmin', () => {
  it('hoy y pasado no se permiten; mañana sí', () => {
    expect(fechaNoPermitidaParaNoAdmin('2026-10-05', '2026-10-05')).toBe(true);
    expect(fechaNoPermitidaParaNoAdmin('2026-10-04', '2026-10-05')).toBe(true);
    expect(fechaNoPermitidaParaNoAdmin('2026-10-06', '2026-10-05')).toBe(false);
  });
});

describe('aniosDelRango', () => {
  it('rango dentro de un año', () => {
    expect(aniosDelRango('2027-02-15', '2027-02-19')).toEqual([2027]);
  });
  it('rango que cruza de año', () => {
    expect(aniosDelRango('2026-12-28', '2027-01-04')).toEqual([2026, 2027]);
  });
  it('rango invertido devuelve vacío', () => {
    expect(aniosDelRango('2027-02-15', '2026-02-19')).toEqual([]);
  });
});

describe('ausenciasPropiasSuperpuestas', () => {
  const propias = [
    { id: 'a', tipo: 'vacaciones' as const, fechaDesde: '2026-11-09', fechaHasta: '2026-11-13' },
    { id: 'b', tipo: 'cambio_dia' as const, fechaDesde: '2026-11-20', fechaHasta: '2026-11-20' },
  ];

  it('detecta superposición parcial y borde', () => {
    expect(ausenciasPropiasSuperpuestas('2026-11-13', '2026-11-16', propias)).toHaveLength(1);
    expect(ausenciasPropiasSuperpuestas('2026-11-14', '2026-11-19', propias)).toHaveLength(0);
  });

  it('detecta cambios de día', () => {
    const r = ausenciasPropiasSuperpuestas('2026-11-18', '2026-11-22', propias);
    expect(r.map((x) => x.id)).toEqual(['b']);
  });

  it('excluye la que se está editando', () => {
    expect(ausenciasPropiasSuperpuestas('2026-11-09', '2026-11-13', propias, 'a')).toHaveLength(0);
  });
});
