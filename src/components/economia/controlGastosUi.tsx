/**
 * Piezas visuales compartidas por «Mes en curso» (Economía) y «Gastos automáticos» (Gastos).
 * Criterio (docs/17-estetica, lecciones de Inicio): poco ruido, etiquetas en minúscula y gris,
 * números grandes y lisos, estado = punto + texto, bronce solo en las barras de progreso.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

/** Sin decimales si el monto es redondo; si no, 2. */
export const formatUsd = (value: number, decimals?: number) => {
  const d = decimals ?? (Math.abs(value % 1) > 0.004 ? 2 : 0);
  return `USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(value)}`;
};

/** $ 16,5 M · $ 850 mil · $ 9.500 — para leer montos grandes de un vistazo. */
export function formatArsCorto(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  const nf = (n: number, d: number) =>
    new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
  if (abs >= 1_000_000) return `${sign}$ ${nf(abs / 1_000_000, abs >= 10_000_000 ? 1 : 2)} M`;
  if (abs >= 10_000) return `${sign}$ ${nf(abs / 1_000, 0)} mil`;
  return `${sign}$ ${nf(abs, 0)}`;
}

export const formatPct = (n: number, d = 0) =>
  `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n * 100).replace('-', '−')} %`;

/** Superficie base: sólida, sin borde visible, radio grande. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-3xl bg-white/[0.035] p-5 sm:p-6', className)}>{children}</section>;
}

export function PanelTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
        {sub ? <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export type Tono = 'ok' | 'mal' | 'aviso' | 'neutro';

const DOT: Record<Tono, string> = {
  ok: 'bg-emerald-400',
  mal: 'bg-red-400',
  aviso: 'bg-amber-400',
  neutro: 'bg-white/30',
};

/** Estado = punto + texto. */
export function Estado({ tono, children, className }: { tono: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[13px] text-foreground/90', className)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[tono])} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** Barra de bronce (progreso). `marca` = posición 0–1 de una línea de referencia (ej. objetivo). */
export function BarraBronce({ valor, marca, className }: { valor: number; marca?: number; className?: string }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <div className={cn('relative h-2 w-full rounded-full bg-white/[0.07]', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#8a4a1c] via-[#e0812f] to-[#f6c46b] transition-[width] duration-700 ease-out"
        style={{ width: `${v * 100}%` }}
      />
      {marca != null ? (
        <div
          className="absolute -top-1.5 h-5 w-px bg-foreground/70"
          style={{ left: `${Math.max(0, Math.min(1, marca)) * 100}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/** Barra neutra para proporciones (desgloses). */
export function BarraNeutra({ valor, tono = 'neutro', className }: { valor: number; tono?: 'neutro' | 'fuerte' | 'mal'; className?: string }) {
  const v = Math.max(0, Math.min(1, valor));
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-white/[0.06]', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tono === 'neutro' && 'bg-white/25',
          tono === 'fuerte' && 'bg-white/70',
          tono === 'mal' && 'bg-red-400/80',
        )}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  );
}

/** Selector de dos o tres opciones (segmented control). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: Array<{ valor: T; label: string }>;
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-white/[0.06] p-0.5 text-xs">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cn(
            'rounded-full px-3 py-1 transition-colors',
            o.valor === valor ? 'bg-white/[0.14] text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
