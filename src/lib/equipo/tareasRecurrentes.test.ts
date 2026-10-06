import { describe, expect, it } from 'vitest';
import {
  describirFrecuencia,
  esSemanaQuincenal,
  lunesDeSemana,
  ocurrenciaDelMes,
  ocurrenciasEnSemana,
  type TareaRecurrenteDef,
} from './tareasRecurrentes';

describe('lunesDeSemana', () => {
  it('devuelve el lunes de la misma semana', () => {
    expect(lunesDeSemana('2026-10-07')).toBe('2026-10-05'); // mié → lun 5
    expect(lunesDeSemana('2026-10-05')).toBe('2026-10-05');
    expect(lunesDeSemana('2026-10-11')).toBe('2026-10-05'); // domingo
  });
});

describe('ocurrenciasEnSemana — diaria', () => {
  it('lunes a viernes', () => {
    const tarea: TareaRecurrenteDef = { frecuencia: 'diaria' };
    const oc = ocurrenciasEnSemana(tarea, '2026-10-05', []);
    expect(oc.map((o) => o.fecha)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
  });

  it('marca feriado sin mover', () => {
    const tarea: TareaRecurrenteDef = { frecuencia: 'diaria' };
    const oc = ocurrenciasEnSemana(tarea, '2026-10-05', ['2026-10-07']);
    expect(oc.find((o) => o.fecha === '2026-10-07')?.esFeriado).toBe(true);
    expect(oc).toHaveLength(5);
  });

  it('pausada → vacío', () => {
    expect(ocurrenciasEnSemana({ frecuencia: 'diaria', activa: false }, '2026-10-05', [])).toEqual(
      [],
    );
  });
});

describe('ocurrenciasEnSemana — semanal', () => {
  it('lunes y jueves', () => {
    const tarea: TareaRecurrenteDef = { frecuencia: 'semanal', diasSemana: [1, 4] };
    const oc = ocurrenciasEnSemana(tarea, '2026-10-05', []);
    expect(oc.map((o) => o.fecha)).toEqual(['2026-10-05', '2026-10-08']);
  });

  it('feriado en el día: marca, no mueve', () => {
    const tarea: TareaRecurrenteDef = { frecuencia: 'semanal', diasSemana: [3] };
    const oc = ocurrenciasEnSemana(tarea, '2026-10-05', ['2026-10-07']);
    expect(oc).toEqual([{ fecha: '2026-10-07', esFeriado: true }]);
  });
});

describe('ocurrenciasEnSemana — quincenal', () => {
  const inicio = '2026-10-05'; // lunes

  it('semana de inicio toca', () => {
    expect(esSemanaQuincenal('2026-10-05', inicio)).toBe(true);
    const tarea: TareaRecurrenteDef = {
      frecuencia: 'quincenal',
      diasSemana: [5],
      semanaInicio: inicio,
    };
    expect(ocurrenciasEnSemana(tarea, '2026-10-05', []).map((o) => o.fecha)).toEqual([
      '2026-10-09',
    ]);
  });

  it('semana siguiente no toca', () => {
    expect(esSemanaQuincenal('2026-10-12', inicio)).toBe(false);
    const tarea: TareaRecurrenteDef = {
      frecuencia: 'quincenal',
      diasSemana: [5],
      semanaInicio: inicio,
    };
    expect(ocurrenciasEnSemana(tarea, '2026-10-12', [])).toEqual([]);
  });

  it('semana +2 vuelve a tocar', () => {
    expect(esSemanaQuincenal('2026-10-19', inicio)).toBe(true);
  });
});

describe('ocurrenciaDelMes — D21', () => {
  it('día hábil sin feriado queda igual', () => {
    // 1 oct 2026 = jueves
    expect(ocurrenciaDelMes(2026, 10, 1, [])).toBe('2026-10-01');
  });

  it('sábado → lunes siguiente', () => {
    // 3 oct 2026 = sábado → 5 lun
    expect(ocurrenciaDelMes(2026, 10, 3, [])).toBe('2026-10-05');
  });

  it('domingo → lunes', () => {
    // 4 oct 2026 = domingo → 5
    expect(ocurrenciaDelMes(2026, 10, 4, [])).toBe('2026-10-05');
  });

  it('feriado en hábil → día hábil siguiente', () => {
    // 5 oct lun feriado → 6
    expect(ocurrenciaDelMes(2026, 10, 5, ['2026-10-05'])).toBe('2026-10-06');
  });

  it('feriados encadenados', () => {
    expect(ocurrenciaDelMes(2026, 10, 5, ['2026-10-05', '2026-10-06'])).toBe('2026-10-07');
  });

  it('31 en febrero → último del mes + regla hábil', () => {
    // feb 2026: 28 = sábado → 2 mar (lun)
    expect(ocurrenciaDelMes(2026, 2, 31, [])).toBe('2026-03-02');
  });

  it('31 en febrero bisiesto hábil', () => {
    // 2024-02-29 = jueves
    expect(ocurrenciaDelMes(2024, 2, 31, [])).toBe('2024-02-29');
  });

  it('nunca dos ocurrencias del mismo mes ni se pierde una (12 meses)', () => {
    const feriados = ['2026-01-01', '2026-05-01', '2026-05-25', '2026-12-08', '2026-12-25'];
    const fechas: string[] = [];
    for (let m = 1; m <= 12; m++) {
      fechas.push(ocurrenciaDelMes(2026, m, 1, feriados));
    }
    // Cada mes produce exactamente una fecha
    expect(fechas).toHaveLength(12);
    // Las fechas son estrictamente crecientes (puede haber spill al mes siguiente,
    // pero no dos del mismo mes de ancla — cada índice es un mes distinto)
    for (let i = 1; i < fechas.length; i++) {
      expect(fechas[i] > fechas[i - 1]).toBe(true);
    }
  });

  it('1 ene 2026 (feriado jueves) → 2 ene', () => {
    expect(ocurrenciaDelMes(2026, 1, 1, ['2026-01-01'])).toBe('2026-01-02');
  });
});

describe('ocurrenciasEnSemana — mensual', () => {
  it('aparece en la semana del día hábil resultante', () => {
    // 1 oct 2026 jueves → semana del 5/10? No, semana del 28/9 (lun 28 sep)
    // 1 oct es jueves de la semana lun 28 sep
    const tarea: TareaRecurrenteDef = { frecuencia: 'mensual', diaMes: 1 };
    const oc = ocurrenciasEnSemana(tarea, '2026-09-28', []);
    expect(oc.map((o) => o.fecha)).toContain('2026-10-01');
  });

  it('spill de fin de mes aparece en la semana del mes siguiente', () => {
    // 31 feb 2026 → 2 mar; semana lun 2 mar
    const tarea: TareaRecurrenteDef = { frecuencia: 'mensual', diaMes: 31 };
    const oc = ocurrenciasEnSemana(tarea, '2026-03-02', []);
    expect(oc.map((o) => o.fecha)).toContain('2026-03-02');
  });
});

describe('describirFrecuencia', () => {
  it('diaria', () => {
    expect(describirFrecuencia({ frecuencia: 'diaria' })).toBe('Todos los días');
  });

  it('semanal uno y varios', () => {
    expect(describirFrecuencia({ frecuencia: 'semanal', diasSemana: [1] })).toBe(
      'Todos los lunes',
    );
    expect(describirFrecuencia({ frecuencia: 'semanal', diasSemana: [1, 4] })).toBe(
      'Todos los lunes y jueves',
    );
    expect(describirFrecuencia({ frecuencia: 'semanal', diasSemana: [1, 3, 5] })).toBe(
      'Todos los lunes, miércoles y viernes',
    );
  });

  it('quincenal', () => {
    expect(
      describirFrecuencia({
        frecuencia: 'quincenal',
        diasSemana: [5],
        semanaInicio: '2026-10-05',
      }),
    ).toBe('Cada 15 días, los viernes');
  });

  it('mensual', () => {
    expect(describirFrecuencia({ frecuencia: 'mensual', diaMes: 1 })).toBe('El 1 de cada mes');
  });
});
