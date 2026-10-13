/**
 * Piezas visuales de Mi perfil y del corcho. Mismo criterio que «Mes en curso» (Economía):
 * superficies sin borde y radio grande, etiquetas grises en minúscula, números grandes y lisos,
 * estado = punto + texto. Se reutilizan las piezas de `controlGastosUi`.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Estado, Panel, PanelTitle, Segmentado, Stat, type Tono } from '@/components/economia/controlGastosUi';

export { Estado, Panel, PanelTitle, Segmentado, Stat, type Tono };

/** Contenido de diálogo: mismo material que los paneles. Usar en `DialogContent className`. */
export const DIALOGO = 'rounded-3xl border-white/[0.06] bg-[#111113] p-6 sm:p-7';

/** Hoja lateral (Sheet) con el mismo material. */
export const HOJA = 'border-white/[0.06] bg-[#111113]';

/** Envoltorio de campo para los DatePicker (en vez del borde duro del input). */
export const CAMPO = 'rounded-xl bg-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.06]';

/** Fila de lista dentro de un panel (sin caja propia). */
export const FILA = 'rounded-2xl bg-white/[0.03] px-4 py-3';

/** Etiqueta de sección dentro de un panel. */
export function Etiqueta({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cn('mb-2 flex items-center justify-between gap-2', className)}>
      <p className="text-[13px] text-muted-foreground">{children}</p>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** Aviso dentro de formularios y paneles: punto + texto, sin caja de color. */
export function Aviso({ tono = 'aviso', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <Estado tono={tono} className={cn('items-start text-xs leading-relaxed [&>span:first-child]:mt-[5px]', className)}>
      {children}
    </Estado>
  );
}

/** Estado vacío dentro de un panel. */
export function Vacio({ children, accion, className }: { children: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/[0.02] px-5 py-10 text-center', className)}>
      <p className="text-sm text-muted-foreground">{children}</p>
      {accion}
    </div>
  );
}

/** Contador chico al lado de un título (ej. cantidad de tareas). */
export function Contador({ n, className }: { n: number; className?: string }) {
  return <span className={cn('ml-1.5 tabular-nums text-muted-foreground', className)}>{n}</span>;
}

/** Pestañas tipo píldora (mismas que Economía). */
export function PillTabsList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <TabsList className={cn('h-auto gap-0.5 rounded-full bg-white/[0.05] p-1', className)}>{children}</TabsList>
    </div>
  );
}

export function PillTab({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'gap-1.5 rounded-full px-4 py-1.5 text-sm text-muted-foreground data-[state=active]:bg-white/[0.14] data-[state=active]:text-foreground data-[state=active]:shadow-none',
        className,
      )}
    >
      {children}
    </TabsTrigger>
  );
}

/** Insignia numérica (no leídos). */
export function Insignia({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="min-w-[18px] rounded-full bg-[#e0812f] px-1.5 text-center text-[10px] font-semibold leading-[18px] text-black">
      {n}
    </span>
  );
}

/** Botón de acción rápida (píldora suave con ícono). */
export function AccionRapida({
  icon,
  children,
  onClick,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-sm text-foreground/90 transition-colors hover:bg-white/[0.1] hover:text-foreground',
        className,
      )}
    >
      {icon ? <span className="text-muted-foreground [&>svg]:size-4">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Botón ícono redondo y discreto (editar, borrar, pausar). */
export function BotonIcono({
  children,
  label,
  onClick,
  peligro,
  disabled,
  className,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  peligro?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-3.5',
        peligro && 'hover:bg-red-500/10 hover:text-red-400',
        className,
      )}
    >
      {children}
    </button>
  );
}
