import { useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, Sparkles, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { compareQueue, daysToDeadline, QUEUE_SECTION_LABEL, queueSection, type MesaSource, type QueueSection } from '@/lib/programas/mesa';
import type { PreparationMachine } from '@/lib/programas/preparation';
import { cn } from '@/lib/utils/cn';
import { DesignTile, Dot, FOCUS, PILL_GHOST, PILL_PRIMARY, PILL_SOFT, Panel } from './mesaUi';

export const RECIPE_LABEL: Record<string, string> = { CLASICO: 'Clásico', '3MM': '3 mm', ALIMENTO: 'Alimento' };
const SECTIONS: QueueSection[] = ['urgentes', 'semana', 'despues'];

function dueLabel(s: MesaSource, today: Date): string | null {
  const days = daysToDeadline(s, today);
  if (days === null) return null;
  if (days < 0) return days === -1 ? 'venció ayer' : `venció hace ${-days} días`;
  if (days === 0) return 'vence hoy';
  return days === 1 ? 'vence mañana' : `vence en ${days} días`;
}

/** Miniatura derecha (como se ve el sello), dentro de una caja fija. */
function Thumb({ s, size = 40 }: { s: MesaSource; size?: number }) {
  const long = Math.max(s.widthMm, s.heightMm), short = Math.min(s.widthMm, s.heightMm);
  const k = size / long;
  const portrait = s.heightMm >= s.widthMm;
  return (
    <div className="flex shrink-0 items-center justify-center" style={{ width: size + 4, height: size + 4 }}>
      <DesignTile sourceUrl={s.vectorPreviewUrl} widthPx={(portrait ? short : long) * k} heightPx={(portrait ? long : short) * k} upright />
    </div>
  );
}

export interface Misfit { source: MesaSource; reason: string; machines: { id: PreparationMachine; label: string }[] }

/**
 * Sellos para programar en esta máquina, por urgencia. Se arrastran a la mesa,
 * se suman con +, doble clic o Enter, o se eligen varios (Ctrl/Mayús + clic).
 */
export function MesaQueue({ queue, misfits, today, disabled, fillPreview, onDragStart, onHover, onAdd, onAddMany, onFill, onFillApply, onFillCancel, onGoMachine }: {
  queue: MesaSource[];
  misfits: Misfit[];
  today: Date;
  disabled: boolean;
  /** Vista previa de «Llenar solo» en la mesa. */
  fillPreview: { count: number; urgent: number; left: number } | null;
  /** Empieza a arrastrar (con el puntero) hacia la mesa. */
  onDragStart: (s: MesaSource) => void;
  onHover: (s: MesaSource | null) => void;
  onAdd: (s: MesaSource) => void;
  onAddMany: (s: MesaSource[]) => void;
  onFill: () => void;
  onFillApply: () => void;
  onFillCancel: () => void;
  onGoMachine: (m: PreparationMachine) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ s: MesaSource; top: number; left: number } | null>(null);
  const hoverTimer = useRef<number>();

  const items = useMemo(() => [...queue].sort(compareQueue)
    .filter((s) => !query || s.designName.toLowerCase().includes(query.toLowerCase())), [queue, query]);
  const sections = useMemo(() => SECTIONS.map((id) => ({ id, items: items.filter((s) => queueSection(s, today) === id) })).filter((g) => g.items.length), [items, today]);
  const flat = sections.flatMap((g) => g.items);
  const chosen = queue.filter((s) => picked.has(s.id));
  const selecting = chosen.length > 0;

  const toggle = (s: MesaSource, range: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && anchor) {
        const a = flat.findIndex((x) => x.id === anchor), b = flat.findIndex((x) => x.id === s.id);
        if (a >= 0 && b >= 0) { for (const x of flat.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x.id); return next; }
      }
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
    setAnchor(s.id);
  };
  const showPreview = (s: MesaSource, el: HTMLElement) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setPreview({ s, top: Math.min(window.innerHeight - 230, Math.max(12, r.top + r.height / 2 - 110)), left: r.right + 16 });
    }, 450);
  };
  const hidePreview = () => { window.clearTimeout(hoverTimer.current); setPreview(null); };

  return (
    <Panel label="Sellos para programar" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-medium">Para programar</h2>
        <span className="text-[13px] tabular-nums text-zinc-400">{queue.length}</span>
      </div>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar diseño" aria-label="Buscar diseño"
          className="h-9 w-full rounded-full bg-white/[0.05] pl-9 pr-3 text-[13px] outline-none placeholder:text-zinc-500 focus:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-white/50" />
      </label>

      <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto" aria-label="Cola de sellos" onPointerLeave={() => { onHover(null); hidePreview(); }}>
        {sections.map((g) => (
          <li key={g.id}>
            <p className="sticky top-0 z-10 flex items-center gap-2 bg-[#090909] px-3 pb-1.5 pt-3 text-[12px] font-medium uppercase tracking-wide text-zinc-400">
              {g.id === 'urgentes' ? <Dot tone="error" /> : null}{QUEUE_SECTION_LABEL[g.id]}<span className="tabular-nums text-zinc-500">{g.items.length}</span>
            </p>
            <ul>
              {g.items.map((s) => {
                const due = dueLabel(s, today);
                const recipe = RECIPE_LABEL[s.stampType?.toUpperCase()] ?? s.stampType;
                const on = picked.has(s.id);
                return (
                  <li key={s.id} tabIndex={0} aria-selected={on}
                    onPointerDown={(e) => {
                      if (disabled || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || (e.target as HTMLElement).closest('button')) return;
                      e.preventDefault();
                      hidePreview();
                      onDragStart(s);
                    }}
                    onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) toggle(s, e.shiftKey); }}
                    onDoubleClick={(e) => { if (!disabled && !(e.target as HTMLElement).closest('button')) onAdd(s); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !disabled) { e.preventDefault(); onAdd(s); }
                      else if (e.key === ' ') { e.preventDefault(); toggle(s, e.shiftKey); }
                      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const all = [...(e.currentTarget.closest('[aria-label="Cola de sellos"]')?.querySelectorAll<HTMLElement>('li[tabindex="0"]') ?? [])];
                        all[all.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
                      }
                    }}
                    onPointerEnter={(e) => { onHover(s); showPreview(s, e.currentTarget); }}
                    onFocus={(e) => { onHover(s); showPreview(s, e.currentTarget); }}
                    onBlur={() => { onHover(null); hidePreview(); }}
                    className={cn(FOCUS, 'group flex touch-none select-none items-center gap-2.5 rounded-2xl px-2 py-2',
                      on ? 'bg-white/[0.08]' : !disabled && 'hover:bg-white/[0.04]', !disabled && 'cursor-grab')}
                  >
                    <button type="button" onClick={() => toggle(s, false)} aria-label={on ? `Quitar ${s.designName} de la selección` : `Elegir ${s.designName}`}
                      className={cn(FOCUS, 'flex size-5 shrink-0 items-center justify-center rounded-md border transition',
                        on ? 'border-white bg-white text-zinc-950' : 'border-white/25 text-transparent', !on && !selecting && 'opacity-0 group-hover:opacity-100 group-focus:opacity-100')}>
                      <Check className="size-3.5" />
                    </button>
                    <Thumb s={s} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{s.designName}</p>
                      <p className="flex items-center gap-1.5 truncate text-[12px] text-zinc-400">
                        <span className="rounded-full bg-white/[0.07] px-1.5 text-zinc-300">{recipe}</span>
                        <span className="tabular-nums">{Math.min(s.widthMm, s.heightMm)}×{Math.max(s.widthMm, s.heightMm)}</span>
                      </p>
                      {s.isPriority || due ? (
                        <p className={cn('mt-0.5 truncate text-[12px]', g.id === 'urgentes' ? 'text-red-300' : 'text-zinc-400')}>
                          {s.isPriority ? 'prioritario' : null}{s.isPriority && due ? ' · ' : null}{due}
                        </p>
                      ) : null}
                    </div>
                    <button type="button" disabled={disabled} onClick={() => onAdd(s)} aria-label={`Sumar ${s.designName} a la mesa`} title="Sumar a la mesa (doble clic o Enter)"
                      className={cn(FOCUS, 'flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.1] hover:text-foreground group-hover:text-zinc-200 disabled:opacity-30')}>
                      <Plus className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {!items.length ? <li className="px-3 py-8 text-center text-[13px] text-zinc-400">{queue.length ? 'Nada coincide con la búsqueda.' : 'No hay sellos para programar en esta máquina.'}</li> : null}
      </ul>

      {misfits.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(FOCUS, 'rounded-full px-2 py-1 text-left text-[12px] text-zinc-400 underline-offset-2 hover:text-foreground hover:underline')}>
              {misfits.length} {misfits.length === 1 ? 'sello no entra' : 'sellos no entran'} en esta máquina
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-[340px] rounded-2xl border-white/10 bg-zinc-950 p-3">
            <ul className="space-y-2">
              {misfits.map((m) => (
                <li key={m.source.id} className="flex items-center gap-2.5">
                  <Thumb s={m.source} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">{m.source.designName}</p>
                    <p className="text-[12px] text-zinc-400">{m.reason}</p>
                  </div>
                  {m.machines.map((x) => (
                    <button key={x.id} type="button" className={cn(PILL_SOFT, 'px-2.5 py-1 text-[12px]')} onClick={() => onGoMachine(x.id)}>Ver en {x.label}</button>
                  ))}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}

      {fillPreview ? (
        <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3" role="status">
          <p className="text-[13px]">
            {fillPreview.count
              ? <>Sumaría <b className="font-medium">{fillPreview.count}</b> {fillPreview.count === 1 ? 'sello' : 'sellos'}{fillPreview.urgent ? <> · {fillPreview.urgent} urgentes</> : null}</>
              : 'No entra nada más en las planchuelas disponibles.'}
          </p>
          <p className="text-[12px] text-zinc-400">Primero prioritarios y los que vencen antes. {fillPreview.left ? `${fillPreview.left} quedan en la cola.` : ''}</p>
          <div className="flex gap-1.5">
            <button type="button" className={cn(PILL_PRIMARY, 'flex-1')} disabled={!fillPreview.count} onClick={onFillApply}>Sumar {fillPreview.count || ''}</button>
            <button type="button" className={PILL_GHOST} onClick={onFillCancel}>Cancelar</button>
          </div>
        </div>
      ) : selecting ? (
        <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.06] p-2 pl-3">
          <span className="flex-1 text-[13px]">{chosen.length} {chosen.length === 1 ? 'elegido' : 'elegidos'}</span>
          <button type="button" className={cn(PILL_PRIMARY, 'py-1.5')} disabled={disabled} onClick={() => { onAddMany(chosen); setPicked(new Set()); }}>Sumar a la mesa</button>
          <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={() => setPicked(new Set())} aria-label="Limpiar la selección"><X className="size-4" /></button>
        </div>
      ) : (
        <button type="button" className={cn(PILL_SOFT, 'w-full py-2')} onClick={onFill} disabled={disabled || !queue.length} title="Muestra en la mesa qué sumaría antes de aplicarlo">
          <Sparkles className="size-4" />Llenar solo…
        </button>
      )}

      {preview ? (
        <div className="pointer-events-none fixed z-40 w-[220px] rounded-2xl bg-zinc-950/95 p-3 shadow-2xl ring-1 ring-white/10" style={{ top: preview.top, left: preview.left }}>
          <div className="flex h-[150px] items-center justify-center"><Thumb s={preview.s} size={140} /></div>
          <p className="mt-2 truncate text-[13px] font-medium">{preview.s.designName}</p>
          <p className="text-[12px] text-zinc-400">{RECIPE_LABEL[preview.s.stampType?.toUpperCase()] ?? preview.s.stampType} · {Math.min(preview.s.widthMm, preview.s.heightMm)}×{Math.max(preview.s.widthMm, preview.s.heightMm)} mm</p>
          {preview.s.notes?.trim() ? <p className="mt-1 line-clamp-3 text-[12px] text-sky-300">{preview.s.notes.trim()}</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
