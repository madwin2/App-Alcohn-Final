/**
 * Piezas visuales de la mesa de armado, en el idioma de la app (Economía,
 * Inicio): superficies sin borde, píldoras, estado = punto + texto, y el
 * bronce reservado para lo que es material (planchuelas y sellos).
 */
import type { ReactNode } from 'react';
import { useArtwork } from '@/components/programas/Preparation/StampArtwork';
import { cn } from '@/lib/utils/cn';

export function Panel({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return <section aria-label={label} className={cn('rounded-3xl bg-white/[0.035] p-4', className)}>{children}</section>;
}

/** Foco visible con teclado, igual en todos los controles de la mesa. */
export const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-0';

export const PILL_PRIMARY = `${FOCUS} inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-zinc-950 transition-colors hover:bg-white/90 disabled:opacity-35`;
export const PILL_SOFT = `${FOCUS} inline-flex items-center justify-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[13px] text-foreground/90 transition-colors hover:bg-white/[0.1] disabled:opacity-35`;
export const PILL_GHOST = `${FOCUS} inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-35`;

/** Selector en píldora (como «Gasto alto · En presupuesto»). */
export function Segmented<T extends string>({ value, options, onChange, disabled, size = 'md', className }: {
  value: T; options: { id: T; label: ReactNode; title?: string; disabled?: boolean }[]; onChange: (v: T) => void;
  disabled?: boolean; size?: 'sm' | 'md'; className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-full bg-white/[0.05] p-0.5', className)}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} title={o.title}
          disabled={disabled || o.disabled} onClick={() => onChange(o.id)}
          className={cn(FOCUS, 'flex-1 whitespace-nowrap rounded-full transition-colors disabled:opacity-30',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
            value === o.id ? 'bg-white/[0.14] font-medium text-foreground' : 'text-zinc-400 hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const DOT = { ok: 'bg-emerald-400', warning: 'bg-amber-400', error: 'bg-red-400', pending: 'bg-zinc-600', info: 'bg-sky-400' } as const;
export function Dot({ tone, className }: { tone: keyof typeof DOT; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', DOT[tone], className)} />;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[13px] text-zinc-400', className)}>{children}</p>;
}

/** Tecla de un atajo. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md bg-white/[0.08] px-1.5 py-0.5 font-sans text-[12px] text-foreground/90">{children}</kbd>;
}

/**
 * Diseño del sello relleno en blanco sobre fondo oscuro (el idioma de la vista
 * 2D). `upright`: la caja toma la orientación del dibujo para leerlo derecho.
 */
export function DesignTile({ sourceUrl, inline, widthPx: w0, heightPx: h0, upright = false, className, children }: {
  sourceUrl?: string; inline?: string; widthPx: number; heightPx: number; upright?: boolean; className?: string; children?: ReactNode;
}) {
  const art = useArtwork(sourceUrl, inline);
  const swap = upright && art && art.landscape !== w0 >= h0;
  const widthPx = swap ? h0 : w0, heightPx = swap ? w0 : h0;
  const pad = Math.max(2, Math.min(widthPx, heightPx) * 0.08);
  return (
    <div className={cn('relative overflow-hidden rounded-[3px] outline outline-1 outline-white/40', className)} style={{ width: widthPx, height: heightPx }}>
      {art ? (
        <img src={art.uri} alt="" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
          style={{ width: widthPx - pad * 2, height: heightPx - pad * 2, filter: 'invert(1)' }} />
      ) : null}
      {children}
    </div>
  );
}
