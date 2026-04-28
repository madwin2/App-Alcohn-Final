import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LucideProps } from 'lucide-react';
import {
  Boxes,
  Check,
  ChevronRight,
  Clock,
  Eye,
  Hammer,
  Loader2,
  Package,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import type { DashboardTask } from '@/lib/supabase/services/dashboard-tasks.service';
import {
  applyStockInboundFromReplenishTask,
  type StockItemKey,
  type StockReplenishPayload,
} from '@/lib/supabase/services/stock.service';
import { useToast } from '@/components/ui/use-toast';

interface StockReplenishSectionProps {
  entries: { task: DashboardTask; payload: StockReplenishPayload }[];
  onSkip: (taskId: string) => void;
  onCompleted: () => void | Promise<void>;
  /** Momento del último fetch de tareas (para etiqueta «Actualizado…»). */
  lastSyncedAt: Date | null;
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
    case 'TUBO_80MM':
    case 'TUBO_125MM':
      return Package;
    default:
      return Package;
  }
}

function formatSyncedLabel(at: Date | null): string {
  if (!at) return '—';
  return `Actualizado · ${format(at, 'd MMM yyyy, HH:mm', { locale: es })}`;
}

export function StockReplenishSection({
  entries,
  onSkip,
  onCompleted,
  lastSyncedAt,
}: StockReplenishSectionProps) {
  const totals = useMemo(() => {
    let needed = 0;
    let stock = 0;
    let shortage = 0;
    for (const { payload } of entries) {
      needed += payload.needed;
      stock += payload.stockAlMomento;
      shortage += payload.shortage;
    }
    return { needed, stock, shortage };
  }, [entries]);

  if (!entries.length) return null;

  return (
    <section aria-label="Stock pendiente de reponer" className="w-full">
      <div
        className={cn(
          'rounded-[20px] border border-white/10',
          'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
          'shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-sm',
          'overflow-hidden',
        )}
      >
        {/* Cabecera */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-inner"
              aria-hidden
            >
              <Package className="h-6 w-6 text-white/90" strokeWidth={1.5} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-base font-semibold tracking-tight text-white">Stock pendiente</h3>
                <Link
                  to="/stock"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver detalles
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Unidades estimadas necesarias en depósito para mantener tu stock al día frente a envíos pendientes y
                alertas.
              </p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-white/[0.06]">
          <SummaryCell
            dotClass="bg-amber-400/90"
            label="Unidades necesarias"
            value={totals.needed}
            tone="default"
          />
          <SummaryCell
            dotClass="bg-white/35"
            label="En depósito"
            value={totals.stock}
            tone="default"
          />
          <SummaryCell
            dotClass="bg-red-500/90"
            label="Faltan"
            value={totals.shortage}
            tone="accent"
            sub="unidades entre ítems pendientes"
          />
        </div>

        {/* Lista de tareas */}
        <div className="px-5 pt-4 pb-3 space-y-2">
          <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
            <span>Tareas pendientes</span>
            <span className="flex items-center gap-1.5 tabular-nums font-normal normal-case text-muted-foreground">
              <Clock className="h-3 w-3 opacity-70" />
              {formatSyncedLabel(lastSyncedAt)}
            </span>
          </div>

          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-black/25">
            {entries.map(({ task, payload }) => (
              <ReplenishTaskRow
                key={task.id}
                task={task}
                payload={payload}
                onSkip={() => onSkip(task.id)}
                onCompleted={onCompleted}
              />
            ))}
          </div>
        </div>

        {/* Pie */}
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between border-t border-white/[0.06] bg-black/20">
          <p className="flex gap-2 text-[11px] leading-snug text-muted-foreground">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-200/70" aria-hidden />
            <span>Mantené tu stock actualizado para evitar demoras cuando se envía un pedido.</span>
          </p>
          <Button
            asChild
            size="sm"
            className="w-full shrink-0 rounded-xl sm:w-auto font-medium bg-white text-black hover:bg-white/90"
          >
            <Link to="/stock">
              Gestionar stock
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function SummaryCell(props: {
  dotClass: string;
  label: string;
  value: number;
  tone?: 'default' | 'accent';
  sub?: string;
}) {
  const { dotClass, label, value, tone = 'default', sub } = props;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/90">
        <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', dotClass)} />
        <span className="truncate leading-tight">{label}</span>
      </div>
      <div
        className={cn(
          'mt-1.5 text-2xl font-semibold tabular-nums tracking-tight truncate',
          tone === 'accent' ? 'text-red-500' : 'text-white',
        )}
      >
        {value.toLocaleString('es-AR')}
      </div>
      {sub ? <p className="mt-1 text-[10px] text-muted-foreground leading-tight">{sub}</p> : null}
    </div>
  );
}

function ReplenishTaskRow({
  task,
  payload,
  onSkip,
  onCompleted,
}: {
  task: DashboardTask;
  payload: StockReplenishPayload;
  onSkip: () => void;
  onCompleted: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);
  const Icon = iconForItemKey(payload.itemKey);

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
      await applyStockInboundFromReplenishTask({
        taskId: task.id,
        itemKey: payload.itemKey,
        quantity: n,
      });
      await onCompleted();
      toast({
        title: 'Stock actualizado',
        description: `Se sumaron ${n} unidades de ${payload.itemName}.`,
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
    <div className="flex flex-col gap-3 p-3.5 text-left sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px] text-white/85" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-sm font-semibold text-white">Stockear {payload.itemName}</p>
            {payload.orderId ? (
              <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                Envío
              </span>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
            Se necesitan al menos{' '}
            <span className="text-foreground/90 tabular-nums">{payload.needed.toLocaleString('es-AR')}</span>; en depósito
            hay{' '}
            <span className="text-foreground/90 tabular-nums">{payload.stockAlMomento.toLocaleString('es-AR')}</span>.
            {payload.pedidoEtiqueta && payload.orderId ? (
              <span className="block mt-1 text-muted-foreground/95">
                Pedido:{' '}
                <span className="font-mono text-foreground/80">{payload.pedidoEtiqueta}</span>
              </span>
            ) : null}
          </p>
          <button
            type="button"
            className="mt-2 text-[10px] text-muted-foreground underline-offset-4 hover:text-white hover:underline"
            disabled={busy}
            onClick={onSkip}
          >
            Omitir por ahora
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap shrink-0">
        <div className="flex flex-col items-end gap-0.5 mr-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Faltan</span>
          <span className="text-lg font-semibold tabular-nums leading-none text-red-500">{payload.shortage}</span>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Cant."
            className={cn(
              'h-9 w-[5.75rem] rounded-xl border-white/15 bg-black/50 text-center tabular-nums text-sm px-2',
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
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all',
              'border border-white/15 bg-white text-black hover:bg-white/90 hover:scale-[1.02]',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
            disabled={busy}
            onClick={handleSubmit}
            aria-busy={busy}
          >
            {busy ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
            ) : (
              <Check className="h-[18px] w-[18px]" strokeWidth={3} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
