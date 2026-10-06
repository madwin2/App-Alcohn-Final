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
import { ChevronLeft, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  switch (ev.kind) {
    case 'vacaciones':
      return `🏖 ${ev.nombre.split(' ')[0]}`;
    case 'cambio_falta':
      return `↔ ${ev.nombre.split(' ')[0]} falta`;
    case 'cambio_recupero':
      return `↔ ${ev.nombre.split(' ')[0]} recupera`;
    case 'feriado':
      return ev.origen === 'nacional' ? `🇦🇷 ${ev.nombre}` : `🏢 ${ev.nombre}`;
    case 'cumpleanios':
      return `🎂 ${ev.nombre.split(' ')[0]}`;
    case 'tarea':
      if (ev.resumenCount && ev.resumenCount > 0) {
        return `☐ ${ev.resumenCount} tareas`;
      }
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
      backgroundColor: `${ev.color}33`,
      borderColor: `${ev.color}88`,
      color: '#fff',
    };
  }
  if (ev.kind === 'feriado') {
    return ev.origen === 'empresa'
      ? { backgroundColor: 'rgba(120,113,108,0.35)', borderColor: 'rgba(168,162,158,0.5)' }
      : { backgroundColor: 'rgba(59,130,246,0.2)', borderColor: 'rgba(59,130,246,0.45)' };
  }
  if (ev.kind === 'tarea') {
    const muted =
      ev.estado === 'hecha' ||
      ev.estado === 'no_hecha' ||
      ev.estado === 'no_aplica';
    return {
      backgroundColor: muted ? 'rgba(255,255,255,0.04)' : 'rgba(167,139,250,0.18)',
      borderColor: muted ? 'rgba(255,255,255,0.12)' : 'rgba(167,139,250,0.45)',
      color: muted ? 'rgba(255,255,255,0.55)' : '#fff',
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
  let tareasVisibles = tareas;
  if (vista === 'mes' && tareas.length > 2) {
    tareasVisibles = [
      {
        kind: 'tarea' as const,
        tareaId: '__resumen__',
        titulo: `${tareas.length} tareas`,
        estado: 'pendiente' as const,
        fechaProgramada: tareas[0]?.fechaProgramada ?? '',
        fechaVisible: tareas[0]?.fechaVisible ?? '',
        resumenCount: tareas.length,
      },
    ];
  }

  const combined = [...publicos, ...tareasVisibles];
  if (vista === 'mes') {
    const max = 5;
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

function tituloVista(input: {
  vista: VistaCalendario;
  year: number;
  month: number;
  semanaDesde?: string;
}): string {
  if (input.vista === 'agenda') return 'Próximos días';
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
    return (
      <button
        key={eventoKey(ev, idx)}
        type="button"
        title={chipLabel(ev)}
        onClick={(e) => {
          e.stopPropagation();
          if (esResumen) {
            onDiaClick?.(fecha);
            return;
          }
          onChipClick?.(ev, fecha);
        }}
        className={cn(
          'truncate rounded border px-1 py-0.5 text-left text-[9px] leading-tight transition-opacity hover:opacity-90 sm:text-[10px]',
          esCumple && 'ring-1 ring-amber-400/70 ring-offset-0',
          ev.kind === 'tarea' && ev.estado === 'hecha' && 'line-through opacity-70',
        )}
        style={chipStyle(ev)}
      >
        {chipLabel(ev)}
      </button>
    );
  };

  const renderCelda = (dia: DiaCalendario, compact?: boolean) => {
    const esHoy = dia.fecha === hoy;
    const eventos = prepararEventosCelda(dia.eventos, vista, mostrarTareas);
    const tieneCumple = dia.eventos.some((e) => e.kind === 'cumpleanios');

    const inner = (
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
        className={cn(
          'relative min-h-[88px] border-r border-white/[0.04] p-1.5 last:border-r-0',
          compact && 'min-h-[120px]',
          dia.esFinDeSemana && 'bg-white/[0.015]',
          dia.esOtroMes && vista === 'mes' && 'opacity-40',
          esHoy && 'bg-primary/10',
          enRango(dia.fecha) && 'bg-primary/20 ring-1 ring-inset ring-primary/40',
          tieneCumple && esHoy && 'ring-1 ring-amber-400/50',
          onDiaClick && 'cursor-pointer hover:bg-white/[0.03]',
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-1">
          <div
            className={cn(
              'text-[11px] font-medium',
              esHoy ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {Number(dia.fecha.slice(8, 10))}
          </div>
          {onAgregarMenu ? (
            <MenuAgregarDia
              fecha={dia.fecha}
              esAdmin={esAdmin}
              onAgregarMenu={onAgregarMenu}
              trigger={
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-white/10 group-hover/celda:opacity-100 focus:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Acciones del día"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              }
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          {eventos.map((ev, idx) => {
            const atenuarVacFinde = dia.esFinDeSemana && ev.kind === 'vacaciones';
            return (
              <span key={eventoKey(ev, idx)} className={cn(atenuarVacFinde && 'opacity-40')}>
                {renderChip(ev, dia.fecha, idx)}
              </span>
            );
          })}
        </div>
      </div>
    );

    return (
      <ContextMenuDia fecha={dia.fecha} esAdmin={esAdmin} onAgregarMenu={onAgregarMenu}>
        <div className="group/celda h-full">{inner}</div>
      </ContextMenuDia>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="flex min-w-[10rem] items-center justify-center gap-2 text-center text-sm font-semibold text-white">
            {tituloVista({ vista, year, month, semanaDesde })}
            {loadingSuave ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onVistaChange ? (
            <div className="hidden rounded-lg border border-white/10 p-0.5 sm:flex">
              {(['mes', 'semana', 'agenda'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onVistaChange(v)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] capitalize',
                    vista === v ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white',
                  )}
                >
                  {v === 'mes' ? 'Mes' : v === 'semana' ? 'Semana' : 'Agenda'}
                </button>
              ))}
            </div>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onHoy}>
            Hoy
          </Button>
        </div>
      </div>

      {vista === 'agenda' ? (
        <div className="space-y-2 rounded-xl border border-white/10 p-2">
          {(agendaDias ?? []).map((dia) => (
            <div
              key={dia.fecha}
              className={cn(
                'rounded-lg border border-white/[0.06] p-3',
                dia.fecha === hoy && 'border-primary/30 bg-primary/5',
              )}
            >
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between text-left"
                onClick={() => onDiaClick?.(dia.fecha)}
              >
                <span className="text-sm font-medium text-white">
                  {dia.fecha === hoy ? 'Hoy · ' : ''}
                  {dia.fecha}
                </span>
                {onAgregarMenu ? (
                  <MenuAgregarDia
                    fecha={dia.fecha}
                    esAdmin={esAdmin}
                    onAgregarMenu={onAgregarMenu}
                    trigger={
                      <span className="text-xs text-muted-foreground underline">Agregar</span>
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
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <div className={cn(vista === 'mes' && 'min-w-[640px] sm:min-w-0')}>
            <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03]">
              {DIAS_SEMANA.map((d) => (
                <div
                  key={d}
                  className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div
                key={week[0]?.fecha}
                className="grid grid-cols-7 border-b border-white/[0.06] last:border-0"
              >
                {week.map((dia) => (
                  <div key={dia.fecha}>{fechasSet.has(dia.fecha) ? renderCelda(dia, vista === 'semana') : null}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
