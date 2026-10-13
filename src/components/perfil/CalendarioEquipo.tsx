import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils/cn';
import type { DiaCalendario, EventoCalendario } from '@/lib/equipo/calendarioEquipo';
import { etiquetaChipTarea } from '@/lib/equipo/tareasAgenda';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Lun–vie anchos; sábado y domingo más angostos (casi no se usan). */
const COLUMNAS = 'grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.55fr)_minmax(0,0.55fr)]';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export type VistaCalendario = 'mes' | 'semana' | 'agenda';

export type AgregarMenuAccion =
  | 'tarea'
  | 'vacaciones'
  | 'cambio_dia'
  | 'feriado_empresa'
  | 'ausencia_otra';

function chipLabel(ev: EventoCalendario): string {
  const corto = 'nombre' in ev ? ev.nombre.split(' ')[0] : '';
  switch (ev.kind) {
    case 'vacaciones':
      return corto;
    case 'cambio_falta':
      return `${corto} falta`;
    case 'cambio_recupero':
      return `${corto} recupera`;
    case 'feriado':
      return ev.nombre;
    case 'cumpleanios':
      return `Cumple ${corto}`;
    case 'tarea':
      if (ev.resumenCount && ev.resumenCount > 0) {
        return ev.tareaId === '__mas__'
          ? `+${ev.resumenCount} más`
          : `${ev.resumenCount} ${ev.resumenCount === 1 ? 'tarea' : 'tareas'}`;
      }
      return ev.vecesAtrasada && ev.vecesAtrasada > 1
        ? `${ev.titulo} (${ev.vecesAtrasada})`
        : ev.titulo;
  }
}

/** Texto completo para el tooltip. */
function chipTitulo(ev: EventoCalendario): string {
  switch (ev.kind) {
    case 'vacaciones':
      return `${ev.nombre} · vacaciones`;
    case 'cambio_falta':
      return `${ev.nombre} · falta (cambio de día)`;
    case 'cambio_recupero':
      return `${ev.nombre} · recupera (cambio de día)`;
    case 'feriado':
      return `${ev.origen === 'nacional' ? 'Feriado' : 'Día de la empresa'} · ${ev.nombre}`;
    case 'cumpleanios':
      return `Cumpleaños de ${ev.nombre}`;
    case 'tarea':
      if (ev.resumenCount) return chipLabel(ev);
      return etiquetaChipTarea({
        tareaId: ev.tareaId,
        titulo: ev.titulo,
        frecuencia: ev.frecuencia ?? 'unica',
        fechaProgramada: ev.fechaProgramada,
        fechaVisible: ev.fechaVisible,
        estado: ev.estado,
        vecesAtrasada: ev.vecesAtrasada,
        fechasAgrupadas: ev.fechasAgrupadas,
        atrasadaDesde: ev.atrasadaDesde,
        registroEstado: ev.registroEstado,
        fechaDestino: ev.fechaDestino,
      });
  }
}

function chipStyle(ev: EventoCalendario): CSSProperties | undefined {
  if (
    ev.kind === 'vacaciones' ||
    ev.kind === 'cambio_falta' ||
    ev.kind === 'cambio_recupero' ||
    ev.kind === 'cumpleanios'
  ) {
    return {
      backgroundColor: `${ev.color}40`,
      boxShadow: `inset 2px 0 0 ${ev.color}`,
      color: 'rgba(255,255,255,0.92)',
    };
  }
  if (ev.kind === 'feriado') {
    return { backgroundColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.72)' };
  }
  if (ev.kind === 'tarea') {
    const muted =
      ev.estado === 'hecha' ||
      ev.estado === 'no_hecha' ||
      ev.estado === 'no_aplica';
    const atrasada = ev.estado === 'atrasada';
    return {
      backgroundColor: muted ? 'transparent' : 'rgba(255,255,255,0.05)',
      boxShadow: atrasada ? 'inset 2px 0 0 #fbbf24' : undefined,
      color: muted ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)',
    };
  }
  return undefined;
}

