import { getUserProfileImage, getUserInitials } from '@/lib/utils/userImages';
import { calcularYFormatearAntiguedad } from '@/lib/equipo/antiguedad';
import {
  esCumpleaniosHoy,
  formatearCumpleaniosSinAnio,
  formatearFechaLarga,
} from '@/lib/equipo/cumpleanios';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';
import { Cake, CalendarDays, MapPin, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const AREA_LABELS: Record<string, string> = {
  ventas: 'Ventas',
  logistica: 'Logística',
  produccion: 'Producción',
  administracion: 'Administración',
};

interface PerfilHeaderProps {
  perfil: PerfilEquipo;
  /** Resultado de saldoVacaciones; null si sin límite o aún no calculado. */
  saldoVacaciones?: {
    disponiblesHoy: number;
    planificados: number;
  } | null;
  className?: string;
}

export function PerfilHeader({ perfil, saldoVacaciones, className }: PerfilHeaderProps) {
  const hoy = todayArgentinaDateKey();
  const foto = getUserProfileImage(perfil.nombre);
  const iniciales = getUserInitials(perfil.nombre);
  const antiguedad = perfil.fechaIngreso
    ? calcularYFormatearAntiguedad(perfil.fechaIngreso, hoy)
    : null;
  const ingresoLargo = perfil.fechaIngreso
    ? formatearFechaLarga(perfil.fechaIngreso)
    : null;
  const cumpleTxt = perfil.fechaNacimiento
    ? formatearCumpleaniosSinAnio(perfil.fechaNacimiento)
    : null;
  const cumpleHoy = perfil.fechaNacimiento
    ? esCumpleaniosHoy(perfil.fechaNacimiento, hoy)
    : false;
  const areaLabel = perfil.areaPrincipal
    ? AREA_LABELS[perfil.areaPrincipal] ?? perfil.areaPrincipal
    : null;

  return (
    <header
      className={cn(
        'rounded-[20px] border border-white/10 overflow-hidden',
        'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
        'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:gap-6">
        <div
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
          style={{ boxShadow: `inset 0 0 0 2px ${perfil.color}33` }}
        >
          {foto ? (
            <img
              src={foto}
              alt={perfil.nombre}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white/80">
              {iniciales || <User className="h-8 w-8" />}
            </div>
          )}
          <span
            className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full border-2 border-zinc-900"
            style={{ backgroundColor: perfil.color }}
            title="Tu color en el equipo"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {perfil.nombre}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[perfil.puesto, areaLabel].filter(Boolean).join(' · ') || 'Sin puesto asignado'}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {ingresoLargo ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" />
                En Alcohn desde el {ingresoLargo}
                {antiguedad ? ` · ${antiguedad}` : ''}
              </span>
            ) : null}
            {cumpleTxt ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  cumpleHoy && 'text-amber-300',
                )}
              >
                <Cake className="h-3.5 w-3.5 shrink-0 opacity-70" />
                Cumpleaños: {cumpleTxt}
                {cumpleHoy ? ' · ¡Hoy!' : ''}
              </span>
            ) : null}
            {areaLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                Área: {areaLabel}
              </span>
            ) : null}
          </div>

          {/* Contador de vacaciones (Etapa 2). Sin límite: no se muestra (D19b). */}
          {!perfil.vacacionesSinLimite && saldoVacaciones ? (
            <div className="text-xs text-muted-foreground">
              <p>
                Vacaciones:{' '}
                <span className="font-medium text-white">
                  {saldoVacaciones.disponiblesHoy} días disponibles
                </span>
              </p>
              {saldoVacaciones.planificados > 0 ? (
                <p className="text-muted-foreground/80">
                  {saldoVacaciones.planificados} ya planificados
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
