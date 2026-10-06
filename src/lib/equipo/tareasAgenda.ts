/**
 * Agenda de tareas: ocurrencias con arrastre, posponer y S13–S15.
 * Ver REVISION_EQUIPO_USABILIDAD.md (Q-EQ-018/019, S13–S15).
 */
import { addDaysToKey, isWeekday, parseDateOnly } from './fechas';
import {
  lunesDeSemana,
  ocurrenciasEnSemana,
  type FrecuenciaTarea,
  type TareaRecurrenteDef,
} from './tareasRecurrentes';

/** Día en que se publica el arrastre (S15). No genera atrasos anteriores. */
export const FECHA_INICIO_ARRASTRE_TAREAS = '2026-10-05';

export type EstadoRegistroTarea = 'hecha' | 'no_hecha' | 'movida';

export type TareaRegistroDef = {
  tareaId: string;
  fechaProgramada: string;
  estado: EstadoRegistroTarea;
  fechaDestino: string | null;
};

export type TareaAgendaDef = TareaRecurrenteDef & {
  id: string;
  titulo: string;
  /** created_at como YYYY-MM-DD (Argentina o UTC date). */
  creadaEl?: string | null;
  frecuencia: FrecuenciaTarea;
  /** Única: fecha del día (columna `fecha`). Fallback: semanaInicio legacy. */
  fecha?: string | null;
};

export type AusenciaAgenda = {
  tipo: 'vacaciones' | 'cambio_dia';
  fechaDesde: string;
  fechaHasta: string;
};

export type EstadoOcurrenciaAgenda =
  | 'pendiente'
  | 'atrasada'
  | 'hecha'
  | 'no_hecha'
  | 'movida'
  | 'no_aplica';

export type OcurrenciaAgenda = {
  tareaId: string;
  titulo: string;
  frecuencia: FrecuenciaTarea;
  /** Ocurrencia original en el calendario de la tarea. */
  fechaProgramada: string;
  /** Día donde se muestra (tras S13, arrastre o movida). */
  fechaVisible: string;
  estado: EstadoOcurrenciaAgenda;
  /** Primera fecha programada que quedó sin marcar (atrasadas). */
  atrasadaDesde?: string;
  /** Cantidad de ocurrencias agruadas (S14). */
  vecesAtrasada?: number;
  /** Fechas programadas cubiertas por esta tarjeta (S14). */
  fechasAgrupadas?: string[];
  registroEstado?: EstadoRegistroTarea;
  fechaDestino?: string | null;
};

function defConFecha(tarea: TareaAgendaDef): TareaRecurrenteDef {
  if (tarea.frecuencia === 'unica') {
    return {
      ...tarea,
      semanaInicio: tarea.fecha ?? tarea.semanaInicio ?? null,
    };
  }
  return tarea;
}

/** Fechas en las que la persona no trabaja (vacaciones + día de falta). */
export function diasQueNoTrabajo(
  ausencias: AusenciaAgenda[],
  desde: string,
  hasta: string,
): Set<string> {
  const out = new Set<string>();
  for (const a of ausencias) {
    if (a.tipo === 'vacaciones') {
      let cur = a.fechaDesde < desde ? desde : a.fechaDesde;
      const end = a.fechaHasta > hasta ? hasta : a.fechaHasta;
      while (cur <= end) {
        out.add(cur);
        cur = addDaysToKey(cur, 1);
      }
    } else if (a.fechaDesde >= desde && a.fechaDesde <= hasta) {
      out.add(a.fechaDesde);
    }
  }
  return out;
}

/**
 * Próximo día hábil en que la persona trabaja (salta finde, feriados y ausencias).
 * `desdeInclusive`: si true, puede devolver `desde` si es hábil; si false, arranca al día siguiente.
 */
export function proximoDiaHabilQueTrabajo(
  desde: string,
  feriados: Iterable<string> | Set<string>,
  noTrabajo: Set<string>,
  opts?: { desdeInclusive?: boolean },
): string {
  const set = feriados instanceof Set ? feriados : new Set(feriados);
  let key = opts?.desdeInclusive ? desde : addDaysToKey(desde, 1);
  for (let i = 0; i < 60; i++) {
    if (isWeekday(key) && !set.has(key) && !noTrabajo.has(key)) return key;
    key = addDaysToKey(key, 1);
  }
  return key;
}

