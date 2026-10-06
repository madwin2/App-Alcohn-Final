import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import type { PeriodoNumeros } from '@/lib/equipo/misNumeros';
import type { AreaPrincipalEquipo } from '@/lib/supabase/services/equipo.service';
import {
  getGaleriaEnvios,
  getGaleriaProduccion,
  getMisNumerosSnapshot,
  type GaleriaItem,
  type MisNumerosSnapshot,
} from '@/lib/supabase/services/equipoNumeros.service';

const PERIODS: Array<{ value: PeriodoNumeros; label: string }> = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

function fmtFecha(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  } catch {
    return iso;
  }
}

function MiniBarChart({
  rows,
  highlightKey,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  highlightKey?: string;
}) {
  if (rows.length === 0) {
    return <div className="h-28 text-sm text-muted-foreground">Sin datos</div>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex h-36 items-stretch gap-1.5">
      {rows.map((r) => {
        const h = Math.max((r.value / max) * 100, r.value > 0 ? 4 : 0);
        const isHighlight = highlightKey === r.key;
        return (
          <div
            key={r.key}
            className="flex min-w-0 flex-1 flex-col items-center"
            title={`${r.label}: ${r.value}`}
          >
            <div className="flex h-4 w-full shrink-0 items-end justify-center">
              <span className="truncate text-[9px] font-medium tabular-nums text-muted-foreground">
                {r.value}
              </span>
            </div>
            <div className="flex w-full flex-1 items-end justify-center px-0.5">
              <div
                className={cn(
                  'w-full max-w-9 rounded-t transition-colors',
                  isHighlight ? 'bg-amber-400' : 'bg-amber-400/45 hover:bg-amber-400/70',
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <div className="mt-1 flex h-7 w-full shrink-0 items-start justify-center">
              <span
                className={cn(
                  'max-w-full truncate text-center text-[9px] leading-tight',
                  isHighlight ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {r.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MisNumerosTab({
  userId,
  areaPrincipal,
}: {
  userId: string;
  areaPrincipal: AreaPrincipalEquipo | null;
}) {
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState<PeriodoNumeros>('mes');
  const [snap, setSnap] = useState<MisNumerosSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [galeria, setGaleria] = useState<GaleriaItem[]>([]);
  const [galeriaTotal, setGaleriaTotal] = useState(0);
  const [galeriaHasMore, setGaleriaHasMore] = useState(false);
  const [galeriaLoading, setGaleriaLoading] = useState(false);
  const [detalle, setDetalle] = useState<GaleriaItem | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getMisNumerosSnapshot({
        userId,
        areaPrincipal,
        periodo,
      });
      setSnap(s);
    } catch (err) {
      toast({
        title: 'No se pudieron cargar tus números',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, [userId, areaPrincipal, periodo, toast]);

  const loadGaleria = useCallback(
    async (mode: MisNumerosSnapshot['galeriaModo'], offset: number) => {
      if (mode === 'pronto') {
        setGaleria([]);
        setGaleriaTotal(0);
        setGaleriaHasMore(false);
        return;
      }
      setGaleriaLoading(true);
      try {
        const result =
          mode === 'produccion'
            ? await getGaleriaProduccion({ periodo, offset })
            : await getGaleriaEnvios({ userId, periodo, offset });
        setGaleria((prev) => (offset === 0 ? result.items : [...prev, ...result.items]));
        setGaleriaTotal(result.total);
        setGaleriaHasMore(result.hasMore);
      } catch (err) {
        toast({
          title: 'No se pudo cargar la galería',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      } finally {
        setGaleriaLoading(false);
      }
    },
    [periodo, userId, toast],
  );

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snap) return;
    void loadGaleria(snap.galeriaModo, 0);
  }, [snap, loadGaleria]);
  const currentMonthKey = snap?.serie6Meses.length
    ? snap.serie6Meses[snap.serie6Meses.length - 1]?.key
    : undefined;

  if (loading && !snap) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tus números…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Mis números</h2>
          <p className="text-xs text-muted-foreground">
            Solo los ves vos. {snap?.labelPeriodo ? `Período: ${snap.labelPeriodo}.` : null}
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriodo(p.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                periodo === p.value
                  ? 'bg-white/10 text-white'
                  : 'text-muted-foreground hover:text-white',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Actualizando…
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(snap?.metricas ?? []).map((m) => (
          <div
            key={m.key}
            className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.titulo}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{m.valor}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{m.comparacion}</p>
            {m.detalle ? (
              <p className="mt-1 text-[11px] text-amber-400/90">{m.detalle}</p>
            ) : null}
          </div>
        ))}
      </div>

      {snap && snap.serie6Meses.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {snap.serieTitulo}
          </div>
          <MiniBarChart rows={snap.serie6Meses} highlightKey={currentMonthKey} />
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Galería</h3>
          {snap?.galeriaModo !== 'pronto' && galeriaTotal > 0 ? (
            <span className="text-xs text-muted-foreground">{galeriaTotal} en el período</span>
          ) : null}
        </div>

        {snap?.galeriaModo === 'pronto' ? (
          <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-muted-foreground">
            Pronto
          </div>
        ) : galeriaLoading && galeria.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando galería…
          </div>
        ) : galeria.length === 0 ? (
          <div className="rounded-xl border border-white/10 px-5 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay sellos en este período.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {galeria.map((item) => (
                <button
                  key={item.selloId}
                  type="button"
                  onClick={() => setDetalle(item)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                  {item.thumbUrl ? (
                    <img
                      src={item.thumbUrl}
                      alt={item.diseno}
                      loading="lazy"
                      className="h-full w-full object-contain bg-white p-1 transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <Package className="h-5 w-5 opacity-50" />
                      <span className="px-1 text-[10px] leading-tight line-clamp-2">{item.diseno}</span>
                    </div>
                  )}
                  {item.esPrueba ? (
                    <span className="absolute left-1 top-1 rounded bg-violet-500/90 px-1 py-0.5 text-[9px] font-semibold text-white">
                      Prueba
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {galeriaHasMore ? (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={galeriaLoading}
                  onClick={() => {
                    if (!snap) return;
                    void loadGaleria(snap.galeriaModo, galeria.length);
                  }}
                >
                  {galeriaLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Cargando…
                    </>
                  ) : (
                    'Cargar más'
                  )}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={Boolean(detalle)} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-md">
          {detalle ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{detalle.diseno}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white">
                  {detalle.thumbUrl ? (
                    <img
                      src={detalle.thumbUrl}
                      alt={detalle.diseno}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground/40" />
                  )}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd className="text-white">{detalle.clienteNombre}</dd>
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd className="text-white">{fmtFecha(detalle.fecha)}</dd>
                  {detalle.esPrueba ? (
                    <>
                      <dt className="text-muted-foreground">Tipo</dt>
                      <dd className="text-violet-300">Pedido Prueba</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
