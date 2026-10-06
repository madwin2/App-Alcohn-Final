import { describe, expect, it } from 'vitest';
import {
  armarMesCalendario,
  esDiaHabilParaCambio,
  quienesFaltanHoy,
  solapamientosVacaciones,
} from './calendarioEquipo';

const personas = [
  {
    userId: 'fede',
    nombre: 'Fede',
    color: '#EF4444',
    fechaNacimiento: '1990-10-15',
  },
  {
    userId: 'cachi',
    nombre: 'Cachi',
    color: '#3B82F6',
    fechaNacimiento: '1992-02-29',
  },
];

describe('armarMesCalendario', () => {
  it('incluye vacaciones, cambio de día, recupero, feriado y cumpleaños', () => {
    const mes = armarMesCalendario({
      year: 2026,
      month: 10,
      personas,
      ausencias: [
        {
          id: 'v1',
          userId: 'cachi',
          tipo: 'vacaciones',
          fechaDesde: '2026-10-12',
          fechaHasta: '2026-10-16',
        },
        {
          id: 'c1',
          userId: 'fede',
          tipo: 'cambio_dia',
          fechaDesde: '2026-10-08',
          fechaHasta: '2026-10-08',
          fechaRecupero: '2026-10-10', // sábado
        },
        {
          id: 'c2',
          userId: 'fede',
          tipo: 'cambio_dia',
          fechaDesde: '2026-10-09',
          fechaHasta: '2026-10-09',
          fechaRecupero: null,
        },
      ],
      feriados: [
        {
          id: 'f1',
          fecha: '2026-10-12',
          nombre: 'Día del Respeto a la Diversidad Cultural',
          origen: 'nacional',
        },
      ],
    });

    const dia12 = mes.dias.find((d) => d.fecha === '2026-10-12')!;
    expect(dia12.eventos.some((e) => e.kind === 'vacaciones' && e.nombre === 'Cachi')).toBe(
      true,
    );
    expect(dia12.eventos.some((e) => e.kind === 'feriado' && e.origen === 'nacional')).toBe(
      true,
    );

    const dia8 = mes.dias.find((d) => d.fecha === '2026-10-08')!;
    expect(dia8.eventos.some((e) => e.kind === 'cambio_falta' && e.nombre === 'Fede')).toBe(
      true,
    );

    const sabado = mes.dias.find((d) => d.fecha === '2026-10-10')!;
    expect(sabado.esFinDeSemana).toBe(true);
    expect(
      sabado.eventos.some((e) => e.kind === 'cambio_recupero' && e.nombre === 'Fede'),
    ).toBe(true);

    const dia9 = mes.dias.find((d) => d.fecha === '2026-10-09')!;
    expect(dia9.eventos.some((e) => e.kind === 'cambio_falta')).toBe(true);

    const cumpleFede = mes.dias.find((d) => d.fecha === '2026-10-15')!;
    expect(
      cumpleFede.eventos.some((e) => e.kind === 'cumpleanios' && e.nombre === 'Fede'),
    ).toBe(true);
  });

  it('cumpleaños 29/02 en año no bisiesto cae el 28/02', () => {
    const mes = armarMesCalendario({
      year: 2025,
      month: 2,
      personas,
      ausencias: [],
      feriados: [],
    });
    const dia28 = mes.dias.find((d) => d.fecha === '2025-02-28')!;
    expect(
      dia28.eventos.some((e) => e.kind === 'cumpleanios' && e.nombre === 'Cachi'),
    ).toBe(true);
  });
});

describe('quienesFaltanHoy', () => {
  it('lista vacaciones y cambios del día', () => {
    const faltan = quienesFaltanHoy({
      hoy: '2026-10-08',
      personas,
      ausencias: [
        {
          id: 'v1',
          userId: 'cachi',
          tipo: 'vacaciones',
          fechaDesde: '2026-10-08',
          fechaHasta: '2026-10-10',
        },
        {
          id: 'c1',
          userId: 'fede',
          tipo: 'cambio_dia',
          fechaDesde: '2026-10-08',
          fechaHasta: '2026-10-08',
        },
      ],
    });
    expect(faltan.map((f) => f.nombre).sort()).toEqual(['Cachi', 'Fede']);
  });
});

describe('esDiaHabilParaCambio', () => {
  it('rechaza fin de semana y feriado', () => {
    expect(esDiaHabilParaCambio('2026-10-10', [])).toBe(false); // sáb
    expect(esDiaHabilParaCambio('2026-10-12', ['2026-10-12'])).toBe(false);
    expect(esDiaHabilParaCambio('2026-10-08', [])).toBe(true); // jue
  });
});

describe('solapamientosVacaciones', () => {
  it('detecta solape informativo', () => {
    const overs = solapamientosVacaciones({
      fechaDesde: '2026-10-12',
      fechaHasta: '2026-10-16',
      excluirUserId: 'yo',
      personas,
      ausencias: [
        {
          id: 'v1',
          userId: 'fede',
          tipo: 'vacaciones',
          fechaDesde: '2026-10-14',
          fechaHasta: '2026-10-20',
        },
      ],
    });
    expect(overs).toHaveLength(1);
    expect(overs[0].nombre).toBe('Fede');
  });
});
