import { cumpleaniosEnAnio } from './cumpleanios';
import {
  eachDateKey,
  isWeekday,
  monthEndKey,
  monthStartKey,
  toDateKey,
  parseDateOnly,
  weekdayOfKey,
} from './fechas';

export type CalendarioPersona = {
  userId: string;
  nombre: string;
  color: string;
  fechaNacimiento: string | null;
};

export type CalendarioAusencia = {
  id: string;
  userId: string;
  tipo: 'vacaciones' | 'cambio_dia';
  fechaDesde: string;
  fechaHasta: string;
  fechaRecupero?: string | null;
};

export type CalendarioFeriado = {
  id: string;
  fecha: string;
  nombre: string;
  origen: 'nacional' | 'empresa';
};

export type EventoCalendario =
  | {
      kind: 'vacaciones';
      userId: string;
      nombre: string;
      color: string;
      ausenciaId: string;
    }
  | {
      kind: 'cambio_falta';
      userId: string;
      nombre: string;
      color: string;
      ausenciaId: string;
    }
  | {
      kind: 'cambio_recupero';
      userId: string;
      nombre: string;
      color: string;
      ausenciaId: string;
    }
  | {
      kind: 'feriado';
      feriadoId: string;
      nombre: string;
      origen: 'nacional' | 'empresa';
    }
  | {
      kind: 'cumpleanios';
      userId: string;
      nombre: string;
      color: string;
    };

export type DiaCalendario = {
  fecha: string;
  /** 0=domingo … 6=sábado */
  weekday: number;
  esFinDeSemana: boolean;
  esOtroMes: boolean;
  eventos: EventoCalendario[];
};

export type MesCalendario = {
  year: number;
  month: number;
  dias: DiaCalendario[];
};

function nombreDe(
  personas: Map<string, CalendarioPersona>,
  userId: string,
): { nombre: string; color: string } {
  const p = personas.get(userId);
  return { nombre: p?.nombre ?? 'Integrante', color: p?.color ?? '#9CA3AF' };
}

/**
 * Arma la grilla del mes (semanas lunes→domingo, puede incluir días del mes anterior/siguiente).
 */
export function armarMesCalendario(input: {
  year: number;
  month: number; // 1–12
  personas: CalendarioPersona[];
  ausencias: CalendarioAusencia[];
  feriados: CalendarioFeriado[];
  /** Filtrar eventos de persona (userId). null = todas. */
  filtroUserIds?: string[] | null;
}): MesCalendario {
  const { year, month } = input;
  const filtro =
    input.filtroUserIds && input.filtroUserIds.length > 0
      ? new Set(input.filtroUserIds)
      : null;

  const personasMap = new Map(input.personas.map((p) => [p.userId, p]));
  const mesInicio = monthStartKey(year, month);
  const mesFin = monthEndKey(year, month);

  // Grilla: desde el lunes de la semana del 1 hasta el domingo de la semana del último día.
  const startWd = weekdayOfKey(mesInicio); // 0=dom…6=sáb
  const offsetLunes = startWd === 0 ? 6 : startWd - 1; // días a retroceder hasta lunes
  const gridStartParts = parseDateOnly(mesInicio)!;
  const gridStartDate = new Date(
    Date.UTC(gridStartParts.y, gridStartParts.m - 1, gridStartParts.d - offsetLunes, 12),
  );
  const endWd = weekdayOfKey(mesFin);
  const offsetDomingo = endWd === 0 ? 0 : 7 - endWd;
  const gridEndParts = parseDateOnly(mesFin)!;
  const gridEndDate = new Date(
    Date.UTC(gridEndParts.y, gridEndParts.m - 1, gridEndParts.d + offsetDomingo, 12),
  );
  const gridStart = toDateKey({
    y: gridStartDate.getUTCFullYear(),
    m: gridStartDate.getUTCMonth() + 1,
    d: gridStartDate.getUTCDate(),
  });
  const gridEnd = toDateKey({
    y: gridEndDate.getUTCFullYear(),
    m: gridEndDate.getUTCMonth() + 1,
    d: gridEndDate.getUTCDate(),
  });

  const eventosPorDia = new Map<string, EventoCalendario[]>();
  const push = (fecha: string, ev: EventoCalendario) => {
    const list = eventosPorDia.get(fecha) ?? [];
    list.push(ev);
    eventosPorDia.set(fecha, list);
  };

  for (const f of input.feriados) {
    if (f.fecha < mesInicio || f.fecha > mesFin) {
      // también mostrar si cae en celdas de otro mes de la grilla
      if (f.fecha < gridStart || f.fecha > gridEnd) continue;
    }
    push(f.fecha, {
      kind: 'feriado',
      feriadoId: f.id,
      nombre: f.nombre,
      origen: f.origen,
    });
  }

  for (const a of input.ausencias) {
    if (filtro && !filtro.has(a.userId)) continue;
    const { nombre, color } = nombreDe(personasMap, a.userId);

    if (a.tipo === 'vacaciones') {
      for (const d of eachDateKey(a.fechaDesde, a.fechaHasta)) {
        if (d < gridStart || d > gridEnd) continue;
        // Solo mostrar días hábiles de vacaciones? El plan dice chips "🏖 Cachi" en cada día del rango.
        // Mostrar todos los días del rango en la grilla (incluye finde si el rango los cubre).
        push(d, {
          kind: 'vacaciones',
          userId: a.userId,
          nombre,
          color,
          ausenciaId: a.id,
        });
      }
    } else {
      // falta el día
      if (a.fechaDesde >= gridStart && a.fechaDesde <= gridEnd) {
        push(a.fechaDesde, {
          kind: 'cambio_falta',
          userId: a.userId,
          nombre,
          color,
          ausenciaId: a.id,
        });
      }
      if (a.fechaRecupero && a.fechaRecupero >= gridStart && a.fechaRecupero <= gridEnd) {
        push(a.fechaRecupero, {
          kind: 'cambio_recupero',
          userId: a.userId,
          nombre,
          color,
          ausenciaId: a.id,
        });
      }
    }
  }

  for (const p of input.personas) {
    if (!p.fechaNacimiento) continue;
    if (filtro && !filtro.has(p.userId)) continue;
    // Cumpleaños en este mes (y en celdas de meses adyacentes de la grilla, si aplica).
    for (const anio of [year - 1, year, year + 1]) {
      const c = cumpleaniosEnAnio(p.fechaNacimiento, anio);
      if (!c) continue;
      const key = toDateKey(c);
      if (key < gridStart || key > gridEnd) continue;
      push(key, {
        kind: 'cumpleanios',
        userId: p.userId,
        nombre: p.nombre,
        color: p.color,
      });
    }
  }

  const dias: DiaCalendario[] = [];
  for (const fecha of eachDateKey(gridStart, gridEnd)) {
    const wd = weekdayOfKey(fecha);
    const parts = parseDateOnly(fecha)!;
    dias.push({
      fecha,
      weekday: wd,
      esFinDeSemana: wd === 0 || wd === 6,
      esOtroMes: parts.m !== month || parts.y !== year,
      eventos: eventosPorDia.get(fecha) ?? [],
    });
  }

  return { year, month, dias };
}

