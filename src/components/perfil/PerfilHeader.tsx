import type { ReactNode } from 'react';
import { getUserProfileImage, getUserInitials } from '@/lib/utils/userImages';
import { calcularYFormatearAntiguedad } from '@/lib/equipo/antiguedad';
import {
  esCumpleaniosHoy,
  formatearCumpleaniosSinAnio,
  formatearFechaLarga,
} from '@/lib/equipo/cumpleanios';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';
import { User } from 'lucide-react';
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

function Dato({ label, value, hint, destacar }: { label: string; value: ReactNode; hint?: ReactNode; destacar?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums tracking-tight', destacar && 'text-[#f6c46b]')}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
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
  // Si el puesto ya nombra el área (ej. "Dueño / administración"), no repetirla.
  const subtitulo =
    [
      perfil.puesto,
      areaLabel && !perfil.puesto?.toLowerCase().includes(areaLabel.toLowerCase()) ? areaLabel : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Sin puesto asignado';

  return (
    <header className={cn('flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-5">
        <div className="relative size-20 shrink-0">
          <div className="size-full overflow-hidden rounded-3xl bg-white/[0.05]">
            {foto ? (
              <img src={foto} alt={perfil.nombre} className="size-full object-cover" draggable={false} />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-semibold text-foreground/80">
                {iniciales || <User className="size-8" />}
              </div>
            )}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-4 ring-background"
            style={{ backgroundColor: perfil.color }}
            title="Tu color en el equipo"
          />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{perfil.nombre}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-10 gap-y-4 sm:flex sm:flex-wrap sm:items-end lg:justify-end">
        {antiguedad ? (
          <Dato label="En Alcohn" value={antiguedad} hint={ingresoLargo ? `desde el ${ingresoLargo}` : undefined} />
        ) : null}
        {perfil.vacacionesSinLimite ? (
          <Dato label="Vacaciones" value="Sin límite" />
        ) : saldoVacaciones ? (
          <Dato
            label="Vacaciones"
            value={`${saldoVacaciones.disponiblesHoy} ${saldoVacaciones.disponiblesHoy === 1 ? 'día' : 'días'}`}
            hint={saldoVacaciones.planificados > 0 ? `${saldoVacaciones.planificados} ya planificados` : 'disponibles'}
          />
        ) : null}
        {cumpleTxt ? (
          <Dato label="Cumpleaños" value={cumpleHoy ? '¡Hoy!' : cumpleTxt} destacar={cumpleHoy} />
        ) : null}
      </div>
    </header>
  );
}
