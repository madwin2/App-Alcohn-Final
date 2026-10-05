import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  CATEGORIA_LABEL,
  PROVEEDOR_LABEL,
  type EstadoPagoUsd,
  type GastoProveedor,
  type ValuacionMes,
} from '@/lib/gastos/gastosAuto';
import {
  createPagoUsd,
  deletePagoUsd,
  ejecutarSyncGastos,
  fetchUltimaCotizacion,
  type GastosAutoData,
} from '@/lib/supabase/services/gastosAuto.service';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import { cn } from '@/lib/utils/cn';

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
const formatUsd = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const ESTADO_LABEL: Record<EstadoPagoUsd, string> = {
  sin_usd: 'Sin USD',
  estimado: 'Estimado (blue de hoy)',
  parcial: 'Pagado en parte',
  pagado: 'Pagado',
};

const SYNC_PROVEEDORES: Array<{ key: string; label: string }> = [
  { key: 'cotizacion', label: 'Dólar blue' },
  { key: 'meta_ads', label: 'Meta Ads' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'recurrentes', label: 'Recurrentes' },
];

type Props = {
  mes: string;
  etiquetaMes: string;
  valuacion: ValuacionMes | undefined;
  data: GastosAutoData | null;
  blueHoy: number | null;
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
};

/** Gastos automáticos del mes + pago de los USD. Se suman a lo cargado a mano solo en Economía. */
export function GastosAutoCard({ mes, etiquetaMes, valuacion, data, blueHoy, loading, error, onReload }: Props) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [pagoFecha, setPagoFecha] = useState(todayArgentinaDateKey);
  const [pagoUsd, setPagoUsd] = useState('');
  const [pagoCot, setPagoCot] = useState('');
  const [guardando, setGuardando] = useState(false);

  const fechaInicio = data?.config.fechaInicio ?? '';
  const mesConAuto = !!fechaInicio && mes >= fechaInicio.slice(0, 7);
  const pagosMes = useMemo(() => (data?.pagos ?? []).filter((p) => p.mes === mes), [data, mes]);

  // Prellenar con lo pendiente del mes.
  useEffect(() => {
    setPagoUsd(valuacion && valuacion.usdPendiente > 0 ? String(valuacion.usdPendiente) : '');
  }, [mes, valuacion?.usdPendiente]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prellenar cotización con el blue de la fecha elegida (o la última anterior).
  useEffect(() => {
    let cancel = false;
    void fetchUltimaCotizacion(pagoFecha)
      .then((c) => {
        if (!cancel) setPagoCot(c ? String(c.blueVenta) : '');
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [pagoFecha]);

  const porProveedor = useMemo(() => {
    const m = new Map<GastoProveedor, { ars: number; items: ValuacionMes['conceptos'] }>();
    for (const c of valuacion?.conceptos ?? []) {
      const g = m.get(c.proveedor) ?? { ars: 0, items: [] };
      g.ars += c.ars;
      g.items.push(c);
      m.set(c.proveedor, g);
    }
    return [...m.entries()].sort((a, b) => b[1].ars - a[1].ars);
  }, [valuacion]);

  const syncPorProveedor = useMemo(() => new Map((data?.ultimosSync ?? []).map((s) => [s.proveedor, s])), [data]);

  async function sincronizar() {
    setSyncing(true);
    try {
      await ejecutarSyncGastos();
      await onReload();
      toast({ title: 'Gastos actualizados' });
    } catch (e) {
      toast({ title: 'No se pudo sincronizar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  async function marcarPago() {
    const usd = Number(pagoUsd.replace(',', '.'));
    const cot = Number(pagoCot.replace(',', '.'));
    if (!(usd > 0) || !(cot > 0) || !pagoFecha) {
      toast({ title: 'Completá fecha, USD y cotización', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await createPagoUsd({ mes, fecha: pagoFecha, usd, cotizacion: cot });
      await onReload();
      toast({ title: 'Pago registrado', description: `${formatUsd(usd)} a ${formatArs(cot)}` });
    } catch (e) {
      toast({ title: 'No se pudo guardar el pago', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function borrarPago(id: string) {
    try {
      await deletePagoUsd(id);
      await onReload();
    } catch (e) {
      toast({ title: 'No se pudo borrar el pago', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }

  return (
    <Card className="w-full border-primary/30 shadow-sm">
      <CardHeader className="space-y-1 border-b border-border/50 bg-muted/15 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">Gastos automáticos — {etiquetaMes}</CardTitle>
            <CardDescription className="text-xs leading-snug">
              Meta Ads, Google Ads, OpenAI y recurrentes, por día de gasto. Se <strong>suman</strong> a lo cargado a mano en
              Economía: no cargues acá la publicidad de la tarjeta para estos meses.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void sincronizar()} disabled={syncing}>
            <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} aria-hidden />
            Actualizar ahora
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {SYNC_PROVEEDORES.map(({ key, label }) => {
            const s = syncPorProveedor.get(key);
            return (
              <Badge
                key={key}
                variant="outline"
                title={s ? `${new Date(s.createdAt).toLocaleString('es-AR')} · ${s.detalle ?? ''}` : 'Nunca sincronizado / sin configurar'}
                className={cn(
                  'px-1.5 py-0 text-[10px] font-normal',
                  s?.ok === true && 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
                  s?.ok === false && 'border-destructive/50 text-destructive',
                )}
              >
                {label}: {s ? (s.ok ? new Date(s.createdAt).toLocaleDateString('es-AR') : 'error') : '—'}
              </Badge>
            );
          })}
          {blueHoy ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              Blue hoy {formatArs(blueHoy)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 py-4 text-sm">
        {error ? <p className="text-xs text-destructive">No se pudieron cargar los gastos automáticos: {error}</p> : null}
        {loading && !data ? <p className="text-xs text-muted-foreground">Cargando…</p> : null}

        {!mesConAuto && data ? (
          <p className="text-xs text-muted-foreground">
            Este mes es anterior al inicio de los gastos automáticos ({fechaInicio}). Se usa lo cargado a mano.
          </p>
        ) : null}

        {mesConAuto && data && (!valuacion || valuacion.total <= 0) ? (
          <p className="text-xs text-muted-foreground">Sin gastos automáticos registrados para este mes todavía.</p>
        ) : null}

        {valuacion && valuacion.total > 0 ? (
          <>
            <div className="grid gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              {(['publicidad', 'automatizaciones', 'gastos_varios'] as const).map((k) =>
                valuacion.porCategoria[k] > 0 ? (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{CATEGORIA_LABEL[k]} (con IVA)</span>
                    <span className="font-semibold tabular-nums">{formatArs(valuacion.porCategoria[k])}</span>
                  </div>
                ) : null,
              )}
              {valuacion.impuestosExtra > 0 ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Impuestos extra USD</span>
                  <span className="font-semibold tabular-nums">{formatArs(valuacion.impuestosExtra)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-border/60 pt-2 sm:col-span-2 lg:col-span-4">
                <span className="font-medium">Total automático</span>
                <span className="text-lg font-bold tabular-nums">{formatArs(valuacion.total)}</span>
              </div>
            </div>

            <div className="space-y-2">
              {porProveedor.map(([prov, g]) => (
                <details key={prov} className="rounded-lg border border-border/50 px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <span className="font-medium">{PROVEEDOR_LABEL[prov]}</span>
                    <span className="tabular-nums">{formatArs(g.ars)}</span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {g.items.map((c) => (
                      <li key={`${c.categoria}|${c.concepto}|${c.moneda}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate text-muted-foreground">{c.concepto}</span>
                        <span className="shrink-0 tabular-nums">
                          {c.moneda === 'USD' ? `${formatUsd(c.montoOriginal)} · ` : ''}
                          {formatArs(c.ars)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </>
        ) : null}

        {valuacion && valuacion.usdBase > 0 ? (
          <section className="space-y-3 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Pago de los dólares del mes</h4>
              <Badge
                variant={valuacion.estado === 'pagado' ? 'secondary' : 'outline'}
                className={cn('text-[10px]', valuacion.estado === 'pagado' && 'text-emerald-600 dark:text-emerald-400')}
              >
                {ESTADO_LABEL[valuacion.estado]}
              </Badge>
            </div>
            <div className="grid gap-1 text-xs sm:grid-cols-3">
              <span>
                USD del mes: <strong className="tabular-nums">{formatUsd(valuacion.usdBase)}</strong>
              </span>
              <span>
                Pagado: <strong className="tabular-nums">{formatUsd(valuacion.usdPagado)}</strong>
              </span>
              <span>
                Cotización usada: <strong className="tabular-nums">{formatArs(valuacion.cotizacionEfectiva)}</strong>
              </span>
            </div>
            {valuacion.sinCotizacionHoy ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                No hay blue de hoy cargado: lo pendiente se valúa con la última cotización conocida.
              </p>
            ) : null}

            {pagosMes.length ? (
              <ul className="space-y-1 text-xs">
                {pagosMes.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="tabular-nums">
                      {p.fecha} · {formatUsd(p.usd)} a {formatArs(p.cotizacion)}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => void borrarPago(p.id)} aria-label="Borrar pago">
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {valuacion.usdPendiente > 0 ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Fecha del pago</Label>
                  <Input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">USD pagados</Label>
                  <Input inputMode="decimal" value={pagoUsd} onChange={(e) => setPagoUsd(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Cotización (blue de ese día)</Label>
                  <Input inputMode="decimal" value={pagoCot} onChange={(e) => setPagoCot(e.target.value)} className="h-8 text-xs" />
                </div>
                <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void marcarPago()} disabled={guardando}>
                  Marcar pago
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
