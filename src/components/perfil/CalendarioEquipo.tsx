import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils/cn';
import type { DiaCalendario, EventoCalendario } from '@/lib/equipo/calendarioEquipo';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  return undefined;
}

interface CalendarioEquipoProps {
  year: number;
  month: number;
  dias: DiaCalendario[];
  hoy: string;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  className?: string;
}

export function CalendarioEquipo({
  year,
  month,
  dias,
  hoy,
  onPrev,
  onNext,
  onHoy,
  className,
}: CalendarioEquipoProps) {
  const weeks: DiaCalendario[][] = [];
  for (let i = 0; i < dias.length; i += 7) {
    weeks.push(dias.slice(i, i + 7));
  }

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
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="min-w-[10rem] text-center text-sm font-semibold text-white">
            {MESES[month - 1]} {year}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onHoy}>
          Hoy
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <div className="min-w-[640px]">
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
            <div key={week[0]?.fecha} className="grid grid-cols-7 border-b border-white/[0.06] last:border-0">
              {week.map((dia) => {
                const esHoy = dia.fecha === hoy;
                return (
                  <div
                    key={dia.fecha}
                    className={cn(
                      'min-h-[88px] border-r border-white/[0.04] p-1.5 last:border-r-0',
                      dia.esFinDeSemana && 'bg-white/[0.015]',
                      dia.esOtroMes && 'opacity-40',
                      esHoy && 'bg-primary/10',
                    )}
                  >
                    <div
                      className={cn(
                        'mb-1 text-[11px] font-medium',
                        esHoy ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {Number(dia.fecha.slice(8, 10))}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dia.eventos.slice(0, 4).map((ev, idx) => (
                        <span
                          key={`${ev.kind}-${idx}-${
                            'ausenciaId' in ev
                              ? ev.ausenciaId
                              : 'feriadoId' in ev
                                ? ev.feriadoId
                                : ev.userId
                          }`}
                          title={chipLabel(ev)}
                          className="truncate rounded border px-1 py-0.5 text-[9px] leading-tight"
                          style={chipStyle(ev)}
                        >
                          {chipLabel(ev)}
                        </span>
                      ))}
                      {dia.eventos.length > 4 ? (
                        <span className="text-[9px] text-muted-foreground">
                          +{dia.eventos.length - 4}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
