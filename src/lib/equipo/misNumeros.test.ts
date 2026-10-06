import { describe, expect, it } from 'vitest';
import {
  clampRangoHastaHoy,
  contarSellosDistintosEnRango,
  conteoSellosPeriodo,
  esAreaProduccion,
  esPedidoPrueba,
  labelPeriodoAnterior,
  ordenarSellosPorRecencia,
  paginarIds,
  rangoPeriodo,
  rangoPeriodoAnterior,
  rangoToUtcBounds,
  serieMensualSellos,
  textoComparacion,
  ultimosNMeses,
  type EventoSelloHistorial,
} from './misNumeros';

describe('misNumeros períodos', () => {
  it('semana: lunes a domingo de la semana de hoy', () => {
    // 2026-10-02 es jueves → lun 28/09 … dom 04/10
    expect(rangoPeriodo('semana', '2026-10-02')).toEqual({
      desde: '2026-09-28',
      hasta: '2026-10-04',
    });
  });

  it('mes y año', () => {
    expect(rangoPeriodo('mes', '2026-10-02')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
    expect(rangoPeriodo('anio', '2026-10-02')).toEqual({
      desde: '2026-01-01',
      hasta: '2026-12-31',
    });
  });

  it('período anterior: semana, mes (cruza año) y año', () => {
    expect(rangoPeriodoAnterior('semana', '2026-10-02')).toEqual({
      desde: '2026-09-21',
      hasta: '2026-09-27',
    });
    expect(rangoPeriodoAnterior('mes', '2026-01-15')).toEqual({
      desde: '2025-12-01',
      hasta: '2025-12-31',
    });
    expect(rangoPeriodoAnterior('anio', '2026-10-02')).toEqual({
      desde: '2025-01-01',
      hasta: '2025-12-31',
    });
  });

  it('ultimosNMeses: 6 meses hasta el actual', () => {
    const meses = ultimosNMeses('2026-10-02', 6);
    expect(meses.map((m) => m.key)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(meses[0].rango).toEqual({ desde: '2026-05-01', hasta: '2026-05-31' });
  });

  it('rangoToUtcBounds usa offset AR −03:00', () => {
    expect(rangoToUtcBounds({ desde: '2026-10-01', hasta: '2026-10-01' })).toEqual({
      gte: '2026-10-01T00:00:00-03:00',
      lt: '2026-10-02T00:00:00-03:00',
    });
  });

  it('clampRangoHastaHoy', () => {
    expect(clampRangoHastaHoy({ desde: '2026-10-01', hasta: '2026-10-31' }, '2026-10-02')).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-02',
    });
  });
});

describe('misNumeros conteos', () => {
  const eventos: EventoSelloHistorial[] = [
    {
      selloId: 'a',
      ordenId: 'o1',
      changedAt: '2026-10-02T15:00:00.000Z', // 12:00 AR
      tipoPedido: 'Venta',
    },
    {
      selloId: 'a',
      ordenId: 'o1',
      changedAt: '2026-10-03T15:00:00.000Z', // rehecho → misma vez en el mes
      tipoPedido: 'Venta',
    },
    {
      selloId: 'b',
      ordenId: 'o2',
      changedAt: '2026-10-05T12:00:00.000Z',
      tipoPedido: 'Prueba',
    },
    {
      selloId: 'c',
      ordenId: 'o3',
      changedAt: '2026-09-20T12:00:00.000Z',
      tipoPedido: 'Venta',
    },
  ];

  it('cuenta sello distinto una vez por período aunque se rehaga', () => {
    const r = { desde: '2026-10-01', hasta: '2026-10-31' };
    expect(contarSellosDistintosEnRango(eventos, r)).toBe(2);
    expect(conteoSellosPeriodo(eventos, r)).toEqual({ total: 2, pruebas: 1 });
  });

  it('esPedidoPrueba solo con literal Prueba', () => {
    expect(esPedidoPrueba('Prueba')).toBe(true);
    expect(esPedidoPrueba('Venta')).toBe(false);
    expect(esPedidoPrueba(null)).toBe(false);
  });

  it('serie mensual y orden por recencia', () => {
    const meses = ultimosNMeses('2026-10-02', 2);
    expect(serieMensualSellos(eventos, meses)).toEqual([
      { key: '2026-09', label: expect.any(String), value: 1 },
      { key: '2026-10', label: expect.any(String), value: 2 },
    ]);
    expect(ordenarSellosPorRecencia(eventos, { desde: '2026-10-01', hasta: '2026-10-31' })).toEqual([
      'b',
      'a',
    ]);
  });

  it('paginarIds', () => {
    expect(paginarIds(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['b', 'c']);
    expect(paginarIds(['a'], 5, 2)).toEqual([]);
  });
});

describe('misNumeros textos y área', () => {
  it('textoComparacion', () => {
    expect(textoComparacion(40, 28, 'septiembre')).toBe('+12 vs septiembre');
    expect(textoComparacion(10, 15, 'septiembre')).toBe('-5 vs septiembre');
    expect(textoComparacion(5, 5, 'la semana anterior')).toBe('0 vs la semana anterior');
  });

  it('labelPeriodoAnterior mes sin año', () => {
    expect(labelPeriodoAnterior('mes', '2026-10-02')).toBe('septiembre');
    expect(labelPeriodoAnterior('semana', '2026-10-02')).toBe('la semana anterior');
    expect(labelPeriodoAnterior('anio', '2026-10-02')).toBe('2025');
  });

  it('esAreaProduccion', () => {
    expect(esAreaProduccion('produccion')).toBe(true);
    expect(esAreaProduccion('ventas')).toBe(false);
    expect(esAreaProduccion(null)).toBe(false);
  });
});
