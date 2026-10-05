import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Estado, Panel, formatArs, formatArsCorto, formatUsd, type Tono } from '@/components/economia/controlGastosUi';
import { type ConceptoValuado, type GastoProveedor, type ValuacionMes } from '@/lib/gastos/gastosAuto';
import {
  createPagoUsd,
  deletePagoUsd,
  ejecutarSyncGastos,
  fetchUltimaCotizacion,
  type GastosAutoData,
  type SyncLogRow,
} from '@/lib/supabase/services/gastosAuto.service';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import { cn } from '@/lib/utils/cn';

const FUENTES: Array<{ proveedor: GastoProveedor; label: string; detalle: string }> = [
  { proveedor: 'meta_ads', label: 'Meta Ads', detalle: 'Facebook e Instagram' },
  { proveedor: 'google_ads', label: 'Google Ads', detalle: 'Búsqueda y display' },
  { proveedor: 'openai', label: 'OpenAI', detalle: 'Imágenes web y automatizaciones' },
  { proveedor: 'recurrente', label: 'Recurrentes', detalle: 'Apps, servidor y suscripciones' },
];

const SYNC_KEY: Partial<Record<GastoProveedor, string>> = {
  meta_ads: 'meta_ads',
  google_ads: 'google_ads',
  openai: 'openai',
  recurrente: 'recurrentes',
};

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

