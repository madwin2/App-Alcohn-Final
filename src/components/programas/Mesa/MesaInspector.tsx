import { ArrowDown, ArrowDownToLine, ArrowUp, Minus, Plus, ScanSearch, Trash2, X } from 'lucide-react';
import type { PreparationDocument, Recipe, StampPlacement } from '@/lib/programas/preparation';
import { columnStamps, columnUsage, dueText, type StampInfo } from '@/lib/programas/mesa';
import { PASS_OUTCOME_LABEL, type PassOutcome } from '@/lib/fresa/passes';
import { cn } from '@/lib/utils/cn';
import { describeMecanizado } from '@/lib/pedidos/mecanizadoPersonalizado';
import { DesignTile, Dot, FOCUS, Kbd, Label, PILL_GHOST, PILL_SOFT, Segmented } from './mesaUi';

type FineMode = NonNullable<StampPlacement['fine']>['mode'];
const RECIPE_HINT: Record<Recipe, string> = { CLASICO: '1,7 mm de profundidad', '3MM': '3 mm de profundidad', ALIMENTO: '3 mm y corte de forma con fresa de 6' };

/** El sello elegido: lo vendido, cómo se fabrica y acciones rápidas. */
export function MesaInspector({ doc, stamp, sold, info, today, readOnly, grow, shrink, onRecipe, onResize, onFine, onColumn, onEnd, onShift, onRemove, onFresa, onClose }: {
  doc: PreparationDocument;
  stamp: StampPlacement;
  sold: { shortMm: number; longMm: number };
  info?: StampInfo;
  today: Date;
  readOnly: boolean;
  /** Paso de ± y si entra (motivo si no). */
  grow: { stepMm: number; reason: string | null };
  shrink: { stepMm: number; reason: string | null };
  onRecipe: (r: Recipe) => void;
  onResize: (heightMm: number) => void;
  onFine: (mode: FineMode) => void;
  onColumn: (columnId: string) => void;
  onEnd: () => void;
  onShift: (direction: -1 | 1) => void;
  onRemove: () => void;
  onFresa: () => void;
  onClose: () => void;
}) {
  const changed = Math.abs(stamp.heightMm - sold.longMm) > 0.05;
  const outcome = stamp.fine?.analysisVersion ? stamp.fine.outcome : null;
  const k = Math.min(150 / stamp.heightMm, 150 / stamp.widthMm);
  const fineTone = !outcome ? 'pending' : outcome === 'sin_repaso' || outcome === 'repaso_sugerido' ? 'ok' : 'warning';
  const row = columnStamps(doc, stamp.columnId);
  const index = row.findIndex((s) => s.instanceId === stamp.instanceId);
  const col = doc.columns.find((c) => c.id === stamp.columnId);
  const usage = columnUsage(doc).find((u) => u.columnId === stamp.columnId);
  const below = row.length - index - 1;

  return (
    <section className="space-y-5" aria-label={`Sello ${stamp.name}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-medium">{stamp.name}</h3>
          <p className="text-[13px] text-zinc-400">
            vendido {sold.shortMm}×{sold.longMm} mm
            {changed ? <span className="text-sky-300"> · se fabrica {stamp.widthMm}×{stamp.heightMm}</span> : null}
          </p>
          {(() => { const due = info ? dueText(info, today) : null; return due ? <p className={cn('text-[13px]', due.urgent ? 'text-red-300' : 'text-zinc-400')}>{due.text}</p> : null; })()}
        </div>
        <button type="button" className={cn(PILL_GHOST, 'px-2')} onClick={onClose} aria-label="Cerrar el detalle (Esc)" title="Cerrar (Esc)"><X className="size-4" /></button>
      </div>

      {info?.notes?.trim() ? (
        <p className="whitespace-pre-wrap break-words rounded-2xl bg-sky-400/10 px-3 py-2 text-[13px] text-sky-200" title="Nota del pedido">
          <span className="mr-1 font-medium text-sky-300">Nota:</span>{info.notes.trim()}
        </p>
      ) : null}

      <div className="relative flex h-44 w-full items-center justify-center rounded-2xl bg-black/40">
        <DesignTile sourceUrl={stamp.sourceUrl} inline={stamp.vectorSvg} widthPx={stamp.widthMm * k} heightPx={stamp.heightMm * k} upright />
        <button type="button" onClick={onFresa} className={cn(PILL_SOFT, 'absolute bottom-2 right-2 bg-zinc-900/90 py-1 text-[12px]')}>
          <ScanSearch className="size-3.5" />Ver fresa
        </button>
        <p className="absolute bottom-2.5 left-3 flex items-center gap-1.5 text-[12px] text-zinc-300">
          <Dot tone={fineTone} />{outcome ? PASS_OUTCOME_LABEL[outcome as PassOutcome] ?? outcome : 'fresa sin chequear'}
        </p>
      </div>

      {info?.mecanizado ? (
        <div className="rounded-2xl bg-amber-400/10 px-3 py-2 text-[13px] text-amber-100" title="Configuración pedida en Pedidos">
          <p className="font-medium text-amber-200">Mecanizado personalizado</p>
          <p>{describeMecanizado(info.mecanizado)}</p>
          <p className="mt-1 text-[12px] text-amber-200/70">El gadget todavía no lo aplica solo: ajustá esas trayectorias en Aspire.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>mecanizado</Label>
        <Segmented className="w-full" value={stamp.recipe} onChange={onRecipe} disabled={readOnly}
          options={[{ id: 'CLASICO', label: 'Clásico' }, { id: '3MM', label: '3 mm' }, { id: 'ALIMENTO', label: 'Alimento' }]} />
        <p className="text-[12px] text-zinc-400">{RECIPE_HINT[stamp.recipe]}</p>
      </div>

      <div className="space-y-2">
        <Label>largo de fabricación</Label>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full bg-white/[0.05] p-0.5">
            <button type="button" disabled={readOnly || !!shrink.reason} onClick={() => onResize(stamp.heightMm - shrink.stepMm)} aria-label={`Achicar ${shrink.stepMm} mm`}
              title={shrink.reason ?? `Achicar ${shrink.stepMm} mm`} className={cn(FOCUS, 'flex size-8 items-center justify-center rounded-full text-zinc-300 hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30')}><Minus className="size-4" /></button>
            <input type="number" step={grow.stepMm} value={stamp.heightMm} disabled={readOnly} aria-label="Largo en mm"
              onChange={(e) => { const n = Number(e.target.value); if (n > 0) onResize(n); }}
              className="w-14 bg-transparent text-center text-[15px] font-medium tabular-nums outline-none [appearance:textfield] focus-visible:ring-2 focus-visible:ring-white/50 [&::-webkit-inner-spin-button]:appearance-none" />
            <button type="button" disabled={readOnly || !!grow.reason} onClick={() => onResize(stamp.heightMm + grow.stepMm)} aria-label={`Agrandar ${grow.stepMm} mm`}
              title={grow.reason ?? `Agrandar ${grow.stepMm} mm`} className={cn(FOCUS, 'flex size-8 items-center justify-center rounded-full text-zinc-300 hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30')}><Plus className="size-4" /></button>
          </div>
          <span className="text-[13px] text-zinc-400">mm</span>
          {changed ? <button type="button" disabled={readOnly} onClick={() => onResize(sold.longMm)} className={cn(FOCUS, 'ml-auto rounded-full px-2 text-[12px] text-zinc-300 hover:text-foreground')}>como vendido</button> : null}
        </div>
        <p className="text-[12px] text-zinc-400">
          {grow.reason ? <span className="text-amber-200/90">No se puede agrandar: {grow.reason.replace(/\.$/, '')}. </span> : null}
          {below ? `${below === 1 ? 'El de abajo se acomoda' : `Los ${below} de abajo se acomodan`} solo, a 8 mm.` : 'Es el último de su planchuela.'}
          {usage ? ` Quedan ${Math.round(usage.freeMm)} mm libres.` : ''}
        </p>
      </div>

      <div className="space-y-2">
        <Label>planchuela</Label>
        <Segmented className="w-full" value={stamp.columnId} onChange={onColumn} disabled={readOnly}
          options={doc.columns.map((c) => {
            const why = stamp.widthMm > c.usableMm ? 'no entra' : !c.available ? 'sin material' : null;
            return { id: c.id, disabled: !!why, title: why ? `${c.nominalMm} mm: ${why}` : `Llevar a la planchuela de ${c.nominalMm}`,
              label: <span className="flex flex-col items-center leading-tight">{c.nominalMm}{why ? <span className="text-[10px] font-normal">{why}</span> : null}</span> };
          })} />
        <p className="flex items-center gap-1.5 text-[12px] text-zinc-400"><Kbd>←</Kbd><Kbd>→</Kbd> cambia de planchuela</p>
      </div>

      <div className="space-y-2">
        <Label>repaso fino 0,2</Label>
        <Segmented className="w-full" value={(stamp.fine?.mode === 'aspire' ? 'auto' : stamp.fine?.mode) ?? 'auto'} onChange={onFine} disabled={readOnly}
          options={[{ id: 'auto', label: 'Automático' }, { id: 'whole', label: 'Completo' }, { id: 'none', label: 'Sin repaso' }]} />
        {stamp.fine?.mode === 'aspire' ? <p className="text-[12px] text-zinc-400">Selección hecha en Aspire.</p>
          : (stamp.fine?.mode ?? 'auto') === 'auto' && stamp.fine?.analysisVersion
            ? <p className="text-[12px] text-zinc-400">{stamp.fine.pieces?.length ? `La 0,2 pasa solo por ${stamp.fine.pieces.length} ${stamp.fine.pieces.length === 1 ? 'pieza' : 'piezas'}, donde la 0,6 no llega.` : stamp.fine.needsFine ? 'La 0,2 pasa por todo el sello.' : 'La 0,6 alcanza: sin repaso.'}</p>
            : null}
      </div>

      <div className="space-y-2">
        <Label>orden en la planchuela {col?.nominalMm} · {index + 1} de {row.length}</Label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={PILL_SOFT} disabled={readOnly || index <= 0} onClick={() => onShift(-1)} title="Subir (↑)"><ArrowUp className="size-4" />Subir</button>
          <button type="button" className={PILL_SOFT} disabled={readOnly || index === row.length - 1} onClick={() => onShift(1)} title="Bajar (↓)"><ArrowDown className="size-4" />Bajar</button>
          <button type="button" className={PILL_SOFT} disabled={readOnly || index === row.length - 1} onClick={onEnd} title="Colocar debajo del último sello"><ArrowDownToLine className="size-4" />Al final</button>
        </div>
      </div>

      <button type="button" className={cn(PILL_SOFT, 'text-red-300 hover:text-red-200')} disabled={readOnly} onClick={onRemove} title="Quitar del programa (Supr)">
        <Trash2 className="size-4" />Quitar del programa
      </button>
    </section>
  );
}