/** Ocurrencias brutas (fecha programada) en [desde, hasta], semana a semana. */
export function ocurrenciasEnRango(
  tarea: TareaAgendaDef,
  desde: string,
  hasta: string,
  feriados: Iterable<string> | Set<string>,
): Array<{ fecha: string; esFeriado: boolean }> {
  if (tarea.activa === false) return [];
  const def = defConFecha(tarea);
  const out: Array<{ fecha: string; esFeriado: boolean }> = [];
  let lunes = lunesDeSemana(desde);
  const limite = addDaysToKey(hasta, 7);
  while (lunes <= limite) {
    for (const oc of ocurrenciasEnSemana(def, lunes, feriados)) {
      if (oc.fecha >= desde && oc.fecha <= hasta) out.push(oc);
    }
    lunes = addDaysToKey(lunes, 7);
  }
  out.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return out;
}

function inicioArrastre(tarea: TareaAgendaDef, fechaPublicacion: string): string {
  const creada = tarea.creadaEl?.slice(0, 10) ?? null;
  if (creada && creada > fechaPublicacion) return creada;
  return fechaPublicacion;
}

type OcIntermedia = {
  tareaId: string;
  titulo: string;
  frecuencia: FrecuenciaTarea;
  fechaProgramada: string;
  fechaTrasS13: string;
  estadoS13: 'ok' | 'no_aplica';
};

/**
 * Aplica S13: si cae en feriado / ausencia, corre al próximo hábil que trabaje.
 * Varias de la misma tarea en el mismo bloque de no-trabajo → solo la primera se mueve.
 */
export function aplicarS13(
  ocurrencias: Array<{
    tareaId: string;
    titulo: string;
    frecuencia: FrecuenciaTarea;
    fechaProgramada: string;
    esFeriado: boolean;
  }>,
  feriados: Iterable<string> | Set<string>,
  noTrabajo: Set<string>,
): OcIntermedia[] {
  const set = feriados instanceof Set ? feriados : new Set(feriados);
  const porTarea = new Map<string, typeof ocurrencias>();
  for (const o of ocurrencias) {
    const list = porTarea.get(o.tareaId) ?? [];
    list.push(o);
    porTarea.set(o.tareaId, list);
  }

  const out: OcIntermedia[] = [];
  for (const [, list] of porTarea) {
    list.sort((a, b) => (a.fechaProgramada < b.fechaProgramada ? -1 : 1));
    // Clave de "período de no trabajo": destino al que se movería la primera.
    let destinoUsado: string | null = null;
    let yaMovioUna = false;

    for (const o of list) {
      const caeFuera =
        o.esFeriado || set.has(o.fechaProgramada) || noTrabajo.has(o.fechaProgramada);
      if (!caeFuera) {
        out.push({
          tareaId: o.tareaId,
          titulo: o.titulo,
          frecuencia: o.frecuencia,
          fechaProgramada: o.fechaProgramada,
          fechaTrasS13: o.fechaProgramada,
          estadoS13: 'ok',
        });
        continue;
      }

      const destino = proximoDiaHabilQueTrabajo(o.fechaProgramada, set, noTrabajo, {
        desdeInclusive: false,
      });

      if (!yaMovioUna) {
        yaMovioUna = true;
        destinoUsado = destino;
        out.push({
          tareaId: o.tareaId,
          titulo: o.titulo,
          frecuencia: o.frecuencia,
          fechaProgramada: o.fechaProgramada,
          fechaTrasS13: destino,
          estadoS13: 'ok',
        });
      } else if (destinoUsado === destino) {
        // Misma corrida de ausencias/feriados → no aplica
        out.push({
          tareaId: o.tareaId,
          titulo: o.titulo,
          frecuencia: o.frecuencia,
          fechaProgramada: o.fechaProgramada,
          fechaTrasS13: o.fechaProgramada,
          estadoS13: 'no_aplica',
        });
      } else {
        // Otro bloque distinto más adelante: puede moverse otra
        destinoUsado = destino;
        out.push({
          tareaId: o.tareaId,
          titulo: o.titulo,
          frecuencia: o.frecuencia,
          fechaProgramada: o.fechaProgramada,
          fechaTrasS13: destino,
          estadoS13: 'ok',
        });
      }
    }
  }
  return out;
}

function registroPorClave(
  registros: TareaRegistroDef[],
): Map<string, TareaRegistroDef> {
  const m = new Map<string, TareaRegistroDef>();
  for (const r of registros) {
    m.set(`${r.tareaId}|${r.fechaProgramada}`, r);
  }
  return m;
}