function cuando(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${hora}`;
}

/** Gastos automáticos del mes y pago de sus dólares. Se suman a lo cargado a mano solo en Economía. */
export function GastosAutoCard({ mes, etiquetaMes, valuacion, data, blueHoy, loading, error, onReload }: Props) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [abierto, setAbierto] = useState<GastoProveedor | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);

  const fechaInicio = data?.config.fechaInicio ?? '';
  const mesConAuto = !!fechaInicio && mes >= fechaInicio.slice(0, 7);
  const syncPor = useMemo(() => new Map((data?.ultimosSync ?? []).map((s) => [s.proveedor, s])), [data]);
  const ultimoSync = data?.ultimosSync.reduce<SyncLogRow | null>(
    (acc, s) => (!acc || s.createdAt > acc.createdAt ? s : acc),
    null,
  );

  const porFuente = useMemo(() => {
    const m = new Map<GastoProveedor, { ars: number; usd: number; conceptos: ConceptoValuado[] }>();
    for (const c of valuacion?.conceptos ?? []) {
      const g = m.get(c.proveedor) ?? { ars: 0, usd: 0, conceptos: [] };
      g.ars += c.ars;
      if (c.moneda === 'USD') g.usd += c.montoOriginal;
      g.conceptos.push(c);
      m.set(c.proveedor, g);
    }
    return m;
  }, [valuacion]);

  async function sincronizar() {
    setSyncing(true);
    try {
      await ejecutarSyncGastos();
      await onReload();
      toast({ title: 'Gastos actualizados' });
    } catch (e) {
      toast({ title: 'No se pudo actualizar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  function estadoFuente(p: GastoProveedor): { tono: Tono; texto: string } | null {
    const s = syncPor.get(SYNC_KEY[p] ?? p);
    if (p === 'recurrente') return porFuente.has(p) ? null : { tono: 'neutro', texto: 'Ninguno este mes' };
    if (!s) return { tono: 'neutro', texto: 'Sin conectar' };
    if (!s.ok) return { tono: 'mal', texto: 'Error al actualizar' };
    return porFuente.has(p) ? null : { tono: 'ok', texto: 'Conectado · sin gastos este mes' };
  }

  const total = valuacion?.total ?? 0;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-medium">Gastos automáticos</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {etiquetaMes} · se cargan solos y se suman en Economía
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {ultimoSync ? <span>Actualizado {cuando(ultimoSync.createdAt)}</span> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => void sincronizar()}
            disabled={syncing}
          >
            <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} aria-hidden />
            Actualizar
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">No se pudieron cargar: {error}</p> : null}

      {!mesConAuto && data ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Este mes es anterior a los gastos automáticos: se usa solo lo cargado a mano abajo.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-4xl font-semibold tabular-nums tracking-tight">{loading && !data ? '—' : formatArsCorto(total)}</span>
            <span className="text-sm text-muted-foreground">en el mes, con IVA</span>
          </div>

          <ul className="mt-6 divide-y divide-white/[0.06]">
            {FUENTES.map((f) => {
              const g = porFuente.get(f.proveedor);
              const estado = estadoFuente(f.proveedor);
              const expandible = !!g && g.conceptos.length > 0;
              const open = abierto === f.proveedor;
              return (
                <li key={f.proveedor}>
                  <button
                    type="button"
                    disabled={!expandible}
                    onClick={() => setAbierto(open ? null : f.proveedor)}
                    className="flex w-full items-center gap-4 py-3.5 text-left disabled:cursor-default"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.detalle}</p>
                    </div>
                    {g ? (
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">{formatArs(g.ars)}</p>
                        {g.usd > 0 ? <p className="text-xs tabular-nums text-muted-foreground">{formatUsd(g.usd)} + IVA</p> : null}
                      </div>
                    ) : estado ? (
                      <Estado tono={estado.tono} className="text-xs text-muted-foreground">
                        {estado.texto}
                      </Estado>
                    ) : null}
                    <ChevronDown
                      className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !expandible && 'invisible', open && 'rotate-180')}
                      aria-hidden
                    />
                  </button>
                  {open && g ? (
                    <ul className="mb-3 space-y-1.5 rounded-2xl bg-white/[0.03] px-4 py-3">
                      {g.conceptos.map((c) => (
                        <li key={`${c.categoria}|${c.concepto}|${c.moneda}`} className="flex justify-between gap-4 text-xs">
                          <span className="min-w-0 truncate text-muted-foreground">{c.concepto}</span>
                          <span className="shrink-0 tabular-nums">{formatArs(c.ars)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
            {valuacion && valuacion.impuestosExtra > 0 ? (
              <li className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">Otros impuestos</p>
                  <p className="text-xs text-muted-foreground">IIBB, sellos y recargos sobre los dólares (estimado)</p>
                </div>
                <p className="text-sm font-medium tabular-nums">{formatArs(valuacion.impuestosExtra)}</p>
                <span className="size-4 shrink-0" aria-hidden />
              </li>
            ) : null}
          </ul>

          {valuacion && valuacion.usdBase > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm">
                  Dólares del mes: <span className="font-medium tabular-nums">{formatUsd(valuacion.usdBase)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {valuacion.estado === 'pagado'
                    ? `Pagados a ${formatArs(valuacion.cotizacionEfectiva)} por dólar`
                    : valuacion.estado === 'parcial'
                      ? `Pagados ${formatUsd(valuacion.usdPagado)} · el resto se estima al blue de hoy`
                      : `Sin pagar · estimados al blue de hoy (${formatArs(blueHoy ?? valuacion.cotizacionEfectiva)})`}
                </p>
              </div>
              <Button type="button" size="sm" variant={valuacion.estado === 'pagado' ? 'ghost' : 'secondary'} className="h-8 rounded-full px-4 text-xs" onClick={() => setPagoOpen(true)}>
                {valuacion.estado === 'pagado' ? 'Ver pagos' : 'Marcar pago'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <PagoDialog
        open={pagoOpen}
        onOpenChange={setPagoOpen}
        mes={mes}
        etiquetaMes={etiquetaMes}
        valuacion={valuacion}
        pagos={(data?.pagos ?? []).filter((p) => p.mes === mes)}
        onReload={onReload}
      />
    </Panel>
  );
}

function PagoDialog({
  open,
  onOpenChange,
  mes,
  etiquetaMes,
  valuacion,
  pagos,
  onReload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mes: string;
  etiquetaMes: string;
  valuacion: ValuacionMes | undefined;
  pagos: GastosAutoData['pagos'];
  onReload: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(todayArgentinaDateKey);
  const [usd, setUsd] = useState('');
  const [cot, setCot] = useState('');
  const [guardando, setGuardando] = useState(false);
  const pendiente = valuacion?.usdPendiente ?? 0;

  useEffect(() => {
    if (open) setUsd(pendiente > 0 ? String(pendiente) : '');
  }, [open, pendiente]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void fetchUltimaCotizacion(fecha)
      .then((c) => {
        if (!cancel) setCot(c ? String(c.blueVenta) : '');
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [open, fecha]);

  const usdN = Number(usd.replace(',', '.'));
  const cotN = Number(cot.replace(',', '.'));

  async function guardar() {
    if (!(usdN > 0) || !(cotN > 0) || !fecha) {
      toast({ title: 'Completá fecha, dólares y cotización', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await createPagoUsd({ mes, fecha, usd: usdN, cotizacion: cotN });
      await onReload();
      toast({ title: 'Pago registrado' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    try {
      await deletePagoUsd(id);
      await onReload();
    } catch (e) {
      toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Pago de los dólares de {etiquetaMes.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Con la cotización del día en que pagaste queda fijo el costo real en pesos de ese mes.
          </DialogDescription>
        </DialogHeader>

        {pagos.length ? (
          <ul className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] px-4">
            {pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="tabular-nums">
                  {new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ·{' '}
                  {formatUsd(p.usd)} a {formatArs(p.cotizacion)}
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void borrar(p.id)} aria-label="Borrar pago">
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {pendiente > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Día del pago</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Dólares pagados</Label>
                <Input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Dólar blue ese día</Label>
                <Input inputMode="decimal" value={cot} onChange={(e) => setCot(e.target.value)} />
              </div>
            </div>
            {usdN > 0 && cotN > 0 ? (
              <p className="text-sm text-muted-foreground">
                = <span className="font-medium tabular-nums text-foreground">{formatArs(usdN * cotN)}</span> antes de IVA
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" className="rounded-full" onClick={() => void guardar()} disabled={guardando}>
                Guardar pago
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Los dólares de este mes ya están pagados.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
