import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErroresMetricCards } from '@/components/errores/ErroresMetricCards';
import { ErroresTable } from '@/components/errores/ErroresTable';
import { ErroresDetailDialog } from '@/components/errores/ErroresDetailDialog';
import {
  ERRORES_PAGE_SIZE,
  fetchErroresList,
  fetchErroresMetricas,
  REHACER_MOTIVO_LABELS,
  REHACER_MOTIVOS,
  type ErrorEventoRow,
  type ErrorMotivoFilter,
  type ErroresMetricas,
} from '@/lib/supabase/services/errores.service';
import { currentArgentinaMonthKey } from '@/lib/utils/argentinaDate';

type PeriodoPreset = 'mes' | '90d' | 'todo';

function periodBounds(preset: PeriodoPreset): { fromIso: string | null; toIso: string | null } {
  if (preset === 'todo') return { fromIso: null, toIso: null };
  const now = new Date();
  if (preset === 'mes') {
    const monthKey = currentArgentinaMonthKey();
    const [y, m] = monthKey.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
    return { fromIso: from.toISOString(), toIso: null };
  }
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: null };
}

export default function ErroresPage() {
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState<PeriodoPreset>('mes');
  const [motivo, setMotivo] = useState<ErrorMotivoFilter>('ALL');
  const [sinDescripcion, setSinDescripcion] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ErrorEventoRow[]>([]);
  const [metricas, setMetricas] = useState<ErroresMetricas | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [selected, setSelected] = useState<ErrorEventoRow | null>(null);
  const loadIdRef = useRef(0);

  const bounds = useMemo(() => periodBounds(periodo), [periodo]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setLoadingMetrics(true);

    const pageSize = search.trim() || sinDescripcion ? 200 : ERRORES_PAGE_SIZE;

    void Promise.all([
      fetchErroresList({
        search,
        motivo,
        sinDescripcion,
        fromIso: bounds.fromIso,
        toIso: bounds.toIso,
        limit: pageSize,
        offset: 0,
      }),
      fetchErroresMetricas({ fromIso: bounds.fromIso, toIso: bounds.toIso }),
    ])
      .then(([list, mets]) => {
        if (loadId !== loadIdRef.current) return;
        setRows(list.rows);
        setHasMore(list.hasMore);
        setNextOffset(pageSize);
        setMetricas(mets);
      })
      .catch((err) => {
        if (loadId !== loadIdRef.current) return;
        toast({
          title: 'No se pudo cargar la hoja de errores',
          description: err instanceof Error ? err.message : 'Error al consultar rehaceres',
          variant: 'destructive',
        });
        setRows([]);
        setHasMore(false);
        setMetricas(null);
      })
      .finally(() => {
        if (loadId === loadIdRef.current) {
          setLoading(false);
          setLoadingMetrics(false);
        }
      });
  }, [search, motivo, sinDescripcion, bounds.fromIso, bounds.toIso, toast]);

  const loadMore = async () => {
    const loadId = loadIdRef.current;
    setLoadingMore(true);
    try {
      const result = await fetchErroresList({
        search,
        motivo,
        sinDescripcion,
        fromIso: bounds.fromIso,
        toIso: bounds.toIso,
        limit: ERRORES_PAGE_SIZE,
        offset: nextOffset,
      });
      if (loadId !== loadIdRef.current) return;
      setRows((prev) => [...prev, ...result.rows]);
      setHasMore(result.hasMore);
      setNextOffset((prev) => prev + ERRORES_PAGE_SIZE);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      toast({
        title: 'No se pudo cargar más',
        description: err instanceof Error ? err.message : 'Error al consultar',
        variant: 'destructive',
      });
    } finally {
      if (loadId === loadIdRef.current) setLoadingMore(false);
    }
  };

  const handleRowUpdated = (next: ErrorEventoRow) => {
    setSelected(next);
    setRows((prev) => {
      const prevRow = prev.find((r) => r.id === next.id);
      const had = Boolean(prevRow?.descripcion?.trim());
      const has = Boolean(next.descripcion?.trim());
      const motivoChanged = prevRow != null && prevRow.motivo !== next.motivo;
      if (had !== has) {
        setMetricas((mets) => {
          if (!mets) return mets;
          const delta = has ? -1 : 1;
          return {
            ...mets,
            sinDescripcion: Math.max(0, mets.sinDescripcion + delta),
          };
        });
      }
      if (motivoChanged) {
        void fetchErroresMetricas({ fromIso: bounds.fromIso, toIso: bounds.toIso })
          .then(setMetricas)
          .catch(() => undefined);
      }
      return prev.map((r) => (r.id === next.id ? next : r));
    });
  };

  const clearFilters = () => {
    setMotivo('ALL');
    setSinDescripcion(false);
    setSearchInput('');
    setSearch('');
  };

  const hasActiveFilters = motivo !== 'ALL' || sinDescripcion || Boolean(search.trim());

  return (
    <AppMain className="flex flex-col">
      <div className="sticky top-0 z-20 space-y-3 border-b border-white/10 bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Calidad
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Errores</h1>
            <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
              Rehaceres del período: motivos, notas y archivos congelados del momento del error.
            </p>
          </div>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-zinc-400 hover:text-zinc-100"
              onClick={clearFilters}
            >
              <X className="h-3.5 w-3.5" />
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar cliente, diseño, motivo, nota…"
              className="border-white/10 bg-white/[0.03] pl-8"
            />
          </div>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoPreset)}>
            <SelectTrigger className="w-[150px] border-white/10 bg-white/[0.03]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Este mes</SelectItem>
              <SelectItem value="90d">Últimos 90 días</SelectItem>
              <SelectItem value="todo">Todo</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={motivo}
            onValueChange={(v) => {
              setMotivo(v as ErrorMotivoFilter);
              setSinDescripcion(false);
            }}
          >
            <SelectTrigger className="w-[220px] border-white/10 bg-white/[0.03]">
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los motivos</SelectItem>
              {REHACER_MOTIVOS.map((m) => (
                <SelectItem key={m} value={m}>
                  {REHACER_MOTIVO_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sinDescripcion ? (
          <p className="text-[11px] text-amber-200/80">
            Solo casos sin descripción. Abrí uno y completá la nota.
          </p>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
        <ErroresMetricCards
          metricas={metricas}
          loading={loadingMetrics}
          activeMotivo={motivo === 'ALL' ? null : motivo}
          sinDescripcionActivo={sinDescripcion}
          onFilterMotivo={(m) => {
            setSinDescripcion(false);
            setMotivo(m ? (m as ErrorMotivoFilter) : 'ALL');
          }}
          onFilterSinDescripcion={() => {
            setMotivo('ALL');
            setSinDescripcion(true);
          }}
        />
        <ErroresTable
          rows={rows}
          loading={loading}
          onSelect={(row) => setSelected(row)}
          onUpdated={handleRowUpdated}
        />
        {hasMore ? (
          <div className="flex justify-center pb-2">
            <Button
              variant="outline"
              className="border-white/10 bg-white/[0.02]"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando…
                </>
              ) : (
                'Cargar más'
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <ErroresDetailDialog
        row={selected}
        open={Boolean(selected)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelected(null);
        }}
        onUpdated={handleRowUpdated}
      />
      <Toaster />
    </AppMain>
  );
}