function eventoKey(ev: EventoCalendario, idx: number): string {
  if (ev.kind === 'tarea') {
    return ev.resumenCount
      ? `tarea-resumen-${idx}`
      : `tarea-${ev.tareaId}-${ev.fechaProgramada}-${idx}`;
  }
  if ('ausenciaId' in ev) return `${ev.kind}-${ev.ausenciaId}`;
  if (ev.kind === 'feriado') return `feriado-${ev.feriadoId}`;
  return `${ev.kind}-${ev.userId}-${idx}`;
}

function prepararEventosCelda(
  eventos: EventoCalendario[],
  vista: VistaCalendario,
  mostrarTareas: boolean,
): EventoCalendario[] {
  const publicos = eventos.filter((e) => e.kind !== 'tarea');
  if (!mostrarTareas) return publicos;

  const tareas = eventos.filter((e) => e.kind === 'tarea');
  const tareasVisibles = tareas;

  const combined = [...publicos, ...tareasVisibles];
  if (vista === 'mes') {
    const max = 4;
    if (combined.length > max) {
      return combined.slice(0, max - 1).concat([
        {
          kind: 'tarea',
          tareaId: '__mas__',
          titulo: `+${combined.length - (max - 1)} más`,
          estado: 'pendiente',
          fechaProgramada: '',
          fechaVisible: '',
          resumenCount: combined.length - (max - 1),
        },
      ]);
    }
  }
  return combined;
}

function fechaAgenda(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

type EventoVacaciones = Extract<EventoCalendario, { kind: 'vacaciones' }>;

/** Una vacación dentro de una semana: barra continua de `inicio` a `fin` (índices 0–6). */
type Tramo = { ev: EventoVacaciones; inicio: number; fin: number; carril: number };

/** Alto de cada carril de barras (px) y cuántos se muestran por semana antes de resumir. */
const CARRIL_PX = 24;
const MAX_CARRILES = 3;

/** Rayado diagonal muy suave para feriados y fines de semana. */
const RAYADO =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px)';

function tramosDeSemana(week: DiaCalendario[]): { tramos: Tramo[]; carriles: number } {
  const porAusencia = new Map<string, { ev: EventoVacaciones; idxs: number[] }>();
  week.forEach((dia, i) => {
    for (const e of dia.eventos) {
      if (e.kind !== 'vacaciones') continue;
      const item = porAusencia.get(e.ausenciaId) ?? { ev: e, idxs: [] };
      item.idxs.push(i);
      porAusencia.set(e.ausenciaId, item);
    }
  });

  const segmentos: Array<{ ev: EventoVacaciones; inicio: number; fin: number }> = [];
  for (const { ev, idxs } of porAusencia.values()) {
    idxs.sort((a, b) => a - b);
    let inicio = idxs[0];
    let prev = idxs[0];
    for (const i of idxs.slice(1)) {
      if (i !== prev + 1) {
        segmentos.push({ ev, inicio, fin: prev });
        inicio = i;
      }
      prev = i;
    }
    segmentos.push({ ev, inicio, fin: prev });
  }
  segmentos.sort((a, b) => a.inicio - b.inicio || b.fin - b.inicio - (a.fin - a.inicio));

  const finPorCarril: number[] = [];
  const tramos: Tramo[] = segmentos.map((seg) => {
    let carril = finPorCarril.findIndex((fin) => fin < seg.inicio);
    if (carril === -1) {
      carril = finPorCarril.length;
      finPorCarril.push(seg.fin);
    } else {
      finPorCarril[carril] = seg.fin;
    }
    return { ...seg, carril };
  });
  return { tramos, carriles: finPorCarril.length };
}

function tituloVista(input: {
  vista: VistaCalendario;
  year: number;
  month: number;
  semanaDesde?: string;
}): string {
  if (input.vista === 'agenda') return 'Próximos 14 días';
  if (input.vista === 'semana' && input.semanaDesde) {
    const d = Number(input.semanaDesde.slice(8, 10));
    const m = Number(input.semanaDesde.slice(5, 7));
    return `Semana del ${d}/${m}`;
  }
  return `${MESES[input.month - 1]} ${input.year}`;
}

