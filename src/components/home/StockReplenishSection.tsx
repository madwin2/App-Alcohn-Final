import { type ComponentType, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LucideProps } from 'lucide-react';
import {
  Boxes,
  Check,
  ChevronDown,
  Eye,
  Hammer,
  Loader2,
  Package,
  Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { DashboardTask } from '@/lib/supabase/services/dashboard-tasks.service';
import {
  applyStockInboundFromReplenishTask,
  type StockItemKey,
  type StockReplenishPayload,
} from '@/lib/supabase/services/stock.service';
import { useToast } from '@/components/ui/use-toast';

gsap.registerPlugin(useGSAP, Flip);

const CARD_SHELL = cn(
  'relative rounded-[22px] border border-white/10',
  'bg-gradient-to-br from-zinc-900/95 via-black/75 to-black/95',
  'shadow-[0_20px_50px_-18px_rgba(0,0,0,0.85)]',
);

interface StockReplenishSectionProps {
  entries: { task: DashboardTask; payload: StockReplenishPayload }[];
  onCompleted: () => void | Promise<void>;
  lastSyncedAt: Date | null;
  preview?: boolean;
}

type GroupedEntry = { task: DashboardTask; payload: StockReplenishPayload };

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function iconForItemKey(itemKey: StockItemKey): ComponentType<LucideProps> {
  switch (itemKey) {
    case 'CAJA_ABECEDARIO':
    case 'SOPORTE_ABECEDARIO':
      return Boxes;
    case 'MANGO_GOLPE':
      return Hammer;
    case 'SOLDADOR_100W':
    case 'SOLDADOR_200W':
    case 'SOLDADOR_ADAPTADO_100W':
    case 'SOLDADOR_ADAPTADO_200W':
      return Zap;
    default:
      return Package;
  }
}

function formatSyncedLabel(at: Date | null): string {
  if (!at) return '—';
  return `Actualizado · ${format(at, 'd MMM yyyy, HH:mm', { locale: es })}`;
}

function groupEntriesByItem(entries: GroupedEntry[]): GroupedEntry[] {
  const byKey = new Map<StockItemKey, GroupedEntry>();
  for (const entry of entries) {
    const prev = byKey.get(entry.payload.itemKey);
    if (!prev) {
      byKey.set(entry.payload.itemKey, entry);
      continue;
    }
    const preferIncoming =
      (!entry.payload.orderId && prev.payload.orderId) ||
      (Boolean(entry.payload.orderId) === Boolean(prev.payload.orderId) &&
        entry.payload.shortage > prev.payload.shortage);
    if (preferIncoming) byKey.set(entry.payload.itemKey, entry);
  }
  return [...byKey.values()].sort((a, b) =>
    a.payload.itemName.localeCompare(b.payload.itemName, 'es'),
  );
}

export function StockReplenishSection({
  entries,
  onCompleted,
  lastSyncedAt,
  preview = false,
}: StockReplenishSectionProps) {
  const grouped = useMemo(() => groupEntriesByItem(entries), [entries]);
  const totals = useMemo(() => {
    let needed = 0;
    let stock = 0;
    let shortage = 0;
    for (const { payload } of grouped) {
      needed += payload.needed;
      stock += payload.stockAlMomento;
      shortage += payload.shortage;
    }
    return { needed, stock, shortage };
  }, [grouped]);

  const rootRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const heightFromRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { contextSafe } = useGSAP({ scope: rootRef });

  const snapChipsToLayout = (root: ParentNode | null) => {
    if (!root) return;
    const chips = root.querySelectorAll('[data-stock-chip]');
    Flip.killFlipsOf(chips);
    gsap.killTweensOf(chips);
    gsap.set(chips, { clearProps: 'transform,x,y,top,left,width,height,position,margin,opacity,visibility' });
  };

  useLayoutEffect(() => {
    const card = cardRef.current;
    const state = flipStateRef.current;
    const startHeight = heightFromRef.current;
    const reduce = prefersReducedMotion();
    const duration = reduce ? 0 : 0.45;
    const collapsing = !expanded && startHeight != null;
    const hangingChips = compactRef.current?.querySelectorAll('[data-stock-chip]');

    if (expanded && state) {
      flipStateRef.current = null;
      Flip.from(state, {
        duration,
        ease: 'power2.inOut',
        absolute: true,
        scale: false,
        fade: true,
        nested: true,
        stagger: 0.03,
        onComplete: () => snapChipsToLayout(card),
      });
    } else {
      flipStateRef.current = null;
    }

    if (collapsing && hangingChips?.length) {
      gsap.set(hangingChips, { autoAlpha: 0 });
    }

    if (card && startHeight != null) {
      heightFromRef.current = null;
      const endHeight = card.offsetHeight;
      gsap.set(card, { overflow: collapsing ? 'hidden' : 'visible' });
      gsap.fromTo(
        card,
        { height: startHeight },
        {
          height: endHeight,
          duration,
          ease: 'power2.inOut',
          overwrite: 'auto',
          onComplete: () => {
            gsap.set(card, {
              height: 'auto',
              overflow: expanded ? 'hidden' : 'visible',
            });
            if (collapsing && hangingChips?.length) {
              gsap.fromTo(
                hangingChips,
                { autoAlpha: 0 },
                {
                  autoAlpha: 1,
                  duration: reduce ? 0 : 0.42,
                  stagger: reduce ? 0 : 0.05,
                  ease: 'power2.out',
                },
              );
            }
          },
        },
      );
    }
  }, [expanded]);

  const toggle = contextSafe(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    const next = !expanded;
    if (root) {
      snapChipsToLayout(root);
      flipStateRef.current = next
        ? Flip.getState(root.querySelectorAll('[data-stock-chip], [data-stock-row-body]'))
        : null;
    }
    if (card) heightFromRef.current = card.offsetHeight;
    setExpanded(next);
    gsap.to(chevronRef.current, {
      rotation: next ? 180 : 0,
      duration: prefersReducedMotion() ? 0 : 0.28,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  });

  if (!entries.length) return null;

  return (
    <section
      ref={rootRef}
      aria-label="Stock pendiente de reponer"
      className={cn('w-full', !expanded && 'pb-7')}
    >
      <div
        ref={cardRef}
        className={cn(CARD_SHELL, expanded ? 'overflow-hidden' : 'overflow-visible')}
      >
        <div ref={compactRef} className="relative">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className="relative w-full px-4 pt-3.5 pb-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20"
          >
            <span
              ref={chevronRef}
              className="absolute right-3.5 top-3.5 text-white/35"
              aria-hidden
            >
              <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="flex items-center gap-2.5 pr-7">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
                aria-hidden
              >
                <Package className="h-4 w-4 text-white/90" strokeWidth={1.5} />
              </div>
              <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-white">
                Stock pendiente
              </h3>
            </div>
          </button>

          <div className={cn('grid grid-cols-3 gap-2 px-4', expanded ? 'pb-3' : 'pb-7')}>
            <SummaryCell
              dotClass="bg-amber-400/90"
              label="Unidades necesarias"
              value={totals.needed}
            />
            <SummaryCell dotClass="bg-white/35" label="En depósito" value={totals.stock} />
            <SummaryCell
              dotClass="bg-red-500/90"
              label="Faltan"
              value={totals.shortage}
              tone="accent"
            />
          </div>

          {!expanded ? (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ top: '100%', marginTop: '-20px' }}
            >
              <div className="pointer-events-auto flex w-full items-center justify-evenly px-4">
                {grouped.map((entry) => (
                  <div key={entry.payload.itemKey} className="relative shrink-0">
                    <ItemChip payload={entry.payload} onActivate={toggle} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {expanded ? (
          <div className="flex flex-col border-t border-white/[0.08] px-3">
            <div className="divide-y divide-white/[0.08]">
              {grouped.map((entry) => (
                <div
                  key={entry.payload.itemKey}
                  className="flex items-center gap-2.5 py-2"
                >
                  <ItemChip payload={entry.payload} />
                  <RowBody
                    task={entry.task}
                    payload={entry.payload}
                    onCompleted={onCompleted}
                    preview={preview}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] py-2">
              <p className="truncate text-[10px] text-muted-foreground/80">
                {formatSyncedLabel(lastSyncedAt)}
              </p>
              <Link
                to="/stock"
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-white"
              >
                <Eye className="h-3.5 w-3.5" />
                Gestionar stock
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Misma cáscara y altura que la tarjeta contraída, cuando no hay reposición. */
export function StockAlDiaCard() {
  return (
    <section aria-label="El stock está al día" className="w-full">
      <div className={cn(CARD_SHELL, 'overflow-hidden')}>
        <div className="relative w-full px-4 pt-3.5 pb-1">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
              aria-hidden
            >
              <Package className="h-4 w-4 text-emerald-300/90" strokeWidth={1.5} />
            </div>
            <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-white">
              El stock está al día
            </h3>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-7">
          <SummaryCell dotClass="bg-amber-400/90" label="Unidades necesarias" value={0} />
          <SummaryCell dotClass="bg-white/35" label="En depósito" value={0} />
          <SummaryCell dotClass="bg-emerald-400/90" label="Faltan" value={0} />
        </div>
      </div>
    </section>
  );
}

function ItemChip({
  payload,
  onActivate,
}: {
  payload: StockReplenishPayload;
  onActivate?: () => void;
}) {
  const Icon = iconForItemKey(payload.itemKey);
  const badge = payload.shortage > 99 ? '99+' : String(payload.shortage);

  return (
    <button
      type="button"
      data-stock-chip
      data-flip-id={payload.itemKey}
      title={`${payload.itemName}: faltan ${payload.shortage}`}
      aria-label={`${payload.itemName}, faltan ${payload.shortage}`}
      onClick={onActivate}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'border-2 border-zinc-950 bg-zinc-800 text-white/90 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.9)]',
        onActivate && 'transition-transform duration-200 hover:-translate-y-0.5',
        onActivate ? 'cursor-pointer' : 'cursor-default',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold tabular-nums leading-none text-white ring-2 ring-zinc-950">
        {badge}
      </span>
    </button>
  );
}

function SummaryCell(props: {
  dotClass: string;
  label: string;
  value: number;
  tone?: 'default' | 'accent';
}) {
  const { dotClass, label, value, tone = 'default' } = props;
  return (
    <div className="min-w-0 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/90">
        <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />
        <span className="truncate leading-tight">{label}</span>
      </div>
      <div
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'accent' ? 'text-red-500' : 'text-white',
        )}
      >
        {value.toLocaleString('es-AR')}
      </div>
    </div>
  );
}

function RowBody({
  task,
  payload,
  onCompleted,
  preview,
}: {
  task: DashboardTask;
  payload: StockReplenishPayload;
  onCompleted: () => void | Promise<void>;
  preview: boolean;
}) {
  const { toast } = useToast();
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnits(payload.shortage > 0 ? String(payload.shortage) : '');
  }, [task.id, payload.shortage, payload.itemKey]);

  const handleSubmit = async () => {
    const n = Number(units.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      toast({
        title: 'Cantidad inválida',
        description: 'Ingresá cuántas unidades ingresan al depósito.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      if (!preview) {
        await applyStockInboundFromReplenishTask({
          taskId: task.id,
          itemKey: payload.itemKey,
          quantity: n,
        });
      }
      await onCompleted();
      toast({
        title: preview ? 'Vista previa' : 'Stock actualizado',
        description: preview
          ? `No se guardó. Se simularon ${n} unidades de ${payload.itemName}.`
          : `Se sumaron ${n} unidades de ${payload.itemName}.`,
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Probá de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-stock-row-body className="flex min-w-0 flex-1 items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-white">{payload.itemName}</p>
          {payload.orderId ? (
            <span className="shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
              Envío
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] tabular-nums text-muted-foreground">
          {payload.needed} nec. · {payload.stockAlMomento} dep. ·{' '}
          <span className="text-red-400">faltan {payload.shortage}</span>
        </p>
      </div>
      <Input
        type="number"
        min={1}
        inputMode="numeric"
        placeholder="Cant."
        className={cn(
          'h-7 w-[3.75rem] rounded-md border-white/15 bg-black/50 px-1.5 text-center text-xs tabular-nums',
          'focus-visible:ring-offset-0 focus-visible:ring-white/25',
        )}
        value={units}
        aria-label={`Unidades a ingresar para ${payload.itemName}`}
        onChange={(e) => setUnits(e.target.value)}
      />
      <button
        type="button"
        title="Registrar ingreso y marcar lista"
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
          'border border-white/15 bg-white text-black hover:bg-white/90',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
        disabled={busy}
        onClick={handleSubmit}
        aria-busy={busy}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        )}
      </button>
    </div>
  );
}