/**
 * Resuelve estado visible de una ocurrencia (tras S13), aplicando registros y arrastre.
 */
function resolverVisible(
  oc: OcIntermedia,
  registro: TareaRegistroDef | undefined,
  hoy: string,
  feriados: Set<string>,
  noTrabajo: Set<string>,
  fechaMinArrastre: string,
): OcurrenciaAgenda | null {
  if (oc.estadoS13 === 'no_aplica') {
    return {
      tareaId: oc.tareaId,
      titulo: oc.titulo,
      frecuencia: oc.frecuencia,
      fechaProgramada: oc.fechaProgramada,
      fechaVisible: oc.fechaProgramada,
      estado: 'no_aplica',
    };
  }

  if (registro?.estado === 'hecha') {
    return {
      tareaId: oc.tareaId,
      titulo: oc.titulo,
      frecuencia: oc.frecuencia,
      fechaProgramada: oc.fechaProgramada,
      fechaVisible: oc.fechaTrasS13,
      estado: 'hecha',
      registroEstado: 'hecha',
    };
  }
  if (registro?.estado === 'no_hecha') {
    return {
      tareaId: oc.tareaId,
      titulo: oc.titulo,
      frecuencia: oc.frecuencia,
      fechaProgramada: oc.fechaProgramada,
      fechaVisible: oc.fechaTrasS13,
      estado: 'no_hecha',
      registroEstado: 'no_hecha',
    };
  }

  let fechaBase = oc.fechaTrasS13;
  if (registro?.estado === 'movida' && registro.fechaDestino) {
    fechaBase = registro.fechaDestino;
  }

  // Arrastre: si la fecha visible ya pasó y no hay cierre, aparece hoy (desde fechaMinArrastre).
  if (fechaBase < hoy && fechaBase >= fechaMinArrastre) {
    const visible = proximoDiaHabilQueTrabajo(hoy, feriados, noTrabajo, {
      desdeInclusive: true,
    });
    // Si hoy no se trabaja, el próximo hábil
    return {
      tareaId: oc.tareaId,
      titulo: oc.titulo,
      frecuencia: oc.frecuencia,
      fechaProgramada: oc.fechaProgramada,
      fechaVisible: visible,
      estado: 'atrasada',
      atrasadaDesde: oc.fechaProgramada,
      registroEstado: registro?.estado,
      fechaDestino: registro?.fechaDestino ?? null,
    };
  }

  if (fechaBase < hoy) {
    // Anterior al arrastre: no se muestra como atrasada (S15)
    return null;
  }

  if (registro?.estado === 'movida') {
    return {
      tareaId: oc.tareaId,
      titulo: oc.titulo,
      frecuencia: oc.frecuencia,
      fechaProgramada: oc.fechaProgramada,
      fechaVisible: fechaBase,
      estado: 'movida',
      registroEstado: 'movida',
      fechaDestino: registro.fechaDestino,
    };
  }

  return {
    tareaId: oc.tareaId,
    titulo: oc.titulo,
    frecuencia: oc.frecuencia,
    fechaProgramada: oc.fechaProgramada,
    fechaVisible: fechaBase,
    estado: 'pendiente',
  };
}

/**
 * Agrupa atrasadas de la misma tarea en una sola tarjeta (S14).
 * Las demás ocurrencias (pendientes del futuro, hechas, etc.) quedan sueltas.
 */
export function agruparAtrasadas(items: OcurrenciaAgenda[]): OcurrenciaAgenda[] {
  const atrasadas = items.filter((i) => i.estado === 'atrasada');
  const resto = items.filter((i) => i.estado !== 'atrasada');
  const porTarea = new Map<string, OcurrenciaAgenda[]>();
  for (const a of atrasadas) {
    const list = porTarea.get(a.tareaId) ?? [];
    list.push(a);
    porTarea.set(a.tareaId, list);
  }
  const agrupadas: OcurrenciaAgenda[] = [];
  for (const [, list] of porTarea) {
    list.sort((a, b) => (a.fechaProgramada < b.fechaProgramada ? -1 : 1));
    const primera = list[0]!;
    if (list.length === 1) {
      agrupadas.push(primera);
      continue;
    }
    agrupadas.push({
      ...primera,
      vecesAtrasada: list.length,
      fechasAgrupadas: list.map((x) => x.fechaProgramada),
      atrasadaDesde: primera.fechaProgramada,
    });
  }
  return [...resto, ...agrupadas].sort((a, b) => {
    if (a.fechaVisible !== b.fechaVisible) return a.fechaVisible < b.fechaVisible ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, 'es');
  });
}

