import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { DIALOGO, Panel, PanelTitle, Segmentado, Vacio } from '@/components/perfil/perfilUi';
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
    return <div className="h-48 text-sm text-muted-foreground">Sin datos</div>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex h-56 items-stretch gap-2">
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
              <span className={cn('truncate text-[11px] tabular-nums', isHighlight ? 'text-foreground' : 'text-muted-foreground')}>
                {r.value}
              </span>
            </div>
            <div className="flex w-full flex-1 items-end justify-center px-0.5">
              <div
                className={cn(
                  'w-full max-w-12 rounded-lg transition-colors',
                  isHighlight
                    ? 'bg-gradient-to-t from-[#8a4a1c] via-[#e0812f] to-[#f6c46b]'
                    : 'bg-white/[0.12] hover:bg-white/[0.2]',
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <div className="mt-2 flex h-7 w-full shrink-0 items-start justify-center">
              <span
                className={cn(
                  'max-w-full truncate text-center text-[11px] leading-tight',
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

  // EQ-R29: ids de request; una respuesta de un período que ya no es el actual se ignora.
  const snapReqRef = useRef(0);
  const galeriaReqRef = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const reqId = ++snapReqRef.current;
    setLoading(true);
    try {
      const s = await getMisNumerosSnapshot({
        userId,
        areaPrincipal,
        periodo,
      });
      if (reqId !== snapReqRef.current) return;
      setSnap(s);
    } catch (err) {
      if (reqId !== snapReqRef.current) return;
      toast({
        title: 'No se pudieron cargar tus números',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
      setSnap(null);
    } finally {
      if (reqId === snapReqRef.current) setLoading(false);
    }
  }, [userId, areaPrincipal, periodo, toast]);

  const loadGaleria = useCallback(
    async (mode: MisNumerosSnapshot['galeriaModo'], offset: number) => {
      const reqId = ++galeriaReqRef.current;
      if (mode === 'pronto') {
        setGaleria([]);
        setGaleriaTotal(0);
        setGaleriaHasMore(false);
        setGaleriaLoading(false);
        return;
      }
      setGaleriaLoading(true);
      try {
        const result =
          mode === 'produccion'
            ? await getGaleriaProduccion({ periodo, offset })
            : await getGaleriaEnvios({ userId, periodo, offset });
        if (reqId !== galeriaReqRef.current) return;
        setGaleria((prev) => (offset === 0 ? result.items : [...prev, ...result.items]));
        setGaleriaTotal(result.total);
        setGaleriaHasMore(result.hasMore);
      } catch (err) {
        if (reqId !== galeriaReqRef.current) return;
        toast({
          title: 'No se pudo cargar la galería',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      } finally {
        if (reqId === galeriaReqRef.current) setGaleriaLoading(false);
      }
    },
    [periodo, userId, toast],
  );

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snap) return;
    // El snapshot puede ser del período anterior mientras llega el nuevo.
    if (snap.periodo !== periodo) return;
    void loadGaleria(snap.galeriaModo, 0);
  }, [snap, periodo, loadGaleria]);
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

  const metricas = snap?.metricas ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Solo los ves vos.{snap?.labelPeriodo ? ` ${snap.labelPeriodo}.` : ''}
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        </p>
        <Segmentado
          opciones={PERIODS.map((p) => ({ valor: p.value, label: p.label }))}
          valor={periodo}
          onChange={setPeriodo}
        />
      </div>

      {metricas.length > 0 ? (
        <Panel>
          <div
            className={cn(
              'grid gap-6 sm:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-white/[0.06]',
              metricas.length >= 4 ? 'lg:grid-cols-4' : metricas.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
            )}
          >
            {metricas.map((m) => (
              <div key={m.key} className="min-w-0 lg:px-6 lg:first:pl-0 lg:last:pr-0">
                <p className="text-[13px] text-muted-foreground">{m.titulo}</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{m.valor}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.comparacion}</p>
                {m.detalle ? <p className="mt-1 text-xs text-[#f6c46b]/90">{m.detalle}</p> : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-12">
        {snap && snap.serie6Meses.length > 0 ? (
          <Panel className="xl:col-span-4">
            <PanelTitle title={snap.serieTitulo} sub="El mes en curso, resaltado" />
            <MiniBarChart rows={snap.serie6Meses} highlightKey={currentMonthKey} />
          </Panel>
        ) : null}

        <Panel className={cn(snap && snap.serie6Meses.length > 0 ? 'xl:col-span-8' : 'xl:col-span-12')}>
          <PanelTitle
            title="Galería"
            sub={
              snap?.galeriaModo !== 'pronto' && galeriaTotal > 0
                ? `${galeriaTotal} ${galeriaTotal === 1 ? 'sello' : 'sellos'} en el período`
                : 'Los sellos del período'
            }
          />

          {snap?.galeriaModo === 'pronto' ? (
            <Vacio>Pronto</Vacio>
          ) : galeriaLoading && galeria.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando galería…
            </div>
          ) : galeria.length === 0 ? (
            <Vacio>Todavía no hay sellos en este período.</Vacio>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">
                {galeria.map((item) => (
                  <button
                    key={item.selloId}
                    type="button"
                    onClick={() => setDetalle(item)}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0812f]/60"
                  >
                    {item.thumbUrl ? (
                      <img
                        src={item.thumbUrl}
                        alt={item.diseno}
                        loading="lazy"
                        className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-900 text-muted-foreground">
                        <Package className="h-5 w-5 opacity-50" />
                        <span className="px-1 text-[10px] leading-tight line-clamp-2">{item.diseno}</span>
                      </div>
                    )}
                    {item.esPrueba ? (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-[10px] text-white">
                        Prueba
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              {galeriaHasMore ? (
                <div className="flex justify-center pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full bg-white/[0.06] px-4 hover:bg-white/[0.1]"
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
        </Panel>
      </div>

      <Dialog open={Boolean(detalle)} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className={cn(DIALOGO, 'max-w-md')}>
          {detalle ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{detalle.diseno}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-white p-4">
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
                  <dd>{detalle.clienteNombre}</dd>
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd>{fmtFecha(detalle.fecha)}</dd>
                  {detalle.esPrueba ? (
                    <>
                      <dt className="text-muted-foreground">Tipo</dt>
                      <dd>Pedido Prueba</dd>
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
