import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ProgramLengthByPlanchuela,
  ProgramMachineType,
  ProgramStamp,
  StampType,
} from '@/lib/types/index';
import { StampThumb } from '@/components/programas/StampThumb';
import { getEligibleStamps } from '@/lib/supabase/services/programs.service';
import { suggestStampSelection } from '@/components/programas/StampsSelection/StampsSelectionDialog';
import {
  resolvePlanchuelaRef,
  stampLengthAlongMm,
} from '@/lib/programas/material';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';

const FILTERS: Array<StampType | 'ALL'> = [
  'ALL',
  'CLASICO',
  '3MM',
  'ALIMENTO',
  'ABC',
  'LACRE',
];

function stampPlanchuelaLabel(stamp: ProgramStamp): string | null {
  const ref = resolvePlanchuelaRef(stamp);
  const mm = stampLengthAlongMm(stamp);
  if (!ref || mm <= 0) return null;
  return `P${ref} · +${Math.round(mm)} mm`;
}

function stampOrderDateLabel(stamp: ProgramStamp): string | null {
  const raw = stamp.orderDate || stamp.createdAt;
  if (!raw) return null;
  try {
    const d = raw.length <= 10 ? parseISO(raw.slice(0, 10)) : new Date(raw);
    if (!isValid(d)) return null;
    return format(d, 'dd/MM/yy');
  } catch {
    return null;
  }
}

function compareEligibleStamps(a: ProgramStamp, b: ProgramStamp): number {
  if (Boolean(a.isPriority) !== Boolean(b.isPriority)) return a.isPriority ? -1 : 1;
  const oa = a.orderDate ? new Date(a.orderDate).getTime() : Number.POSITIVE_INFINITY;
  const ob = b.orderDate ? new Date(b.orderDate).getTime() : Number.POSITIVE_INFINITY;
  if (oa !== ob) return oa - ob;
  const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return ca - cb;
}

type HojaInlineStampPickerProps = {
  machine: ProgramMachineType;
  excludeStampIds: string[];
  initialLengthByPlanchuela?: ProgramLengthByPlanchuela;
  busy?: boolean;
  onConfirm: (stamps: ProgramStamp[]) => void;
  onCancel: () => void;
  onSelectionChange?: (stamps: ProgramStamp[]) => void;
};

