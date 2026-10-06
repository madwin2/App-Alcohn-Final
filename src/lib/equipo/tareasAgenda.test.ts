import { describe, expect, it } from 'vitest';
import {
  FECHA_INICIO_ARRASTRE_TAREAS,
  agruparAtrasadas,
  aplicarS13,
  diasQueNoTrabajo,
  fechaPosponer,
  ocurrenciasEnRango,
  ocurrenciasPendientes,
  proximoDiaHabilQueTrabajo,
  textoAtrasadaDesde,
  type OcurrenciaAgenda,
  type TareaAgendaDef,
} from './tareasAgenda';

const diaria = (id: string, titulo = 'Limpiar CNC'): TareaAgendaDef => ({
  id,
  titulo,
  frecuencia: 'diaria',
  activa: true,
  creadaEl: '2026-10-01',
});

describe('proximoDiaHabilQueTrabajo', () => {
  it('salta finde y feriado', () => {
    // viernes 9 → lunes 12 (salta sáb/dom)
    expect(proximoDiaHabilQueTrabajo('2026-10-09', [], new Set(), { desdeInclusive: false })).toBe(
      '2026-10-12',
    );
    // viernes + feriado lunes → martes
    expect(
      proximoDiaHabilQueTrabajo('2026-10-09', ['2026-10-12'], new Set(), { desdeInclusive: false }),
    ).toBe('2026-10-13');
  });

  it('salta ausencias', () => {
    const no = new Set(['2026-10-13', '2026-10-14']);
    expect(
      proximoDiaHabilQueTrabajo('2026-10-12', [], no, { desdeInclusive: false }),
    ).toBe('2026-10-15');
  });
});

describe('diasQueNoTrabajo', () => {
  it('vacaciones + cambio de día', () => {
    const set = diasQueNoTrabajo(
      [
        { tipo: 'vacaciones', fechaDesde: '2026-10-12', fechaHasta: '2026-10-14' },
        { tipo: 'cambio_dia', fechaDesde: '2026-10-16', fechaHasta: '2026-10-16' },
      ],
      '2026-10-01',
      '2026-10-31',
    );
    expect([...set].sort()).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-16']);
  });
});

