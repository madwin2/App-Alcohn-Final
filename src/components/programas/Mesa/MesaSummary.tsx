import { Keyboard } from 'lucide-react';
import type { PreparationDocument, Recipe } from '@/lib/programas/preparation';
import { columnStamps, columnUsage } from '@/lib/programas/mesa';
import { cn } from '@/lib/utils/cn';
import { Dot, FOCUS, Label, PILL_GHOST } from './mesaUi';

const RECIPES: { id: Recipe; label: string }[] = [{ id: 'CLASICO', label: 'Clásico' }, { id: '3MM', label: '3 mm' }, { id: 'ALIMENTO', label: 'Alimento' }];

/**
 * Sin sello elegido, la columna derecha resume el programa: qué lleva, cuánto
 * queda en cada planchuela (y si hay material) y la lista de sellos para ir a uno.
 */
export function MesaSummary({ doc, readOnly, warnings, onPick, onToggleMaterial, onShortcuts }: {
  doc: PreparationDocument;
  readOnly: boolean;
  warnings: Set<string>;
  onPick: (instanceId: string) => void;
  onToggleMaterial: (columnId: string) => void;
  onShortcuts: () => void;
}) {
  const stamps = doc.stamps.filter((s) => !s.excluded);
  const usage = new Map(columnUsage(doc).map((u) => [u.columnId, u]));
  const cols = [...doc.columns].sort((a, b) => a.centerX - b.centerX);

  return (
    <section className="space-y-6" aria-label="Resumen del programa">
      <div className="space-y-2">
        <Label>en este programa</Label>
        <p className="text-[28px] font-medium leading-none tabular-nums">{stamps.length}<span className="ml-1.5 text-[15px] font-normal text-zinc-400">{stamps.length === 1 ? 'sello' : 'sellos'}</span></p>
        <div className="flex flex-wrap gap-1.5">
          {RECIPES.map((r) => {
            const n = stamps.filter((s) => s.recipe === r.id).length;
            return n ? <span key={r.id} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-zinc-300">{r.label} <b className="font-medium text-foreground">{n}</b></span> : null;
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>planchuelas</Label>
        <ul className="space-y-2.5">
          {cols.map((c) => {
            const u = usage.get(c.id);
            const pct = u && u.totalMm ? Math.min(100, (u.totalMm - u.freeMm) / u.totalMm * 100) : 0;
            return (
              <li key={c.id} className="space-y-1">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="w-9 font-medium tabular-nums">{c.nominalMm}</span>
                  <span className="flex-1 text-zinc-400">{c.available ? `${u?.count ?? 0} ${u?.count === 1 ? 'sello' : 'sellos'} · ${Math.round(u?.freeMm ?? 0)} mm libres` : 'sin material en esta corrida'}</span>
                  <button type="button" role="switch" aria-checked={c.available} disabled={readOnly} onClick={() => onToggleMaterial(c.id)}
                    aria-label={`Hay material en la planchuela de ${c.nominalMm}`} title={c.available ? 'Marcar sin material' : 'Marcar que hay material'}
                    className={cn(FOCUS, 'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40', c.available ? 'bg-white/70' : 'bg-white/[0.12]')}>
                    <span className={cn('absolute top-0.5 size-4 rounded-full bg-zinc-950 transition-[left]', c.available ? 'left-[18px]' : 'left-0.5')} />
                  </button>
                </div>
                <div className="ml-11 h-1 rounded-full bg-white/[0.07]">
                  <div className={cn('h-full rounded-full transition-[width] duration-500', c.available ? 'bg-white/60' : 'bg-transparent')} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {stamps.length ? (
        <div className="space-y-2">
          <Label>sellos</Label>
          <ul className="space-y-0.5">
            {cols.flatMap((c) => columnStamps(doc, c.id).map((s, i) => (
              <li key={s.instanceId}>
                <button type="button" onClick={() => onPick(s.instanceId)}
                  className={cn(FOCUS, 'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.05]')}>
                  <span className="w-12 shrink-0 text-[12px] tabular-nums text-zinc-500">{c.nominalMm} · {i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {warnings.has(s.instanceId) ? <Dot tone="warning" /> : null}
                  <span className="text-[12px] tabular-nums text-zinc-500">{s.widthMm}×{s.heightMm}</span>
                </button>
              </li>
            )))}
          </ul>
        </div>
      ) : (
        <p className="rounded-2xl bg-black/30 px-4 py-6 text-center text-[13px] text-zinc-400">Arrastrá sellos de la cola a una planchuela, o elegí varios y sumalos juntos.</p>
      )}

      <button type="button" className={cn(PILL_GHOST, '-ml-2')} onClick={onShortcuts}><Keyboard className="size-4" />Atajos de teclado <span className="text-zinc-500">?</span></button>
    </section>
  );
}