export function HojaInlineStampPicker({
  machine,
  excludeStampIds,
  initialLengthByPlanchuela = {},
  busy = false,
  onConfirm,
  onCancel,
  onSelectionChange,
}: HojaInlineStampPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<StampType | 'ALL'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [available, setAvailable] = useState<ProgramStamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [suggestHint, setSuggestHint] = useState<string | null>(null);

  const excludeKey = excludeStampIds.join(',');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setSuggestHint(null);
      try {
        const stamps = await getEligibleStamps({ machine, excludeStampIds });
        if (!cancelled) setAvailable(stamps);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : 'No se pudieron cargar los sellos',
          );
          setAvailable([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // excludeStampIds via excludeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, excludeKey]);

  useEffect(() => {
    onSelectionChange?.([]);
    return () => onSelectionChange?.([]);
    // solo al montar/desmontar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitSelection = (ids: string[], pool: ProgramStamp[] = available) => {
    onSelectionChange?.(pool.filter((s) => ids.includes(s.id)));
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return available
      .filter((stamp) => {
        const matchesSearch =
          !q ||
          stamp.designName.toLowerCase().includes(q) ||
          (stamp.notes || '').toLowerCase().includes(q);
        const matchesType = filterType === 'ALL' || stamp.stampType === filterType;
        return matchesSearch && matchesType;
      })
      .sort(compareEligibleStamps);
  }, [available, searchQuery, filterType]);

  const toggle = (id: string) => {
    setSuggestHint(null);
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      emitSelection(next);
      return next;
    });
  };

  const handleSuggest = () => {
    const ids = suggestStampSelection(
      available,
      machine,
      initialLengthByPlanchuela,
    );
    if (ids.length === 0) {
      toast({
        title: 'Sin espacio',
        description:
          'No hay más sellos que entren en el largo disponible para esta máquina.',
      });
      return;
    }
    setSelectedIds(ids);
    emitSelection(ids);
    setSuggestHint(
      `Preseleccionados ${ids.length} según prioridad y largo. Revisá y confirmá.`,
    );
  };

  const handleConfirm = () => {
    const stamps = available.filter((s) => selectedIds.includes(s.id));
    if (stamps.length === 0) return;
    onConfirm(stamps);
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div
      className="flex min-h-0 flex-col gap-2.5 rounded-lg border border-zinc-200/90 bg-zinc-50/90 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          Agregar diseños
        </p>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-200/80 hover:text-zinc-700 disabled:opacity-40"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar…"
            className="h-8 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-2 text-xs text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
          />
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={busy || loading || available.length === 0 || machine === 'ABC'}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40"
          title="Sugerir armado por prioridad y largo"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Sugerir
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {FILTERS.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilterType(type)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
              filterType === type
                ? 'bg-zinc-800 text-white'
                : 'bg-white text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-700',
            )}
          >
            {type === 'ALL' ? 'Todos' : type}
          </button>
        ))}
      </div>

      {suggestHint && (
        <p className="text-[11px] leading-snug text-zinc-500">{suggestHint}</p>
      )}

      <div className="min-h-[9.5rem] max-h-[14rem] overflow-y-auto overflow-x-hidden px-1.5 pt-1.5 pr-0.5">
        {loading ? (
          <div className="flex h-28 items-center justify-center gap-2 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        ) : loadError ? (
          <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-red-600">
            {loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-zinc-500">
            No hay sellos elegibles para {machine}.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {filtered.map((stamp) => {
              const selected = selectedIds.includes(stamp.id);
              const planchuela = stampPlanchuelaLabel(stamp);
              const orderDate = stampOrderDateLabel(stamp);
              const note = stamp.notes?.trim() || '';
              const priority = Boolean(stamp.isPriority);
              return (
                <button
                  key={stamp.id}
                  type="button"
                  onClick={() => toggle(stamp.id)}
                  disabled={busy}
                  className={cn(
                    'group relative flex flex-col items-center gap-1 rounded-md p-1.5 text-left transition',
                    'ring-1 ring-inset',
                    selected
                      ? 'bg-zinc-100 ring-zinc-900'
                      : 'bg-white ring-zinc-200/80 hover:ring-zinc-300',
                    'disabled:opacity-40',
                  )}
                  title={stamp.designName}
                >
                  {note ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="img"
                          aria-label="Tiene nota del pedido"
                          className={cn(
                            'absolute -left-1.5 -top-1.5 z-[3] flex h-4 w-4 cursor-help',
                            'items-center justify-center rounded-full bg-zinc-900',
                            'text-[10px] font-bold leading-none text-white',
                            'ring-2 ring-white shadow-sm',
                          )}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          !
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[16rem] border-zinc-800 bg-zinc-900 whitespace-pre-wrap text-left text-xs leading-snug text-white"
                      >
                        {note}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  {priority ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="img"
                          aria-label="Prioritario"
                          className={cn(
                            'absolute -right-1.5 -top-1.5 z-[3] flex h-4 w-4 cursor-help',
                            'items-center justify-center rounded-full bg-zinc-900 text-white',
                            'ring-2 ring-white shadow-sm',
                          )}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="border-zinc-800 bg-zinc-900 text-xs text-white"
                      >
                        Prioritario
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  <div className="relative">
                    <StampThumb
                      stamp={stamp}
                      className="h-14 w-14 rounded border-0 bg-transparent"
                    />
                    {selected && (
                      <span className="absolute -right-1 -bottom-1 z-[2] flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-white shadow">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <span className="line-clamp-2 w-full text-center text-[9px] font-medium leading-tight text-zinc-700">
                    {stamp.designName}
                  </span>
                  {(orderDate || planchuela) && (
                    <span className="flex w-full flex-col items-center gap-0.5 text-center text-[9px] tabular-nums leading-none text-zinc-400">
                      {orderDate && <span>{orderDate}</span>}
                      {planchuela && <span>{planchuela}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-2">
        <span className="text-[11px] tabular-nums text-zinc-500">
          {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-8 rounded-md px-2.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || selectedIds.length === 0}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-zinc-900 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            Agregar
            {selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </button>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