describe('ocurrenciasEnRango', () => {
  it('diaria lun–vie en una semana', () => {
    const oc = ocurrenciasEnRango(diaria('t1'), '2026-10-05', '2026-10-09', []);
    expect(oc.map((o) => o.fecha)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
  });

  it('unica usa fecha', () => {
    const t: TareaAgendaDef = {
      id: 'u1',
      titulo: 'Llamar',
      frecuencia: 'unica',
      fecha: '2026-10-08',
      activa: true,
    };
    expect(ocurrenciasEnRango(t, '2026-10-05', '2026-10-11', []).map((o) => o.fecha)).toEqual([
      '2026-10-08',
    ]);
  });
});

describe('aplicarS13', () => {
  it('mueve solo una diaria en vacaciones; el resto no aplica', () => {
    const feriados = new Set<string>();
    const no = new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
    const brutas = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map(
      (fechaProgramada) => ({
        tareaId: 't1',
        titulo: 'Limpiar',
        frecuencia: 'diaria' as const,
        fechaProgramada,
        esFeriado: false,
      }),
    );
    const out = aplicarS13(brutas, feriados, no);
    const movidas = out.filter((o) => o.estadoS13 === 'ok');
    const noAplica = out.filter((o) => o.estadoS13 === 'no_aplica');
    expect(movidas).toHaveLength(1);
    expect(movidas[0]!.fechaTrasS13).toBe('2026-10-19'); // lun siguiente
    expect(noAplica).toHaveLength(4);
  });

  it('feriado puntual mueve la ocurrencia', () => {
    const out = aplicarS13(
      [
        {
          tareaId: 't1',
          titulo: 'X',
          frecuencia: 'semanal',
          fechaProgramada: '2026-10-12',
          esFeriado: true,
        },
      ],
      new Set(['2026-10-12']),
      new Set(),
    );
    expect(out[0]).toMatchObject({
      estadoS13: 'ok',
      fechaTrasS13: '2026-10-13',
    });
  });
});

describe('ocurrenciasPendientes — arrastre y S15', () => {
  it('sin marcar y fecha < hoy → atrasada hoy', () => {
    const tarea: TareaAgendaDef = {
      id: 't1',
      titulo: 'Limpiar CNC',
      frecuencia: 'semanal',
      diasSemana: [4], // jueves
      activa: true,
      creadaEl: '2026-10-01',
    };
    // jueves 8 sin marcar; hoy = viernes 9
    const res = ocurrenciasPendientes({
      tareas: [tarea],
      registros: [],
      desde: '2026-10-05',
      hasta: '2026-10-09',
      hoy: '2026-10-09',
      feriados: [],
      misAusencias: [],
      fechaPublicacionArrastre: '2026-10-05',
    });
    const atrasada = res.find((r) => r.estado === 'atrasada');
    expect(atrasada).toMatchObject({
      fechaProgramada: '2026-10-08',
      fechaVisible: '2026-10-09',
      atrasadaDesde: '2026-10-08',
    });
  });

  it('S15: no arrastra antes de la publicación', () => {
    const tarea: TareaAgendaDef = {
      id: 't1',
      titulo: 'Vieja',
      frecuencia: 'semanal',
      diasSemana: [1],
      activa: true,
      creadaEl: '2026-09-01',
    };
    const res = ocurrenciasPendientes({
      tareas: [tarea],
      registros: [],
      desde: '2026-09-28',
      hasta: '2026-10-03',
      hoy: '2026-10-09',
      feriados: [],
      misAusencias: [],
      fechaPublicacionArrastre: '2026-10-05',
    });
    // lunes 28 sep y lunes 5 oct: solo el 5 puede arrastrar; el 28 no aparece
    expect(res.filter((r) => r.fechaProgramada === '2026-09-28')).toHaveLength(0);
  });

  it('hecha no se arrastra', () => {
    const tarea: TareaAgendaDef = {
      id: 't1',
      titulo: 'X',
      frecuencia: 'semanal',
      diasSemana: [4],
      activa: true,
      creadaEl: '2026-10-01',
    };
    const res = ocurrenciasPendientes({
      tareas: [tarea],
      registros: [
        {
          tareaId: 't1',
          fechaProgramada: '2026-10-08',
          estado: 'hecha',
          fechaDestino: null,
        },
      ],
      desde: '2026-10-05',
      hasta: '2026-10-09',
      hoy: '2026-10-09',
      feriados: [],
      misAusencias: [],
    });
    expect(res.find((r) => r.fechaProgramada === '2026-10-08')?.estado).toBe('hecha');
  });

  it('movida aparece en fecha_destino', () => {
    const tarea: TareaAgendaDef = {
      id: 't1',
      titulo: 'X',
      frecuencia: 'unica',
      fecha: '2026-10-07',
      activa: true,
      creadaEl: '2026-10-01',
    };
    const res = ocurrenciasPendientes({
      tareas: [tarea],
      registros: [
        {
          tareaId: 't1',
          fechaProgramada: '2026-10-07',
          estado: 'movida',
          fechaDestino: '2026-10-10',
        },
      ],
      desde: '2026-10-05',
      hasta: '2026-10-12',
      hoy: '2026-10-08',
      feriados: [],
      misAusencias: [],
    });
    expect(res.find((r) => r.tareaId === 't1')).toMatchObject({
      estado: 'movida',
      fechaVisible: '2026-10-10',
    });
  });
});

describe('agruparAtrasadas S14', () => {
  it('varias atrasadas → una tarjeta', () => {
    const items: OcurrenciaAgenda[] = [
      {
        tareaId: 't1',
        titulo: 'Limpiar CNC',
        frecuencia: 'diaria',
        fechaProgramada: '2026-10-06',
        fechaVisible: '2026-10-09',
        estado: 'atrasada',
        atrasadaDesde: '2026-10-06',
      },
      {
        tareaId: 't1',
        titulo: 'Limpiar CNC',
        frecuencia: 'diaria',
        fechaProgramada: '2026-10-07',
        fechaVisible: '2026-10-09',
        estado: 'atrasada',
        atrasadaDesde: '2026-10-07',
      },
      {
        tareaId: 't1',
        titulo: 'Limpiar CNC',
        frecuencia: 'diaria',
        fechaProgramada: '2026-10-08',
        fechaVisible: '2026-10-09',
        estado: 'atrasada',
        atrasadaDesde: '2026-10-08',
      },
    ];
    const out = agruparAtrasadas(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.vecesAtrasada).toBe(3);
    expect(out[0]!.fechasAgrupadas).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(out[0]!.atrasadaDesde).toBe('2026-10-06');
  });
});

describe('fechaPosponer', () => {
  it('próximo hábil', () => {
    expect(fechaPosponer('2026-10-09', [], [])).toBe('2026-10-12');
  });
});

describe('textoAtrasadaDesde', () => {
  it('día de la semana', () => {
    expect(textoAtrasadaDesde('2026-10-08')).toBe('desde el jueves');
  });
});

describe('constante S15', () => {
  it('fecha de publicación definida', () => {
    expect(FECHA_INICIO_ARRASTRE_TAREAS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