/** Quién falta hoy (vacaciones o cambio_dia falta), para el cartel "Hoy no están". */
export function quienesFaltanHoy(input: {
  hoy: string;
  personas: CalendarioPersona[];
  ausencias: CalendarioAusencia[];
}): Array<{ userId: string; nombre: string; motivo: 'vacaciones' | 'cambio_dia' }> {
  const personasMap = new Map(input.personas.map((p) => [p.userId, p]));
  const out: Array<{ userId: string; nombre: string; motivo: 'vacaciones' | 'cambio_dia' }> = [];
  const seen = new Set<string>();

  for (const a of input.ausencias) {
    if (a.tipo === 'vacaciones') {
      if (input.hoy >= a.fechaDesde && input.hoy <= a.fechaHasta) {
        if (seen.has(a.userId)) continue;
        // Si es finde, igual "no están" si cargaron el rango; el cartel es informativo.
        seen.add(a.userId);
        out.push({
          userId: a.userId,
          nombre: personasMap.get(a.userId)?.nombre ?? 'Integrante',
          motivo: 'vacaciones',
        });
      }
    } else if (a.fechaDesde === input.hoy) {
      if (seen.has(a.userId)) continue;
      seen.add(a.userId);
      out.push({
        userId: a.userId,
        nombre: personasMap.get(a.userId)?.nombre ?? 'Integrante',
        motivo: 'cambio_dia',
      });
    }
  }
  return out;
}

/** ¿El día es hábil (lun–vie y no feriado)? Para validar cambio de día. */
export function esDiaHabilParaCambio(
  fecha: string,
  feriados: Iterable<string> | Set<string>,
): boolean {
  if (!isWeekday(fecha)) return false;
  const set = feriados instanceof Set ? feriados : new Set(feriados);
  return !set.has(fecha);
}

/** Otras personas con vacaciones que se solapan con [desde, hasta]. */
export function solapamientosVacaciones(input: {
  fechaDesde: string;
  fechaHasta: string;
  ausencias: CalendarioAusencia[];
  personas: CalendarioPersona[];
  excluirUserId?: string;
}): Array<{ userId: string; nombre: string; fechaDesde: string; fechaHasta: string }> {
  const personasMap = new Map(input.personas.map((p) => [p.userId, p]));
  const out: Array<{
    userId: string;
    nombre: string;
    fechaDesde: string;
    fechaHasta: string;
  }> = [];

  for (const a of input.ausencias) {
    if (a.tipo !== 'vacaciones') continue;
    if (input.excluirUserId && a.userId === input.excluirUserId) continue;
    // solapa si desde <= a.hasta && hasta >= a.desde
    if (input.fechaDesde <= a.fechaHasta && input.fechaHasta >= a.fechaDesde) {
      out.push({
        userId: a.userId,
        nombre: personasMap.get(a.userId)?.nombre ?? 'Integrante',
        fechaDesde: a.fechaDesde,
        fechaHasta: a.fechaHasta,
      });
    }
  }
  return out;
}
