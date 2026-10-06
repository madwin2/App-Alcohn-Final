import { describe, expect, it } from 'vitest';
import {
  avisosRecupero,
  huboCambioDeFechas,
  marcaAusenciaDelDia,
  puedeEditarAusencia,
} from './ausencias';

describe('puedeEditarAusencia', () => {
  const hoy = '2026-10-05';

  it('admin puede con cualquiera, pasada o ajena', () => {
    expect(puedeEditarAusencia({ userId: 'otro', fechaDesde: '2026-10-01' }, 'admin', true, hoy)).toBe(
      true,
    );
  });

  it('no admin: solo propias que empiezan después de hoy', () => {
    expect(puedeEditarAusencia({ userId: 'yo', fechaDesde: '2026-10-06' }, 'yo', false, hoy)).toBe(true);
    expect(puedeEditarAusencia({ userId: 'yo', fechaDesde: '2026-10-05' }, 'yo', false, hoy)).toBe(false);
    expect(puedeEditarAusencia({ userId: 'otro', fechaDesde: '2026-10-20' }, 'yo', false, hoy)).toBe(
      false,
    );
  });
});

describe('huboCambioDeFechas', () => {
  const base = { fechaDesde: '2026-11-02', fechaHasta: '2026-11-06' };

  it('mismas fechas → false', () => {
    expect(huboCambioDeFechas(base, { ...base })).toBe(false);
  });

  it('cambia desde o hasta → true', () => {
    expect(huboCambioDeFechas(base, { ...base, fechaHasta: '2026-11-07' })).toBe(true);
    expect(huboCambioDeFechas(base, { ...base, fechaDesde: '2026-11-03' })).toBe(true);
  });
});

describe('marcaAusenciaDelDia (EQ-R18)', () => {
  const vac = {
    tipo: 'vacaciones' as const,
    fechaDesde: '2026-10-07',
    fechaHasta: '2026-10-09',
    fechaRecupero: null,
  };
  const cambio = {
    tipo: 'cambio_dia' as const,
    fechaDesde: '2026-10-12',
    fechaHasta: '2026-10-12',
    fechaRecupero: '2026-10-17',
  };

  it('marca los días dentro de vacaciones', () => {
    expect(marcaAusenciaDelDia('2026-10-07', [vac])).toBe('vacaciones');
    expect(marcaAusenciaDelDia('2026-10-09', [vac])).toBe('vacaciones');
    expect(marcaAusenciaDelDia('2026-10-10', [vac])).toBeNull();
  });

  it('marca el día de cambio y el de recupero', () => {
    expect(marcaAusenciaDelDia('2026-10-12', [cambio])).toBe('cambio_dia');
    expect(marcaAusenciaDelDia('2026-10-17', [cambio])).toBe('recupero');
    expect(marcaAusenciaDelDia('2026-10-13', [cambio])).toBeNull();
  });

  it('vacaciones tienen prioridad sobre un cambio el mismo día', () => {
    expect(marcaAusenciaDelDia('2026-10-08', [cambio, vac])).toBe('vacaciones');
  });
});
describe('avisosRecupero (EQ-R19)', () => {
  const base = { fecha: '2026-10-12', recupero: '2026-10-17', recuperoEsFeriado: false, recuperoEnVacaciones: false };

  it('sin recupero o recupero normal → sin avisos (también si es anterior a la falta)', () => {
    expect(avisosRecupero({ ...base, recupero: null })).toEqual([]);
    expect(avisosRecupero(base)).toEqual([]);
    expect(avisosRecupero({ ...base, recupero: '2026-10-03' })).toEqual([]);
  });

  it('avisa si es el mismo día, feriado o vacaciones propias', () => {
    expect(avisosRecupero({ ...base, recupero: base.fecha })).toHaveLength(1);
    expect(avisosRecupero({ ...base, recuperoEsFeriado: true })).toHaveLength(1);
    expect(avisosRecupero({ ...base, recuperoEnVacaciones: true })).toHaveLength(1);
    expect(
      avisosRecupero({ ...base, recuperoEsFeriado: true, recuperoEnVacaciones: true }),
    ).toHaveLength(2);
  });
});