/**
 * Ocurrencias con estado para mostrar en calendario / Mi día.
 * `desde`/`hasta` delimitan las fechas programadas a considerar (ampliar un poco para arrastres).
 */
export function ocurrenciasPendientes(input: {
  tareas: TareaAgendaDef[];
  registros: TareaRegistroDef[];
  desde: string;
  hasta: string;
  hoy: string;
  feriados: Iterable<string> | Set<string>;
  misAusencias: AusenciaAgenda[];
  /** Override S15 (default FECHA_INICIO_ARRASTRE_TAREAS). */
  fechaPublicacionArrastre?: string;
}): OcurrenciaAgenda[] {
  const feriados = input.feriados instanceof Set ? input.feriados : new Set(input.feriados);
  const pub = input.fechaPublicacionArrastre ?? FECHA_INICIO_ARRASTRE_TAREAS;
  // Mirar un poco antes/después para S13 y arrastres que caen en el rango visible.
  const desdeBusqueda = addDaysToKey(input.desde, -45);
  const hastaBusqueda = addDaysToKey(input.hasta, 21);
  const noTrabajo = diasQueNoTrabajo(input.misAusencias, desdeBusqueda, hastaBusqueda);
  const regs = registroPorClave(input.registros);

  const brutas: Array<{
    tareaId: string;
    titulo: string;
    frecuencia: FrecuenciaTarea;
    fechaProgramada: string;
    esFeriado: boolean;
  }> = [];

  for (const t of input.tareas) {
    if (t.activa === false) continue;
    const ocs = ocurrenciasEnRango(t, desdeBusqueda, hastaBusqueda, feriados);
    for (const oc of ocs) {
      brutas.push({
        tareaId: t.id,
        titulo: t.titulo,
        frecuencia: t.frecuencia,
        fechaProgramada: oc.fecha,
        esFeriado: oc.esFeriado,
      });
    }
  }

  const conS13 = aplicarS13(brutas, feriados, noTrabajo);
  const resueltas: OcurrenciaAgenda[] = [];

  for (const oc of conS13) {
    const tarea = input.tareas.find((t) => t.id === oc.tareaId);
    const minArrastre = tarea ? inicioArrastre(tarea, pub) : pub;
    const reg = regs.get(`${oc.tareaId}|${oc.fechaProgramada}`);
    const visible = resolverVisible(oc, reg, input.hoy, feriados, noTrabajo, minArrastre);
    if (!visible) continue;
    // Filtrar a lo que cae visible en el rango pedido (o no_aplica en su día original)
    if (visible.estado === 'no_aplica') {
      if (visible.fechaProgramada >= input.desde && visible.fechaProgramada <= input.hasta) {
        resueltas.push(visible);
      }
      continue;
    }
    if (visible.fechaVisible >= input.desde && visible.fechaVisible <= input.hasta) {
      resueltas.push(visible);
    }
  }

  return agruparAtrasadas(resueltas);
}

/** Destino de "Posponer": próximo día hábil que trabaja (después de `desde`). */
export function fechaPosponer(
  desde: string,
  feriados: Iterable<string> | Set<string>,
  misAusencias: AusenciaAgenda[],
): string {
  const noTrabajo = diasQueNoTrabajo(misAusencias, desde, addDaysToKey(desde, 60));
  return proximoDiaHabilQueTrabajo(desde, feriados, noTrabajo, { desdeInclusive: false });
}

/** Etiqueta corta para chip de calendario. */
export function etiquetaChipTarea(oc: OcurrenciaAgenda): string {
  const titulo = oc.titulo;
  switch (oc.estado) {
    case 'hecha':
      return `✅ ${titulo}`;
    case 'no_hecha':
      return `⏭ ${titulo}`;
    case 'movida':
      return `↷ ${titulo}`;
    case 'atrasada': {
      const n = oc.vecesAtrasada && oc.vecesAtrasada > 1 ? ` (${oc.vecesAtrasada})` : '';
      return `⚠ ${titulo}${n}`;
    }
    case 'no_aplica':
      return `· ${titulo}`;
    default:
      return `☐ ${titulo}`;
  }
}

/** Formato "desde el jueves". */
export function textoAtrasadaDesde(fechaProgramada: string): string {
  const p = parseDateOnly(fechaProgramada);
  if (!p) return fechaProgramada;
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const w = new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay();
  return `desde el ${nombres[w]}`;
}