export interface CalendarioEquipoProps {
  year: number;
  month: number;
  dias: DiaCalendario[];
  /** Vista agenda: días con eventos (p. ej. 14 días). */
  agendaDias?: DiaCalendario[];
  hoy: string;
  vista: VistaCalendario;
  onVistaChange?: (v: VistaCalendario) => void;
  loadingSuave?: boolean;
  mostrarTareas?: boolean;
  esAdmin?: boolean;
  semanaDesde?: string;
  onDiaClick?: (fecha: string) => void;
  onChipClick?: (ev: EventoCalendario, fecha: string) => void;
  onAgregarMenu?: (fecha: string, accion: AgregarMenuAccion) => void;
  onRangoSeleccionado?: (desde: string, hasta: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  className?: string;
}

function MenuAgregarDia({
  fecha,
  esAdmin,
  onAgregarMenu,
  trigger,
}: {
  fecha: string;
  esAdmin?: boolean;
  onAgregarMenu?: (fecha: string, accion: AgregarMenuAccion) => void;
  trigger: ReactNode;
}) {
  if (!onAgregarMenu) return <>{trigger}</>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onAgregarMenu(fecha, 'tarea')}>Tarea</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAgregarMenu(fecha, 'vacaciones')}>
          Vacaciones
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAgregarMenu(fecha, 'cambio_dia')}>
          Cambio de día
        </DropdownMenuItem>
        {esAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAgregarMenu(fecha, 'feriado_empresa')}>
              Día de la empresa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAgregarMenu(fecha, 'ausencia_otra')}>
              Ausencia de otra persona
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContextMenuDia({
  fecha,
  esAdmin,
  onAgregarMenu,
  children,
}: {
  fecha: string;
  esAdmin?: boolean;
  onAgregarMenu?: (fecha: string, accion: AgregarMenuAccion) => void;
  children: ReactNode;
}) {
  if (!onAgregarMenu) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => onAgregarMenu(fecha, 'tarea')}>Tarea</ContextMenuItem>
        <ContextMenuItem onClick={() => onAgregarMenu(fecha, 'vacaciones')}>
          Vacaciones
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAgregarMenu(fecha, 'cambio_dia')}>
          Cambio de día
        </ContextMenuItem>
        {esAdmin ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onAgregarMenu(fecha, 'feriado_empresa')}>
              Día de la empresa
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onAgregarMenu(fecha, 'ausencia_otra')}>
              Ausencia de otra persona
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function CalendarioEquipo({
  year,
  month,
  dias,
  agendaDias,
  hoy,
  vista,
  onVistaChange,
  loadingSuave,
  mostrarTareas = true,
  esAdmin,
  semanaDesde,
  onDiaClick,
  onChipClick,
  onAgregarMenu,
  onRangoSeleccionado,
  onPrev,
  onNext,
  onHoy,
  className,
}: CalendarioEquipoProps) {
  const [dragDesde, setDragDesde] = useState<string | null>(null);
  const [dragHasta, setDragHasta] = useState<string | null>(null);
  const draggingRef = useRef(false);

  const fechasSet = useMemo(() => new Set(dias.map((d) => d.fecha)), [dias]);

  const rangoSeleccion = useMemo(() => {
    if (!dragDesde || !dragHasta) return null;
    const desde = dragDesde < dragHasta ? dragDesde : dragHasta;
    const hasta = dragDesde < dragHasta ? dragHasta : dragDesde;
    return { desde, hasta };
  }, [dragDesde, dragHasta]);

  const enRango = useCallback(
    (fecha: string) => {
      if (!rangoSeleccion) return false;
      return fecha >= rangoSeleccion.desde && fecha <= rangoSeleccion.hasta;
    },
    [rangoSeleccion],
  );

  useEffect(() => {
    const up = () => {
      if (!draggingRef.current || !dragDesde || !dragHasta) {
        draggingRef.current = false;
        setDragDesde(null);
        setDragHasta(null);
        return;
      }
      const desde = dragDesde < dragHasta ? dragDesde : dragHasta;
      const hasta = dragDesde < dragHasta ? dragHasta : dragDesde;
      draggingRef.current = false;
      setDragDesde(null);
      setDragHasta(null);
      if (desde !== hasta) onRangoSeleccionado?.(desde, hasta);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragDesde, dragHasta, onRangoSeleccionado]);

  const startDrag = (fecha: string) => {
    if (!onRangoSeleccionado) return;
    draggingRef.current = true;
    setDragDesde(fecha);
    setDragHasta(fecha);
  };

  const moveDrag = (fecha: string) => {
    if (!draggingRef.current) return;
    setDragHasta(fecha);
  };

  const weeks: DiaCalendario[][] = [];
  if (vista === 'mes') {
    for (let i = 0; i < dias.length; i += 7) {
      weeks.push(dias.slice(i, i + 7));
    }
  } else if (vista === 'semana') {
    weeks.push(dias.slice(0, 7));
  }

  const renderChip = (ev: EventoCalendario, fecha: string, idx: number) => {
    const esCumple = ev.kind === 'cumpleanios';
    const esResumen = ev.kind === 'tarea' && (ev.resumenCount || ev.tareaId === '__mas__');
    if (esResumen) {
      const atrasada = ev.kind === 'tarea' && ev.estado === 'atrasada';
      const hecha = ev.kind === 'tarea' && ev.estado === 'hecha';
      return (
        <button
          key={eventoKey(ev, idx)}
          type="button"
          title={chipTitulo(ev)}
          onClick={(e) => {
            e.stopPropagation();
            onDiaClick?.(fecha);
          }}
          className="flex w-full items-center gap-1.5 px-1.5 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {ev.tareaId === '__mas__' ? null : (
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                atrasada ? 'bg-amber-400' : hecha ? 'bg-emerald-400/70' : 'bg-white/40',
              )}
              aria-hidden
            />
          )}
          <span className="truncate">{chipLabel(ev)}</span>
        </button>
      );
    }
    if (ev.kind === 'tarea') {
      const cerrada = ev.estado === 'hecha' || ev.estado === 'no_hecha' || ev.estado === 'no_aplica';
      return (
        <button
          key={eventoKey(ev, idx)}
          type="button"
          title={chipTitulo(ev)}
          onClick={(e) => {
            e.stopPropagation();
            onChipClick?.(ev, fecha);
          }}
          className="flex w-full min-w-0 items-start gap-1.5 rounded-md px-1 py-[3px] text-left text-[11px] leading-snug transition-colors hover:bg-white/[0.06]"
        >
          <span
            className={cn(
              'mt-[5px] size-1.5 shrink-0 rounded-full',
              ev.estado === 'atrasada'
                ? 'bg-amber-400'
                : ev.estado === 'hecha'
                  ? 'bg-emerald-400/70'
                  : cerrada
                    ? 'bg-white/20'
                    : 'bg-white/50',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'line-clamp-2 break-words',
              cerrada ? 'text-muted-foreground/60 line-through' : 'text-foreground/85',
              ev.estado === 'movida' && 'italic text-muted-foreground',
            )}
          >
            {chipLabel(ev)}
          </span>
        </button>
      );
    }
    return (
      <button
        key={eventoKey(ev, idx)}
        type="button"
        title={chipTitulo(ev)}
        onClick={(e) => {
          e.stopPropagation();
          if (esResumen) {
            onDiaClick?.(fecha);
            return;
          }
          onChipClick?.(ev, fecha);
        }}
        className={cn(
          'w-full truncate rounded-md px-1.5 py-[3px] text-left text-[10px] leading-tight transition-[filter] hover:brightness-125 sm:text-[11px]',
          esCumple && 'font-medium',
        )}
        style={chipStyle(ev)}
      >
        {chipLabel(ev)}
      </button>
    );
  };

  const renderSemana = (week: DiaCalendario[]) => {
    const semana = vista === 'semana';
    const { tramos, carriles } = tramosDeSemana(week);
    const carrilesVisibles = Math.min(carriles, MAX_CARRILES);
    const reservado = carrilesVisibles * CARRIL_PX;

    return (
      <div key={week[0]?.fecha} className="relative border-b border-white/[0.06] last:border-0">
        {/* Celdas: número, feriado y eventos de un solo día */}
        <div className={COLUMNAS}>
          {week.map((dia, idx) => {
            if (!fechasSet.has(dia.fecha)) return <div key={dia.fecha} />;
            const esHoy = dia.fecha === hoy;
            const feriado = dia.eventos.find((e) => e.kind === 'feriado');
            const ocultas = tramos.filter(
              (t) => t.carril >= MAX_CARRILES && t.inicio <= idx && t.fin >= idx,
            ).length;
            const sueltos = prepararEventosCelda(
              dia.eventos.filter((e) => e.kind !== 'vacaciones' && e.kind !== 'feriado'),
              vista,
              mostrarTareas,
            );
            return (
              <ContextMenuDia key={dia.fecha} fecha={dia.fecha} esAdmin={esAdmin} onAgregarMenu={onAgregarMenu}>
                <div
                  role={onDiaClick ? 'button' : undefined}
                  tabIndex={onDiaClick ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onDiaClick?.(dia.fecha);
                  }}
                  onClick={() => onDiaClick?.(dia.fecha)}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    startDrag(dia.fecha);
                  }}
                  onMouseEnter={() => moveDrag(dia.fecha)}
                  style={dia.esFinDeSemana || feriado ? { backgroundImage: RAYADO } : undefined}
                  className={cn(
                    'group/celda relative flex min-h-[104px] select-none flex-col border-r border-white/[0.06] px-2 pb-2 pt-1.5 transition-colors last:border-r-0',
                    semana && 'min-h-[240px]',
                    onDiaClick && 'cursor-pointer hover:bg-white/[0.025]',
                    enRango(dia.fecha) && 'bg-[#e0812f]/[0.12]',
                  )}
                >
                  <div className={cn('flex h-6 items-center justify-between gap-1', dia.esOtroMes && !semana && 'opacity-30')}>
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] tabular-nums',
                        esHoy
                          ? 'bg-gradient-to-br from-[#e0812f] to-[#f6c46b] font-semibold text-black'
                          : dia.esFinDeSemana || feriado
                            ? 'text-muted-foreground/60'
                            : 'text-foreground/80',
                      )}
                    >
                      {Number(dia.fecha.slice(8, 10))}
                    </span>
                    {onAgregarMenu ? (
                      <MenuAgregarDia
                        fecha={dia.fecha}
                        esAdmin={esAdmin}
                        onAgregarMenu={onAgregarMenu}
                        trigger={
                          <button
                            type="button"
                            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground focus:opacity-100 group-hover/celda:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            aria-label="Agregar en este día"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                    ) : null}
                  </div>

                  <div className={cn('flex min-w-0 flex-1 flex-col gap-1', dia.esOtroMes && !semana && 'opacity-40')}>
                    {/* Lugar para las barras de vacaciones (capa de arriba) */}
                    {reservado > 0 ? <div style={{ height: reservado }} className="shrink-0" /> : null}
                    {ocultas > 0 ? (
                      <span className="px-1 text-[11px] text-muted-foreground">+{ocultas} de vacaciones</span>
                    ) : null}
                    {feriado && feriado.kind === 'feriado' ? (
                      <button
                        type="button"
                        title={chipTitulo(feriado)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onChipClick?.(feriado, dia.fecha);
                        }}
                        className="truncate px-1 text-left text-[11px] leading-tight text-muted-foreground hover:text-foreground"
                      >
                        {feriado.nombre}
                      </button>
                    ) : null}
                    {sueltos.map((ev, i) => renderChip(ev, dia.fecha, i))}
                  </div>
                </div>
              </ContextMenuDia>
            );
          })}
        </div>

        {/* Capa de barras: vacaciones continuas entre días */}
        {carrilesVisibles > 0 ? (
          <div
            className={cn(COLUMNAS, 'pointer-events-none absolute inset-x-0 top-[34px]')}
            style={{ gridAutoRows: `${CARRIL_PX}px` }}
          >
            {tramos
              .filter((t) => t.carril < MAX_CARRILES)
              .map((t) => (
                <button
                  key={`${t.ev.ausenciaId}-${t.inicio}`}
                  type="button"
                  title={chipTitulo(t.ev)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChipClick?.(t.ev, week[t.inicio].fecha);
                  }}
                  style={{
                    gridColumn: `${t.inicio + 1} / ${t.fin + 2}`,
                    gridRow: t.carril + 1,
                    backgroundColor: `${t.ev.color}52`,
                    boxShadow: `inset 3px 0 0 ${t.ev.color}`,
                  }}
                  className="pointer-events-auto mx-1 my-[2px] flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 text-left text-[11px] font-medium text-white/90 transition-[filter] hover:brightness-125"
                >
                  <span className="truncate">{t.ev.nombre.split(' ')[0]}</span>
                  {t.fin > t.inicio ? (
                    <span className="truncate font-normal text-white/50">vacaciones</span>
                  ) : null}
                </button>
              ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {tituloVista({ vista, year, month, semanaDesde })}
          {loadingSuave ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {onVistaChange ? (
            <div className="hidden rounded-full bg-white/[0.06] p-0.5 text-xs sm:inline-flex">
              {(['mes', 'semana', 'agenda'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onVistaChange(v)}
                  className={cn(
                    'rounded-full px-3 py-1 transition-colors',
                    vista === v ? 'bg-white/[0.14] text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Próximos días'}
                </button>
              ))}
            </div>
          ) : null}
          <div className="inline-flex items-center rounded-full bg-white/[0.06] p-0.5">
            <button type="button" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30" onClick={onPrev} aria-label="Anterior" disabled={vista === 'agenda'}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="h-8 rounded-full px-3 text-xs text-foreground/90 transition-colors hover:bg-white/[0.08]"
              onClick={onHoy}
            >
              Hoy
            </button>
            <button type="button" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30" onClick={onNext} aria-label="Siguiente" disabled={vista === 'agenda'}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {vista === 'agenda' ? (
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {(agendaDias ?? []).map((dia) => (
            <div
              key={dia.fecha}
              className={cn(
                'rounded-2xl bg-white/[0.03] p-3',
                dia.fecha === hoy && 'bg-[#e0812f]/[0.07]',
              )}
            >
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between text-left"
                onClick={() => onDiaClick?.(dia.fecha)}
              >
                <span className="text-sm font-medium first-letter:uppercase">
                  {dia.fecha === hoy ? 'Hoy · ' : ''}
                  {fechaAgenda(dia.fecha)}
                </span>
                {onAgregarMenu ? (
                  <MenuAgregarDia
                    fecha={dia.fecha}
                    esAdmin={esAdmin}
                    onAgregarMenu={onAgregarMenu}
                    trigger={
                      <span className="text-xs text-muted-foreground hover:text-foreground">Agregar</span>
                    }
                  />
                ) : null}
              </button>
              <div className="flex flex-col gap-1">
                {prepararEventosCelda(dia.eventos, 'agenda', mostrarTareas).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin eventos</p>
                ) : (
                  prepararEventosCelda(dia.eventos, 'agenda', mostrarTareas).map((ev, idx) =>
                    renderChip(ev, dia.fecha, idx),
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-inset ring-white/[0.06]">
          <div className={cn(vista === 'mes' && 'min-w-[640px] sm:min-w-0')}>
            <div className={cn(COLUMNAS, 'border-b border-white/[0.06]')}>
              {DIAS_SEMANA.map((d, i) => {
                const fecha = weeks[0]?.[i]?.fecha;
                return (
                  <div
                    key={d}
                    className={cn(
                      'px-3 py-2.5 text-left text-xs',
                      i >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground',
                    )}
                  >
                    {d}
                    {vista === 'semana' && fecha ? (
                      <span className="ml-1 tabular-nums text-muted-foreground/60">
                        {Number(fecha.slice(8, 10))}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {weeks.map(renderSemana)}
          </div>
        </div>
      )}
    </div>
  );
}
