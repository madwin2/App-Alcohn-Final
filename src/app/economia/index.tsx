import { useMemo, useState, useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Navigate } from 'react-router-dom';
import { AppMain } from '@/components/layout/AppMain';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOrders } from '@/lib/hooks/useOrders';
import { aPesos, pedidoEnPesos } from '@/lib/internacional';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createEconomiaMovimientoReal,
  deleteEconomiaMovimientoReal,
  fetchEconomiaMovimientosReales,
  type RealMovement,
  type RealMovementType,
} from '@/lib/supabase/services/economiaMovimientos.service';
import {
  clearLegacyEconomiaLocalStorage,
  emptyEconomiaCaja,
  fetchEconomiaSettings,
  readLegacyEconomiaLocalStorage,
  upsertEconomiaSettings,
  type EconomiaCajaRow,
} from '@/lib/supabase/services/economiaSettings.service';
import { loadGastosMensualesIntoCache } from '@/lib/supabase/services/gastosMensuales.service';
import { getShippingCost } from '@/lib/supabase/services/orders.service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderItem } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import {
  currentArgentinaMonthKey,
  monthKeyLabel,
  monthKeyLabelLong,
  orderBusinessMonthKey,
  todayArgentinaDateKey,
} from '@/lib/utils/argentinaDate';
import {
  activeProductKeys,
  buildMonthlyProductBreakdown,
  cellMetric,
  economiaProductoMeta,
  sumProductAcrossMonths,
  type EconomiaMetricMode,
} from '@/lib/economia/productCategory';
import {
  GASTOS_MONTHLY_UPDATED_EVENT,
  applyResumenVentasOverride,
  gananciaInversionesExtrasArs,
  gastosExtrasEnviosManual,
  gastosExtrasSinEnvioParaEconomia,
  gastosOperativosParaEconomia,
  getBundleForMonth,
  getFixedTotalForMonth,
  inversionesExtrasArs,
  isResumenMensual,
  loadAllMonthlyCosts,
  monthHasEconomiaSignal,
  readLegacyFixedScalar,
} from '@/lib/gastos/monthlyEconomiaCosts';
import { Banknote, ChevronDown, CircleDollarSign, HelpCircle, Wallet } from 'lucide-react';

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

/** Si la orden no tiene empresa/servicio de envío cargado, imputamos este costo (todo se envía). */
const ECONOMIA_ENVIO_SIN_TIPO_ARS = 5000;

function orderHasShippingCarrierAndService(order: Order): boolean {
  const c = order.shipping?.carrier;
  const s = order.shipping?.service;
  return Boolean(c && c !== 'OTRO' && c !== 'RETIRO_EN_PERSONA' && s);
}

/** Envío imputado a ventas solo si ya salió el envío (no antes, para no inflar plata). Todos los ítems deben estar en Despachado o Seguimiento enviado. */
function economiaPedidoListoParaImputarEnvio(order: Order): boolean {
  if (!order.items.length) return false;
  return order.items.every(
    (it) => it.shippingState === 'DESPACHADO' || it.shippingState === 'SEGUIMIENTO_ENVIADO',
  );
}

type MonthlyRow = {
  key: string;
  label: string;
  ventasBrutas: number;
  costosFijos: number;
  costosVentas: number;
  gastosExtras: number;
  publicidad: number;
  enviosManual: number;
  /** Mes con cierre tipo Excel: el gasto operativo es `gastosReales`. */
  fuenteResumen: boolean;
  gastosReales: number;
  rentabilidadPesos: number;
  rentabilidadUsd: number;
  gananciaInversionesArs: number;
  gananciaInversionesUsd: number;
  /** Suma ítems en TRANSFERIDO + mismo envío imputado que en ventas (por orden, si ya despachado). */
  transferido: number;
  /** Transferido − gastos operativos del mes. */
  transferidoMenosGastos: number;
  /** Inversiones empresa + Cyprea (extras Gastos). */
  inversionesArs: number;
  /** Desglose extras Gastos (mismo mes). */
  inversionEmpresaArs: number;
  inversionCypreaArs: number;
  compraDolaresArs: number;
  pendiente: number;
  /** Todas las unidades (sellos + accesorios). */
  unidades: number;
  /** Solo ítems tipo SELLO. */
  sellos: number;
  pedidos: number;
};

function totalGastosOperativos(r: MonthlyRow): number {
  if (r.fuenteResumen && r.gastosReales > 0) return r.gastosReales;
  return r.costosFijos + r.costosVentas + r.gastosExtras + r.publicidad + r.enviosManual;
}

function totalGananciasGrupoArs(r: Pick<MonthlyRow, 'inversionEmpresaArs' | 'inversionCypreaArs' | 'compraDolaresArs'>): number {
  return r.inversionEmpresaArs + r.inversionCypreaArs + r.compraDolaresArs;
}

type YearlyRow = {
  year: string;
  ventasBrutas: number;
  gastosOperativos: number;
  /** Rentabilidad operativa (teórica): ventas − gastos. */
  rentabilidadPesos: number;
  compraDolaresArs: number;
  inversionEmpresaArs: number;
  inversionCypreaArs: number;
  /**
   * Ganancia real del año: plata pasada a dólares / inversiones
   * (compra USD + inv. empresa + Cyprea). No se resta de la teórica.
   */
  gananciaRealArs: number;
  transferido: number;
  pendiente: number;
  sellos: number;
  pedidos: number;
  unidades: number;
  meses: number;
};

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const formatCompactArs = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const formatPct = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}%`;
};

function MomChip({ value, label }: { value: number | null; label?: string }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        up
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-red-500/10 text-red-700 dark:text-red-400',
      )}
    >
      {label ? <span className="font-normal opacity-80">{label}</span> : null}
      {formatPct(value)}
    </span>
  );
}

/** Fila de tabla: hover claro + zebra suave; mes actual resaltado. */
function economiaTableRowClass(isCurrent = false) {
  return cn(
    'group border-b border-border/60 last:border-0 transition-colors',
    isCurrent ? 'bg-primary/5' : 'odd:bg-muted/15',
    'hover:bg-muted/45',
  );
}

/** Celda sticky (Mes): hereda el fondo/hover de la fila. */
function economiaStickyCellClass() {
  return 'sticky left-0 z-10 bg-inherit py-2 pl-4 pr-3';
}

/** Encabezado clickeable para expandir/contraer columnas en P&L. */
function PlToggleTh({
  expanded,
  onToggle,
  collapsedLabel,
  expandedHint,
}: {
  expanded: boolean;
  onToggle: () => void;
  collapsedLabel: string;
  expandedHint: string;
}) {
  return (
    <th className="py-2 pr-3 text-right">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          expanded ? 'text-primary' : 'text-foreground',
        )}
        title={expanded ? `Clic para ocultar ${expandedHint}` : `Clic para ver ${expandedHint}`}
        aria-expanded={expanded}
      >
        {expanded ? expandedHint : collapsedLabel}
        <ChevronDown
          className={cn('size-3.5 opacity-70 transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
    </th>
  );
}

function KpiShell({
  children,
  className,
  interactive,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const shellClass = cn(
    'flex h-full w-full flex-col rounded-lg border border-border/70 bg-card p-4 text-left shadow-sm',
    interactive &&
      'cursor-pointer outline-none ring-offset-background transition hover:border-primary/50 hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );
  if (interactive) {
    return (
      <button type="button" className={shellClass} {...rest}>
        {children}
      </button>
    );
  }
  return <div className={shellClass}>{children}</div>;
}

function KpiLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
  );
}

function KpiValue({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{children}</p>;
}

function KpiHint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{children}</p>;
}

const pendingLabel = (state: string) => {
  if (state === 'DEUDOR') return 'Deudor';
  if (state === 'FOTO_ENVIADA') return 'Foto enviada';
  return 'Señado';
};

const movementTypeLabel = (type: RealMovementType) => {
  if (type === 'USD_PURCHASE') return 'Compra de USD (ahorro)';
  if (type === 'INV_EMPRESA') return 'Inversión empresa';
  return 'Inversión Cyprea';
};

const itemTypeOf = (item: OrderItem): 'SELLO' | 'ABECEDARIO' | 'SOLDADOR' | 'MANGO_GOLPE' | 'BASE_REMACHADORA' => {
  if (item.itemType) return item.itemType;
  if (item.stampType === 'ABC') return 'ABECEDARIO';
  return 'SELLO';
};

function TinyLineChart({ values, labels }: { values: number[]; labels?: string[] }) {
  if (values.length === 0) return <div className="h-24 text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox="0 0 100 100" className="h-24 w-full">
        <line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" className="text-border" strokeWidth="1" />
        <line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" className="text-border" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" className="text-primary" />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Mín {min.toFixed(0)}</span>
        {labels && labels.length > 0 ? (
          <span>
            {labels[0]} → {labels[labels.length - 1]}
          </span>
        ) : null}
        <span>Máx {max.toFixed(0)}</span>
      </div>
    </div>
  );
}

/** Ancho mínimo por barra para que el eje X no se amontone (scroll horizontal si hace falta). */
const MONTHLY_BAR_MIN_PX = 36;

/** Barras mensuales con altura real (el % se mide contra un contenedor fijo). */
function MonthlyBarChart({
  rows,
  valueKey,
  highlightKey,
  formatValue,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  valueKey?: string;
  highlightKey?: string;
  formatValue?: (n: number) => string;
}) {
  if (rows.length === 0) return <div className="h-32 text-sm text-muted-foreground">Sin datos</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = formatValue ?? ((n: number) => String(Math.round(n)));
  const showValueLabels = rows.length <= 14;
  const labelEvery = rows.length > 18 ? 3 : rows.length > 12 ? 2 : 1;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div
        className="flex h-36 items-stretch gap-1"
        style={{ minWidth: Math.max(rows.length * MONTHLY_BAR_MIN_PX, 280) }}
      >
        {rows.map((r, i) => {
          const h = Math.max((r.value / max) * 100, r.value > 0 ? 3 : 0);
          const isHighlight = highlightKey === r.key;
          const showLabel = isHighlight || i % labelEvery === 0 || i === rows.length - 1;
          return (
            <div
              key={r.key}
              className="flex min-w-0 flex-1 flex-col items-center"
              title={`${r.label}: ${fmt(r.value)}${valueKey ? ` ${valueKey}` : ''}`}
            >
              <div className="flex h-4 w-full shrink-0 items-end justify-center">
                {showValueLabels || isHighlight ? (
                  <span className="truncate text-[9px] font-medium tabular-nums text-muted-foreground">
                    {fmt(r.value)}
                  </span>
                ) : null}
              </div>
              <div className="flex w-full flex-1 items-end justify-center px-0.5">
                <div
                  className={`w-full max-w-9 rounded-t transition-colors ${
                    isHighlight ? 'bg-primary' : 'bg-primary/50 hover:bg-primary/70'
                  }`}
                  style={{ height: `${h}%` }}
                />
              </div>
              <div className="mt-1 flex h-7 w-full shrink-0 items-start justify-center">
                {showLabel ? (
                  <span
                    className={`max-w-full truncate text-center text-[9px] leading-tight ${
                      isHighlight ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {r.label}
                  </span>
                ) : (
                  <span className="text-[9px] text-muted-foreground/40">·</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Barras apiladas por categoría (mix mensual). */
function StackedMonthlyBars({
  rows,
  keys,
  mode,
  highlightKey,
  formatValue,
}: {
  rows: Array<{ key: string; label: string; values: Record<string, number> }>;
  keys: Array<{ key: string; color: string; label: string }>;
  mode: EconomiaMetricMode;
  highlightKey?: string;
  formatValue: (n: number) => string;
}) {
  if (rows.length === 0 || keys.length === 0) {
    return <div className="h-40 text-sm text-muted-foreground">Sin datos</div>;
  }
  const totals = rows.map((r) => keys.reduce((s, k) => s + (r.values[k.key] || 0), 0));
  const max = Math.max(...totals, 1);
  const showValueLabels = rows.length <= 14;
  const labelEvery = rows.length > 18 ? 3 : rows.length > 12 ? 2 : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          className="flex h-40 items-stretch gap-1"
          style={{ minWidth: Math.max(rows.length * MONTHLY_BAR_MIN_PX, 280) }}
        >
          {rows.map((r, idx) => {
            const total = totals[idx];
            const h = Math.max((total / max) * 100, total > 0 ? 4 : 0);
            const isHighlight = highlightKey === r.key;
            const showLabel = isHighlight || idx % labelEvery === 0 || idx === rows.length - 1;
            return (
              <div
                key={r.key}
                className="flex min-w-0 flex-1 flex-col items-center"
                title={`${r.label}: ${formatValue(total)} (${mode})`}
              >
                <div className="flex h-4 w-full shrink-0 items-end justify-center">
                  {showValueLabels || isHighlight ? (
                    <span className="truncate text-[9px] font-medium tabular-nums text-muted-foreground">
                      {formatValue(total)}
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full flex-1 items-end justify-center px-0.5">
                  <div
                    className={`flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t ${
                      isHighlight ? 'ring-2 ring-primary/60' : ''
                    }`}
                    style={{ height: `${h}%` }}
                  >
                    {keys.map((k) => {
                      const v = r.values[k.key] || 0;
                      if (v <= 0 || total <= 0) return null;
                      const pct = (v / total) * 100;
                      return (
                        <div
                          key={k.key}
                          style={{ height: `${pct}%`, backgroundColor: k.color }}
                          title={`${k.label}: ${formatValue(v)}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="mt-1 flex h-7 w-full shrink-0 items-start justify-center">
                  {showLabel ? (
                    <span
                      className={`max-w-full truncate text-center text-[9px] leading-tight ${
                        isHighlight ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {r.label}
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/40">·</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {keys.map((k) => (
          <div key={k.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: k.color }} />
            <span>{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingPieChart({
  data,
}: {
  data: Array<{ key: string; label: string; amount: number; color: string }>;
}) {
  const total = data.reduce((acc, d) => acc + d.amount, 0);
  if (total <= 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Sin pendiente</div>;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 120 120" className="size-48">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
          {data.map((slice) => {
            const fraction = slice.amount / total;
            const length = circumference * fraction;
            const offset = -acc;
            acc += length;
            return (
              <circle
                key={slice.key}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="14"
                strokeLinecap="butt"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={offset}
                transform="rotate(-90 60 60)"
              />
            );
          })}
          <circle cx="60" cy="60" r="28" fill="hsl(var(--background))" />
          <text x="60" y="56" textAnchor="middle" className="fill-foreground text-[9px] font-medium">
            Pendiente
          </text>
          <text x="60" y="68" textAnchor="middle" className="fill-foreground text-[10px] font-semibold">
            {formatArs(total)}
          </text>
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((slice) => {
          const pct = total > 0 ? (slice.amount / total) * 100 : 0;
          return (
            <div key={slice.key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                <span>{slice.label}</span>
              </div>
              <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EconomiaPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    orders: ordersRaw,
    loading,
    loadingFullCatalog,
    fullCatalogLoaded,
    ensureFullCatalog,
    reloadFullCatalog,
    error: ordersError,
  } = useOrders({
    useFullCatalog: true,
  });
  const orders = useMemo(() => ordersRaw.map(pedidoEnPesos), [ordersRaw]);
  const { toast } = useToast();
  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  useEffect(() => {
    if (!authLoading && isAllowed) {
      void ensureFullCatalog();
    }
  }, [authLoading, isAllowed, ensureFullCatalog]);

  const [usdRate, setUsdRate] = useState(1200);
  const [gastosStorageTick, setGastosStorageTick] = useState(0);
  const [gastosMensualesReady, setGastosMensualesReady] = useState(false);
  const [gastosMensualesError, setGastosMensualesError] = useState<string | null>(null);
  const [realMovements, setRealMovements] = useState<RealMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const [movementDate, setMovementDate] = useState(todayArgentinaDateKey);
  const [usdAmount, setUsdAmount] = useState(0);
  const [usdBuyRate, setUsdBuyRate] = useState(usdRate);
  const [invEmpresaArs, setInvEmpresaArs] = useState(0);
  const [invCypreaArs, setInvCypreaArs] = useState(0);
  const [mensualDetalleGastos, setMensualDetalleGastos] = useState(false);
  const [mensualDetalleGanancias, setMensualDetalleGanancias] = useState(false);
  const [showMetodologia, setShowMetodologia] = useState(false);
  const [desgloseMetric, setDesgloseMetric] = useState<EconomiaMetricMode>('unidades');
  const [cajaBalances, setCajaBalances] = useState<EconomiaCajaRow>(() => emptyEconomiaCaja());
  const [economiaSettingsLoading, setEconomiaSettingsLoading] = useState(true);
  const [economiaSettingsHydrated, setEconomiaSettingsHydrated] = useState(false);

  /** Monto de envío desde tabla (solo órdenes con carrier/servicio y ya despachadas): `costos_de_envio`. El default $5000 se aplica en el useMemo si corresponde. */
  const [shippingCostByOrderId, setShippingCostByOrderId] = useState<Record<string, number>>({});

  useEffect(() => {
    if (authLoading || !isAllowed || !user?.id) {
      setEconomiaSettingsLoading(false);
      setEconomiaSettingsHydrated(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setEconomiaSettingsLoading(true);
      try {
        let row = await fetchEconomiaSettings(user.id);
        if (cancelled) return;
        if (!row) {
          const legacy = readLegacyEconomiaLocalStorage();
          if (legacy) {
            await upsertEconomiaSettings(user.id, {
              usdReference: legacy.usdReference,
              caja: legacy.caja,
            });
            clearLegacyEconomiaLocalStorage();
            row = await fetchEconomiaSettings(user.id);
          }
        }
        if (cancelled) return;
        if (row) {
          setUsdRate(row.usdReference);
          setCajaBalances(row.caja);
        }
        if (!cancelled) setEconomiaSettingsHydrated(true);
      } catch (e) {
        toast({
          title: 'No se pudieron cargar los ajustes de Economía',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setEconomiaSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, user?.id, toast]);

  useEffect(() => {
    if (!economiaSettingsHydrated || !isAllowed || !user?.id) return;
    const t = window.setTimeout(() => {
      void upsertEconomiaSettings(user.id, { usdReference: usdRate, caja: cajaBalances }).catch((e) => {
        toast({
          title: 'No se pudo guardar en la base de datos',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [usdRate, cajaBalances, economiaSettingsHydrated, isAllowed, user?.id, toast]);

  useEffect(() => {
    const bump = () => setGastosStorageTick((t) => t + 1);
    window.addEventListener(GASTOS_MONTHLY_UPDATED_EVENT, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(GASTOS_MONTHLY_UPDATED_EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  useEffect(() => {
    if (authLoading || !isAllowed || !user?.id) return;
    let cancelled = false;
    setGastosMensualesReady(false);
    setGastosMensualesError(null);
    void loadGastosMensualesIntoCache(user.id)
      .then(() => {
        if (!cancelled) {
          setGastosStorageTick((t) => t + 1);
          setGastosMensualesReady(true);
          setGastosMensualesError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setGastosMensualesReady(false);
          setGastosMensualesError(e instanceof Error ? e.message : String(e));
          toast({
            title: 'No se pudieron cargar los gastos mensuales',
            description: e instanceof Error ? e.message : String(e),
            variant: 'destructive',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, user?.id, toast]);

  useEffect(() => {
    if (authLoading || !isAllowed) return;
    let cancelled = false;
    (async () => {
      setMovementsLoading(true);
      try {
        const rows = await fetchEconomiaMovimientosReales();
        if (!cancelled) setRealMovements(rows);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'No se pudieron cargar los movimientos reales',
            description: error instanceof Error ? error.message : String(error),
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, toast]);

  useEffect(() => {
    if (!orders.length) {
      setShippingCostByOrderId({});
      return;
    }
    const conEnvioCargado = orders.filter(
      (o) => orderHasShippingCarrierAndService(o) && economiaPedidoListoParaImputarEnvio(o),
    );
    if (!conEnvioCargado.length) {
      setShippingCostByOrderId({});
      return;
    }
    let cancelled = false;
    (async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        conEnvioCargado.map(async (o) => {
          const n = Number(await getShippingCost(o.shipping!.carrier, o.shipping!.service));
          if (!cancelled && n > 0) out[o.id] = n;
        }),
      );
      if (!cancelled) setShippingCostByOrderId(out);
    })();

    return () => {
      cancelled = true;
    };
  }, [orders]);

  const monthly = useMemo<MonthlyRow[]>(() => {
    const gastosPorMes = loadAllMonthlyCosts();
    const legacyFixed = readLegacyFixedScalar();
    const byMonth = new Map<string, MonthlyRow>();

    for (const order of orders) {
      const key = orderBusinessMonthKey(order);
      const bundle = getBundleForMonth(gastosPorMes, key);
      const resumen = isResumenMensual(bundle);
      const gastosRealesMes = resumen ? Number(bundle.gastos_reales) || 0 : 0;
      const costosFijosMes = resumen ? 0 : getFixedTotalForMonth(bundle, legacyFixed);
      const gastosExtrasSinEnvioMes = resumen ? 0 : gastosExtrasSinEnvioParaEconomia(bundle.extras);
      const publicidadMes = Number(bundle.extras.publicidad) || 0;
      const enviosManualMes = resumen ? 0 : gastosExtrasEnviosManual(bundle.extras);
      const gananciaInvArs = gananciaInversionesExtrasArs(bundle.extras);
      const inversionesMes = inversionesExtrasArs(bundle.extras);
      const invEmpresaMes = Number(bundle.extras.inversiones_empresa) || 0;
      const invCypreaMes = Number(bundle.extras.inversion_cyprea) || 0;
      const compraDolaresMes = Number(bundle.extras.compra_dolares) || 0;

      const row =
        byMonth.get(key) ||
        ({
          key,
          label: monthKeyLabel(key),
          ventasBrutas: 0,
          costosFijos: costosFijosMes,
          costosVentas: 0,
          gastosExtras: gastosExtrasSinEnvioMes,
          publicidad: publicidadMes,
          enviosManual: enviosManualMes,
          fuenteResumen: resumen,
          gastosReales: gastosRealesMes,
          rentabilidadPesos: 0,
          rentabilidadUsd: 0,
          gananciaInversionesArs: gananciaInvArs,
          gananciaInversionesUsd: 0,
          transferido: 0,
          transferidoMenosGastos: 0,
          inversionesArs: inversionesMes,
          inversionEmpresaArs: invEmpresaMes,
          inversionCypreaArs: invCypreaMes,
          compraDolaresArs: compraDolaresMes,
          pendiente: 0,
          unidades: 0,
          sellos: 0,
          pedidos: 0,
        } satisfies MonthlyRow);

      row.pedidos += 1;
      const fab = Number(order.fabricationCostTotal || 0);
      const envioImputadoVentas = economiaPedidoListoParaImputarEnvio(order)
        ? order.international
          ? aPesos(Number(order.internationalShipping || 0), order.international)
          : orderHasShippingCarrierAndService(order)
            ? (shippingCostByOrderId[order.id] ?? ECONOMIA_ENVIO_SIN_TIPO_ARS)
            : ECONOMIA_ENVIO_SIN_TIPO_ARS
        : 0;
      row.ventasBrutas += Number(order.totalValue || 0) + envioImputadoVentas;
      if (!resumen) row.costosVentas += fab;
      row.costosFijos = costosFijosMes;
      row.gastosExtras = gastosExtrasSinEnvioMes;
      row.publicidad = publicidadMes;
      row.enviosManual = enviosManualMes;
      row.fuenteResumen = resumen;
      row.gastosReales = gastosRealesMes;
      row.gananciaInversionesArs = gananciaInvArs;
      row.gananciaInversionesUsd = usdRate > 0 ? gananciaInvArs / usdRate : 0;
      row.inversionesArs = inversionesMes;
      row.inversionEmpresaArs = invEmpresaMes;
      row.inversionCypreaArs = invCypreaMes;
      row.compraDolaresArs = compraDolaresMes;

      for (const item of order.items) {
        row.unidades += 1;
        if (itemTypeOf(item) === 'SELLO') row.sellos += 1;

        const value = Number(item.itemValue || 0);
        if (item.saleState === 'TRANSFERIDO') {
          row.transferido += value;
        }
      }
      row.transferido += envioImputadoVentas;

      row.pendiente = row.ventasBrutas - row.transferido;
      const gastosOp = gastosOperativosParaEconomia(bundle, row.costosVentas, legacyFixed);
      row.rentabilidadPesos = row.ventasBrutas - gastosOp;
      row.rentabilidadUsd = usdRate > 0 ? row.rentabilidadPesos / usdRate : 0;
      row.transferidoMenosGastos = row.transferido - gastosOp;
      applyResumenVentasOverride(row, bundle, usdRate, legacyFixed);

      byMonth.set(key, row);
    }

    // Meses con resumen/gastos cargados pero sin pedidos en el catálogo (p. ej. 2024).
    for (const key of Object.keys(gastosPorMes)) {
      if (byMonth.has(key)) continue;
      const bundle = getBundleForMonth(gastosPorMes, key);
      const resumen = isResumenMensual(bundle);
      if (!monthHasEconomiaSignal(bundle)) continue;

      const gastosRealesMes = resumen ? Number(bundle.gastos_reales) || 0 : 0;
      const costosFijosMes = resumen ? 0 : getFixedTotalForMonth(bundle, legacyFixed);
      const gastosExtrasSinEnvioMes = resumen ? 0 : gastosExtrasSinEnvioParaEconomia(bundle.extras);
      const publicidadMes = Number(bundle.extras.publicidad) || 0;
      const enviosManualMes = resumen ? 0 : gastosExtrasEnviosManual(bundle.extras);
      const gananciaInvArs = gananciaInversionesExtrasArs(bundle.extras);
      const gastosOp = gastosOperativosParaEconomia(bundle, 0, legacyFixed);

      const row = {
        key,
        label: monthKeyLabel(key),
        ventasBrutas: 0,
        costosFijos: costosFijosMes,
        costosVentas: 0,
        gastosExtras: gastosExtrasSinEnvioMes,
        publicidad: publicidadMes,
        enviosManual: enviosManualMes,
        fuenteResumen: resumen,
        gastosReales: gastosRealesMes,
        rentabilidadPesos: 0 - gastosOp,
        rentabilidadUsd: usdRate > 0 ? (0 - gastosOp) / usdRate : 0,
        gananciaInversionesArs: gananciaInvArs,
        gananciaInversionesUsd: usdRate > 0 ? gananciaInvArs / usdRate : 0,
        transferido: 0,
        transferidoMenosGastos: 0 - gastosOp,
        inversionesArs: inversionesExtrasArs(bundle.extras),
        inversionEmpresaArs: Number(bundle.extras.inversiones_empresa) || 0,
        inversionCypreaArs: Number(bundle.extras.inversion_cyprea) || 0,
        compraDolaresArs: Number(bundle.extras.compra_dolares) || 0,
        pendiente: 0,
        unidades: 0,
        sellos: 0,
        pedidos: 0,
      };
      applyResumenVentasOverride(row, bundle, usdRate, legacyFixed);
      byMonth.set(key, row);
    }

    return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [orders, usdRate, gastosStorageTick, shippingCostByOrderId]);

  const totals = useMemo(() => {
    return monthly.reduce(
      (acc, r) => {
        acc.ventasBrutas += r.ventasBrutas;
        acc.costosFijos += r.costosFijos;
        acc.costosVentas += r.costosVentas;
        acc.gastosExtras += r.gastosExtras;
        acc.publicidad += r.publicidad;
        acc.enviosManual += r.enviosManual;
        acc.gastosOperativos += totalGastosOperativos(r);
        acc.rentabilidadPesos += r.rentabilidadPesos;
        acc.gananciaInversionesArs += r.gananciaInversionesArs;
        acc.gananciaInversionesUsd += r.gananciaInversionesUsd;
        acc.transferido += r.transferido;
        acc.transferidoMenosGastos += r.transferidoMenosGastos;
        acc.inversionesArs += r.inversionesArs;
        acc.inversionEmpresaArs += r.inversionEmpresaArs;
        acc.inversionCypreaArs += r.inversionCypreaArs;
        acc.compraDolaresArs += r.compraDolaresArs;
        acc.pendiente += r.pendiente;
        acc.unidades += r.unidades;
        acc.sellos += r.sellos;
        acc.pedidos += r.pedidos;
        return acc;
      },
      {
        ventasBrutas: 0,
        costosFijos: 0,
        costosVentas: 0,
        gastosExtras: 0,
        publicidad: 0,
        enviosManual: 0,
        gastosOperativos: 0,
        rentabilidadPesos: 0,
        gananciaInversionesArs: 0,
        gananciaInversionesUsd: 0,
        transferido: 0,
        transferidoMenosGastos: 0,
        inversionesArs: 0,
        inversionEmpresaArs: 0,
        inversionCypreaArs: 0,
        compraDolaresArs: 0,
        pendiente: 0,
        unidades: 0,
        sellos: 0,
        pedidos: 0,
      },
    );
  }, [monthly]);

  const yearly = useMemo<YearlyRow[]>(() => {
    const byYear = new Map<string, YearlyRow>();
    for (const r of monthly) {
      const year = r.key.slice(0, 4);
      const row =
        byYear.get(year) ||
        ({
          year,
          ventasBrutas: 0,
          gastosOperativos: 0,
          rentabilidadPesos: 0,
          compraDolaresArs: 0,
          inversionEmpresaArs: 0,
          inversionCypreaArs: 0,
          gananciaRealArs: 0,
          transferido: 0,
          pendiente: 0,
          sellos: 0,
          pedidos: 0,
          unidades: 0,
          meses: 0,
        } satisfies YearlyRow);
      row.ventasBrutas += r.ventasBrutas;
      row.gastosOperativos += totalGastosOperativos(r);
      row.rentabilidadPesos += r.rentabilidadPesos;
      row.compraDolaresArs += r.compraDolaresArs;
      row.inversionEmpresaArs += r.inversionEmpresaArs;
      row.inversionCypreaArs += r.inversionCypreaArs;
      row.transferido += r.transferido;
      row.pendiente += r.pendiente;
      row.sellos += r.sellos;
      row.pedidos += r.pedidos;
      row.unidades += r.unidades;
      row.meses += 1;
      byYear.set(year, row);
    }

    return Array.from(byYear.values())
      .map((row) => ({
        ...row,
        gananciaRealArs:
          row.compraDolaresArs + row.inversionEmpresaArs + row.inversionCypreaArs,
      }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [monthly]);

  const currentYearKey = currentArgentinaMonthKey().slice(0, 4);

  const currentMonthKey = currentArgentinaMonthKey();
  const currentMonth = useMemo(
    () => monthly.find((m) => m.key === currentMonthKey) ?? null,
    [monthly, currentMonthKey],
  );
  const previousMonth = useMemo(() => {
    const idx = monthly.findIndex((m) => m.key === currentMonthKey);
    if (idx > 0) return monthly[idx - 1];
    // Si el mes actual aún no tiene ventas, comparar con el último mes con datos
    if (idx < 0 && monthly.length > 0) return monthly[monthly.length - 1];
    return null;
  }, [monthly, currentMonthKey]);

  const momSellosPct = useMemo(() => {
    if (!currentMonth || !previousMonth || previousMonth.sellos <= 0) return null;
    return ((currentMonth.sellos - previousMonth.sellos) / previousMonth.sellos) * 100;
  }, [currentMonth, previousMonth]);

  const momVentasPct = useMemo(() => {
    if (!currentMonth || !previousMonth || previousMonth.ventasBrutas <= 0) return null;
    return ((currentMonth.ventasBrutas - previousMonth.ventasBrutas) / previousMonth.ventasBrutas) * 100;
  }, [currentMonth, previousMonth]);

  const productBreakdown = useMemo(() => {
    const itemsByMonth: Array<{ monthKey: string; item: OrderItem }> = [];
    for (const order of orders) {
      const monthKey = orderBusinessMonthKey(order);
      for (const item of order.items) {
        itemsByMonth.push({ monthKey, item });
      }
    }
    const monthShell = monthly.map((m) => ({ key: m.key, label: m.label }));
    for (const { monthKey } of itemsByMonth) {
      if (!monthShell.some((m) => m.key === monthKey)) {
        monthShell.push({ key: monthKey, label: monthKeyLabel(monthKey) });
      }
    }
    monthShell.sort((a, b) => a.key.localeCompare(b.key));
    return buildMonthlyProductBreakdown(monthShell, itemsByMonth);
  }, [orders, monthly]);

  const productKeysActive = useMemo(() => activeProductKeys(productBreakdown), [productBreakdown]);

  const productTotals = useMemo(
    () =>
      productKeysActive.map((key) => {
        const sum = sumProductAcrossMonths(productBreakdown, key);
        const meta = economiaProductoMeta(key);
        return { key, meta, ...sum };
      }),
    [productBreakdown, productKeysActive],
  );

  const currentProductRow = useMemo(
    () => productBreakdown.find((r) => r.key === currentMonthKey) ?? null,
    [productBreakdown, currentMonthKey],
  );

  const previousProductRow = useMemo(() => {
    const idx = productBreakdown.findIndex((r) => r.key === currentMonthKey);
    if (idx > 0) return productBreakdown[idx - 1];
    if (idx < 0 && productBreakdown.length > 0) return productBreakdown[productBreakdown.length - 1];
    return null;
  }, [productBreakdown, currentMonthKey]);

  const formatDesgloseMetric = (n: number) => {
    if (desgloseMetric === 'unidades') return String(Math.round(n));
    return formatArs(n);
  };

  const stackedBarRows = useMemo(
    () =>
      productBreakdown.map((r) => ({
        key: r.key,
        label: r.label,
        values: Object.fromEntries(
          productKeysActive.map((k) => [k, cellMetric(r.byProduct[k], desgloseMetric)]),
        ) as Record<string, number>,
      })),
    [productBreakdown, productKeysActive, desgloseMetric],
  );

  const stackedBarKeys = useMemo(
    () =>
      productKeysActive.map((k) => {
        const meta = economiaProductoMeta(k);
        return { key: k, color: meta.color, label: meta.shortLabel };
      }),
    [productKeysActive],
  );

  const totalProductUnidades = useMemo(
    () => productTotals.reduce((s, p) => s + p.unidades, 0),
    [productTotals],
  );

  const totalCajaArs = useMemo(
    () =>
      cajaBalances.efectivo +
      cajaBalances.mercadopago +
      cajaBalances.santanderCatalina +
      cajaBalances.santanderJulian +
      cajaBalances.bbva,
    [cajaBalances],
  );

  const ticketPromedio = totals.pedidos > 0 ? totals.ventasBrutas / totals.pedidos : 0;
  const unidadesPromedio = totals.pedidos > 0 ? totals.unidades / totals.pedidos : 0;
  const realSummary = useMemo(() => {
    const byType = {
      USD_PURCHASE: 0,
      INV_EMPRESA: 0,
      INV_CYPREA: 0,
    } satisfies Record<RealMovementType, number>;
    let usdPurchased = 0;
    for (const m of realMovements) {
      byType[m.type] += Number(m.amountArs || 0);
      if (m.type === 'USD_PURCHASE') usdPurchased += Number(m.amountUsd || 0);
    }
    const totalAdjustmentsArs = byType.USD_PURCHASE + byType.INV_EMPRESA + byType.INV_CYPREA;
    const gananciaRealArs = totals.rentabilidadPesos - totalAdjustmentsArs;
    const gananciaRealUsd = usdRate > 0 ? gananciaRealArs / usdRate : 0;
    return {
      byType,
      usdPurchased,
      totalAdjustmentsArs,
      gananciaRealArs,
      gananciaRealUsd,
    };
  }, [realMovements, totals.rentabilidadPesos, usdRate]);
  const pendingBreakdown = useMemo(() => {
    const byState = {
      DEUDOR: { amount: 0, count: 0 },
      FOTO_ENVIADA: { amount: 0, count: 0 },
      SEÑADO: { amount: 0, count: 0 },
    };

    for (const order of orders) {
      for (const item of order.items) {
        if (item.saleState === 'TRANSFERIDO') continue;
        const key = item.saleState === 'DEUDOR' ? 'DEUDOR' : item.saleState === 'FOTO_ENVIADA' ? 'FOTO_ENVIADA' : 'SEÑADO';
        byState[key].amount += Number(item.itemValue || 0);
        byState[key].count += 1;
      }
    }

    return byState;
  }, [orders]);
  const pendingSlices = useMemo(
    () => [
      { key: 'DEUDOR', label: 'Deudor', amount: pendingBreakdown.DEUDOR.amount, color: 'hsl(var(--destructive))' },
      {
        key: 'FOTO_ENVIADA',
        label: 'Foto enviada',
        amount: pendingBreakdown.FOTO_ENVIADA.amount,
        color: 'hsl(var(--primary))',
      },
      { key: 'SEÑADO', label: 'Señado', amount: pendingBreakdown.SEÑADO.amount, color: 'hsl(var(--ring))' },
    ],
    [pendingBreakdown],
  );

  if (authLoading || (!gastosMensualesReady && !gastosMensualesError) || ((loading || loadingFullCatalog) && !fullCatalogLoaded)) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  if (gastosMensualesError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          No se pudieron cargar los gastos mensuales: {gastosMensualesError}
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => {
            if (!user?.id) return;
            setGastosMensualesError(null);
            setGastosMensualesReady(false);
            void loadGastosMensualesIntoCache(user.id)
              .then(() => {
                setGastosStorageTick((t) => t + 1);
                setGastosMensualesReady(true);
              })
              .catch((e) => {
                setGastosMensualesError(e instanceof Error ? e.message : String(e));
              });
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Sin catálogo full, useOrders cae a los últimos 6 meses y el P&L queda truncado.
  if (!fullCatalogLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          No se pudo cargar el historial completo de pedidos
          {ordersError?.message ? `: ${ordersError.message}` : '.'}
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => {
            void reloadFullCatalog();
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const usdPurchaseArs = usdAmount * usdBuyRate;
  const addMovement = async (movement: {
    date: string;
    type: RealMovementType;
    amountArs: number;
    amountUsd?: number;
    rate?: number;
  }) => {
    try {
      await createEconomiaMovimientoReal(movement);
      const rows = await fetchEconomiaMovimientosReales();
      setRealMovements(rows);
    } catch (error) {
      toast({
        title: 'No se pudo guardar el movimiento',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };
  const removeMovement = async (id: string) => {
    try {
      await deleteEconomiaMovimientoReal(id);
      setRealMovements((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      toast({
        title: 'No se pudo eliminar el movimiento',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <AppMain className="flex min-h-screen flex-col">
        <div className="w-full max-w-[1920px] flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">Economía</h1>
                <Badge variant="secondary" className="font-normal">
                  Solo dueño
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Ventas, costos y márgenes · meses en hora Argentina · fijos/extras en{' '}
                <span className="font-medium text-foreground">Gastos</span>
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36 space-y-1">
                <Label htmlFor="usd-rate" className="text-[11px] text-muted-foreground">
                  Dólar referencia
                </Label>
                <Input
                  id="usd-rate"
                  type="number"
                  className="h-9 tabular-nums"
                  value={usdRate}
                  disabled={economiaSettingsLoading}
                  onChange={(e) => setUsdRate(Number(e.target.value || 1))}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setShowMetodologia((v) => !v)}
                aria-expanded={showMetodologia}
              >
                <HelpCircle className="size-3.5" aria-hidden />
                Cómo se calcula
                <ChevronDown
                  className={cn('size-3.5 transition-transform', showMetodologia && 'rotate-180')}
                  aria-hidden
                />
              </Button>
            </div>
          </header>

          {showMetodologia ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">Ventas brutas</strong>: total del pedido + envío imputado solo cuando
                todos los ítems están Despachado o Seguimiento enviado (tabla de costos o{' '}
                {formatArs(ECONOMIA_ENVIO_SIN_TIPO_ARS)} si no hay método).{' '}
                <strong className="text-foreground">Costos ventas</strong>: solo fabricación (meses en detalle).{' '}
                <strong className="text-foreground">Envíos</strong> en el P&amp;L: monto manual de Gastos.{' '}
                <strong className="text-foreground">Transferido</strong>: cobrado en Transferido + mismo envío imputado.{' '}
                <strong className="text-foreground">Rentabilidad (detalle)</strong> = ventas − fijos − costos ventas −
                extras − publicidad − envíos. <strong className="text-foreground">Rentabilidad (resumen)</strong> = ventas −
                gastos reales del mes. <strong className="text-foreground">Ganancia</strong> = inversión empresa + compra
                dólares (Gastos, mismo mes).
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiShell>
              <div className="flex items-start justify-between gap-2">
                <KpiLabel>Mes actual · {monthKeyLabelLong(currentMonthKey)}</KpiLabel>
              </div>
              <KpiValue>{currentMonth?.sellos ?? 0} sellos</KpiValue>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatArs(currentMonth?.ventasBrutas ?? 0)}
                </span>
                <MomChip value={momSellosPct} label="sellos" />
                <MomChip value={momVentasPct} label="ventas" />
              </div>
            </KpiShell>

            <KpiShell>
              <KpiLabel>Ventas brutas (todo)</KpiLabel>
              <KpiValue>{formatArs(totals.ventasBrutas)}</KpiValue>
              <KpiHint>
                {totals.sellos} sellos · {totals.pedidos} pedidos
              </KpiHint>
            </KpiShell>

            <KpiShell>
              <KpiLabel>Rentabilidad total</KpiLabel>
              <KpiValue>{formatArs(totals.rentabilidadPesos)}</KpiValue>
              <KpiHint>Tras ajustes: {formatArs(realSummary.gananciaRealArs)}</KpiHint>
            </KpiShell>

            <Dialog>
              <DialogTrigger asChild>
                <KpiShell interactive>
                  <div className="flex items-start justify-between gap-2">
                    <KpiLabel>Rentabilidad USD</KpiLabel>
                    <CircleDollarSign className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <KpiValue>{formatUsd(totals.rentabilidadPesos / (usdRate || 1))}</KpiValue>
                  <KpiHint>
                    Tras ajustes: {formatUsd(realSummary.gananciaRealUsd)} · editar ajustes
                  </KpiHint>
                </KpiShell>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Rentabilidad tras ajustes</DialogTitle>
                  <DialogDescription>
                    Registrá compras de USD e inversiones para ver la rentabilidad después de esos movimientos.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Teórica</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">{formatArs(totals.rentabilidadPesos)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ajustes</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">
                      {formatArs(realSummary.totalAdjustmentsArs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Real</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">{formatArs(realSummary.gananciaRealArs)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatUsd(realSummary.gananciaRealUsd)}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="mov-date-shared">Fecha del movimiento</Label>
                  <Input
                    id="mov-date-shared"
                    type="date"
                    className="max-w-xs"
                    value={movementDate}
                    onChange={(e) => setMovementDate(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border/60 p-3">
                    <h4 className="text-sm font-semibold">Compra de USD (ahorro)</h4>
                    <div className="space-y-2">
                      <Label htmlFor="mov-usd-amount">USD comprados</Label>
                      <Input
                        id="mov-usd-amount"
                        type="number"
                        value={usdAmount}
                        onChange={(e) => setUsdAmount(Number(e.target.value || 0))}
                      />
                      <Label htmlFor="mov-usd-rate">Precio por USD (ARS)</Label>
                      <Input
                        id="mov-usd-rate"
                        type="number"
                        value={usdBuyRate}
                        onChange={(e) => setUsdBuyRate(Number(e.target.value || 0))}
                      />
                      <p className="text-xs text-muted-foreground">Impacto: {formatArs(usdPurchaseArs)}</p>
                      <Button
                        disabled={movementsLoading}
                        onClick={() => {
                          if (!movementDate || usdAmount <= 0 || usdBuyRate <= 0) return;
                          void addMovement({
                            date: movementDate,
                            type: 'USD_PURCHASE',
                            amountUsd: usdAmount,
                            rate: usdBuyRate,
                            amountArs: usdPurchaseArs,
                          });
                          setUsdAmount(0);
                        }}
                      >
                        {movementsLoading ? 'Guardando...' : 'Agregar compra USD'}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border/60 p-3">
                    <h4 className="text-sm font-semibold">Inversiones</h4>
                    <div className="space-y-2">
                      <Label htmlFor="mov-inv-empresa">Inversión empresa (ARS)</Label>
                      <Input
                        id="mov-inv-empresa"
                        type="number"
                        value={invEmpresaArs}
                        onChange={(e) => setInvEmpresaArs(Number(e.target.value || 0))}
                      />
                      <Button
                        variant="outline"
                        disabled={movementsLoading}
                        onClick={() => {
                          if (!movementDate || invEmpresaArs <= 0) return;
                          void addMovement({
                            date: movementDate,
                            type: 'INV_EMPRESA',
                            amountArs: invEmpresaArs,
                          });
                          setInvEmpresaArs(0);
                        }}
                      >
                        {movementsLoading ? 'Guardando...' : 'Agregar inversión empresa'}
                      </Button>
                      <Label htmlFor="mov-inv-cyprea">Inversión Cyprea (ARS)</Label>
                      <Input
                        id="mov-inv-cyprea"
                        type="number"
                        value={invCypreaArs}
                        onChange={(e) => setInvCypreaArs(Number(e.target.value || 0))}
                      />
                      <Button
                        variant="outline"
                        disabled={movementsLoading}
                        onClick={() => {
                          if (!movementDate || invCypreaArs <= 0) return;
                          void addMovement({
                            date: movementDate,
                            type: 'INV_CYPREA',
                            amountArs: invCypreaArs,
                          });
                          setInvCypreaArs(0);
                        }}
                      >
                        {movementsLoading ? 'Guardando...' : 'Agregar inversión Cyprea'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60">
                  <div className="border-b border-border/50 px-3 py-2">
                    <p className="text-sm font-semibold">Movimientos cargados</p>
                    <p className="text-[11px] text-muted-foreground">
                      USD acumulados: {realSummary.usdPurchased.toFixed(2)} · Ahorro en pesos:{' '}
                      {formatArs(realSummary.byType.USD_PURCHASE)}
                    </p>
                  </div>
                  <div className="max-h-64 space-y-0 overflow-auto">
                    {movementsLoading ? (
                      <p className="p-3 text-sm text-muted-foreground">Cargando movimientos...</p>
                    ) : realMovements.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Todavía no hay movimientos cargados.</p>
                    ) : (
                      realMovements.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-sm last:border-0 hover:bg-muted/30"
                        >
                          <div className="min-w-0 flex flex-col">
                            <span className="font-medium">{movementTypeLabel(m.type)}</span>
                            <span className="text-xs text-muted-foreground">
                              {m.date}
                              {m.type === 'USD_PURCHASE'
                                ? ` · ${m.amountUsd?.toFixed(2)} USD a ${formatArs(m.rate || 0)}`
                                : ''}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="font-semibold tabular-nums">{formatArs(m.amountArs)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={movementsLoading}
                              onClick={() => void removeMovement(m.id)}
                            >
                              Quitar
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <KpiShell interactive>
                  <div className="flex items-start justify-between gap-2">
                    <KpiLabel>Pendiente de cobro</KpiLabel>
                    <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <KpiValue>{formatArs(totals.pendiente)}</KpiValue>
                  <KpiHint>Ver desglose por estado</KpiHint>
                </KpiShell>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Desglose pendiente de cobro</DialogTitle>
                  <DialogDescription>Detalle por estado de venta pendiente.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <PendingPieChart data={pendingSlices} />
                  <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                    {(['DEUDOR', 'FOTO_ENVIADA', 'SEÑADO'] as const).map((state) => {
                      const total = pendingSlices.reduce((acc, x) => acc + x.amount, 0);
                      const pct = total > 0 ? (pendingBreakdown[state].amount / total) * 100 : 0;
                      return (
                        <div key={state} className="flex items-center justify-between gap-3 bg-card px-3 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{pendingLabel(state)}</p>
                            <p className="text-xs text-muted-foreground">
                              {pendingBreakdown[state].count} ítems · {pct.toFixed(1)}%
                            </p>
                          </div>
                          <p className="text-base font-semibold tabular-nums">
                            {formatArs(pendingBreakdown[state].amount)}
                          </p>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between bg-muted/30 px-3 py-3">
                      <p className="text-sm font-medium">Total pendiente</p>
                      <p className="text-base font-semibold tabular-nums">{formatArs(totals.pendiente)}</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <KpiShell interactive>
                  <div className="flex items-start justify-between gap-2">
                    <KpiLabel>Flujo / caja</KpiLabel>
                    <Banknote className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <KpiValue>{economiaSettingsLoading ? '…' : formatArs(totalCajaArs)}</KpiValue>
                  <KpiHint>Cargar montos (Supabase)</KpiHint>
                </KpiShell>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Flujo / caja</DialogTitle>
                  <DialogDescription>
                    Montos en pesos por canal. Se guardan automáticamente en la base de datos.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  {(
                    [
                      { key: 'efectivo' as const, label: 'Dinero en efectivo', id: 'caja-efectivo' },
                      { key: 'mercadopago' as const, label: 'Dinero Mercadopago', id: 'caja-mp' },
                      { key: 'santanderCatalina' as const, label: 'Dinero Santander Catalina', id: 'caja-sant-cat' },
                      { key: 'santanderJulian' as const, label: 'Dinero Santander Julian', id: 'caja-sant-jul' },
                      { key: 'bbva' as const, label: 'Dinero BBVA', id: 'caja-bbva' },
                    ] as const
                  ).map(({ key, label, id }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <Label htmlFor={id}>{label}</Label>
                      <Input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        className="tabular-nums"
                        disabled={economiaSettingsLoading}
                        value={cajaBalances[key]}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setCajaBalances((prev) => ({
                            ...prev,
                            [key]: Number.isFinite(n) ? n : 0,
                          }));
                        }}
                      />
                    </div>
                  ))}
                  <div className="sticky bottom-0 flex items-center justify-between border-t bg-background pt-3 text-sm">
                    <span className="font-medium text-foreground">Total</span>
                    <span className="text-lg font-semibold tabular-nums">{formatArs(totalCajaArs)}</span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="ventas" className="space-y-4">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 sm:min-w-0">
                <TabsTrigger value="ventas">Volumen</TabsTrigger>
                <TabsTrigger value="desglose">Por producto</TabsTrigger>
                <TabsTrigger value="mensual">P&amp;L mensual</TabsTrigger>
                <TabsTrigger value="mix">Mix</TabsTrigger>
                <TabsTrigger value="tendencias">Por año</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="ventas">
              <div className="flex flex-col gap-3">
                {yearly.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {yearly.map((y, i) => {
                      const prev = i > 0 ? yearly[i - 1] : null;
                      const deltaReal =
                        prev && prev.gananciaRealArs !== 0
                          ? ((y.gananciaRealArs - prev.gananciaRealArs) / Math.abs(prev.gananciaRealArs)) * 100
                          : null;
                      const inversionesArs = y.inversionEmpresaArs + y.inversionCypreaArs;
                      const isCurrent = y.year === currentYearKey;
                      return (
                        <div
                          key={y.year}
                          className={`rounded-lg border px-4 py-3 ${
                            isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-card'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{y.year}</p>
                            <div className="flex items-center gap-2">
                              <MomChip value={deltaReal} />
                              <span className="text-[11px] text-muted-foreground">{y.meses} meses</span>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[11px] text-muted-foreground">Teórica</p>
                              <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                                {formatArs(y.rentabilidadPesos)}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">ventas − gastos</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-muted-foreground">Ganancia real</p>
                              <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                                {formatArs(y.gananciaRealArs)}
                              </p>
                              <div className="mt-1.5 space-y-0.5 text-[11px] tabular-nums">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-muted-foreground">Dólares</span>
                                  <span className="font-medium text-foreground">
                                    {formatCompactArs(y.compraDolaresArs)}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-muted-foreground">Inversiones</span>
                                  <span className="font-medium text-foreground">
                                    {formatCompactArs(inversionesArs)}
                                  </span>
                                </div>
                                {(y.inversionEmpresaArs > 0 || y.inversionCypreaArs > 0) && (
                                  <p className="pt-0.5 text-[10px] leading-snug text-muted-foreground">
                                    {[
                                      y.inversionEmpresaArs > 0
                                        ? `Empresa ${formatCompactArs(y.inversionEmpresaArs)}`
                                        : null,
                                      y.inversionCypreaArs > 0
                                        ? `Cyprea ${formatCompactArs(y.inversionCypreaArs)}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
                      <CardTitle className="text-base">Sellos por mes</CardTitle>
                      <CardDescription className="text-xs">
                        Pasá el mouse sobre una barra para el detalle. Si hay muchos meses, scrolleá de lado.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <MonthlyBarChart
                        rows={monthly.map((m) => ({ key: m.key, label: m.label, value: m.sellos }))}
                        valueKey="sellos"
                        highlightKey={currentMonthKey}
                      />
                    </CardContent>
                  </Card>
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
                      <CardTitle className="text-base">Ventas brutas por mes</CardTitle>
                      <CardDescription className="text-xs">
                        Pedido + envío imputado cuando corresponde.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <MonthlyBarChart
                        rows={monthly.map((m) => ({ key: m.key, label: m.label, value: m.ventasBrutas }))}
                        highlightKey={currentMonthKey}
                        formatValue={formatCompactArs}
                      />
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/70 shadow-sm">
                  <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
                    <CardTitle className="text-base">Detalle mes a mes</CardTitle>
                    <CardDescription className="text-xs">
                      Volumen, pedidos, ticket y rentabilidad. Acá está el número exacto de cada mes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[min(28rem,55vh)] overflow-auto p-0">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2.5 pl-4 pr-3">Mes</th>
                          <th className="py-2.5 pr-3 text-right">Sellos</th>
                          <th className="py-2.5 pr-3 text-right">Pedidos</th>
                          <th className="py-2.5 pr-3 text-right">Unidades</th>
                          <th className="py-2.5 pr-3 text-right">Ventas</th>
                          <th className="py-2.5 pr-3 text-right">Ticket prom.</th>
                          <th className="py-2.5 pr-3 text-right">Rentabilidad</th>
                          <th className="py-2.5 pr-4 text-right">vs mes ant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.map((r, i) => {
                          const prev = i > 0 ? monthly[i - 1] : null;
                          const delta =
                            prev && prev.sellos > 0
                              ? ((r.sellos - prev.sellos) / prev.sellos) * 100
                              : null;
                          const ticket = r.pedidos > 0 ? r.ventasBrutas / r.pedidos : 0;
                          const isCurrent = r.key === currentMonthKey;
                          return (
                            <tr key={r.key} className={economiaTableRowClass(isCurrent)}>
                              <td className={economiaStickyCellClass()}>
                                <div className="flex items-center gap-2">
                                  <Badge variant={isCurrent ? 'default' : 'outline'}>{r.label}</Badge>
                                  {isCurrent ? (
                                    <span className="text-[10px] text-muted-foreground">actual</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-right font-semibold tabular-nums">{r.sellos}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{r.pedidos}</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{r.unidades}</td>
                              <td className="py-2 pr-3 text-right font-medium tabular-nums">
                                {formatArs(r.ventasBrutas)}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">{formatArs(ticket)}</td>
                              <td className="py-2 pr-3 text-right font-medium tabular-nums">
                                {formatArs(r.rentabilidadPesos)}
                              </td>
                              <td
                                className={`py-2 pr-4 text-right tabular-nums ${
                                  delta == null
                                    ? 'text-muted-foreground'
                                    : delta >= 0
                                      ? 'text-emerald-600'
                                      : 'text-red-600'
                                }`}
                              >
                                {formatPct(delta)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="sticky bottom-0 border-t-2 border-border bg-muted/90 font-semibold backdrop-blur-sm">
                          <td className="py-2 pl-4 pr-3">Total</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{totals.sellos}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{totals.pedidos}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{totals.unidades}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(totals.ventasBrutas)}</td>
                          <td className="py-2 pr-3 text-right">
                            {formatArs(totals.pedidos > 0 ? totals.ventasBrutas / totals.pedidos : 0)}
                          </td>
                          <td className="py-2 pr-3 text-right">{formatArs(totals.rentabilidadPesos)}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="desglose">
              <div className="flex flex-col gap-3">
                <Card className="border-border/70 shadow-sm">
                  <CardHeader className="flex flex-col gap-3 border-b border-border/50 bg-muted/15 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">Por producto</CardTitle>
                      <CardDescription className="text-xs">
                        Misma clasificación que Precios · unidades, ventas o margen.
                      </CardDescription>
                    </div>
                    <div className="inline-flex rounded-md border border-border/60 bg-background p-0.5">
                      {(
                        [
                          { id: 'unidades' as const, label: 'Unidades' },
                          { id: 'ventas' as const, label: 'Ventas $' },
                          { id: 'margen' as const, label: 'Margen $' },
                        ] as const
                      ).map((opt) => (
                        <Button
                          key={opt.id}
                          type="button"
                          size="sm"
                          variant={desgloseMetric === opt.id ? 'default' : 'ghost'}
                          className="h-7 px-2.5 text-xs"
                          onClick={() => setDesgloseMetric(opt.id)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <StackedMonthlyBars
                      rows={stackedBarRows}
                      keys={stackedBarKeys}
                      mode={desgloseMetric}
                      highlightKey={currentMonthKey}
                      formatValue={formatDesgloseMetric}
                    />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">
                        Mix del mes · {monthKeyLabelLong(currentMonthKey)}
                      </CardTitle>
                      <CardDescription>
                        Participación por categoría en el mes actual
                        {previousProductRow ? ` (vs ${previousProductRow.label})` : ''}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {productKeysActive.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
                      ) : (
                        productKeysActive.map((key) => {
                          const meta = economiaProductoMeta(key);
                          const cur = currentProductRow?.byProduct[key];
                          const prev = previousProductRow?.byProduct[key];
                          const curVal = cur ? cellMetric(cur, desgloseMetric) : 0;
                          const prevVal = prev ? cellMetric(prev, desgloseMetric) : 0;
                          const monthTotal = currentProductRow
                            ? desgloseMetric === 'unidades'
                              ? currentProductRow.totalUnidades
                              : desgloseMetric === 'ventas'
                                ? currentProductRow.totalVentas
                                : currentProductRow.totalMargen
                            : 0;
                          const pct = monthTotal > 0 ? (curVal / monthTotal) * 100 : 0;
                          const delta =
                            prevVal > 0 ? ((curVal - prevVal) / prevVal) * 100 : curVal > 0 ? null : null;
                          return (
                            <div key={key} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                                  <span>{meta.label}</span>
                                </div>
                                <div className="flex items-center gap-3 tabular-nums">
                                  <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                                  <span className="font-medium">{formatDesgloseMetric(curVal)}</span>
                                  <span
                                    className={`w-12 text-right text-xs ${
                                      delta == null
                                        ? 'text-muted-foreground'
                                        : delta >= 0
                                          ? 'text-emerald-600'
                                          : 'text-red-600'
                                    }`}
                                  >
                                    {delta == null ? (prevVal === 0 && curVal > 0 ? 'nuevo' : '—') : formatPct(delta)}
                                  </span>
                                </div>
                              </div>
                              <div className="h-1.5 rounded bg-muted">
                                <div
                                  className="h-1.5 rounded"
                                  style={{ width: `${pct}%`, backgroundColor: meta.color }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Totales del período</CardTitle>
                      <CardDescription>Suma de todos los meses cargados.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {productTotals
                        .slice()
                        .sort((a, b) => b.unidades - a.unidades)
                        .map((p) => {
                          const share =
                            totalProductUnidades > 0 ? (p.unidades / totalProductUnidades) * 100 : 0;
                          return (
                            <div key={p.key} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="size-2.5 rounded-sm" style={{ backgroundColor: p.meta.color }} />
                                <span>{p.meta.shortLabel}</span>
                              </div>
                              <div className="text-right tabular-nums">
                                <span className="font-medium">{p.unidades}</span>
                                <span className="ml-2 text-xs text-muted-foreground">{share.toFixed(0)}%</span>
                              </div>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tabla mes × producto</CardTitle>
                    <CardDescription>
                      Cada celda muestra {desgloseMetric === 'unidades' ? 'unidades' : desgloseMetric === 'ventas' ? 'ventas' : 'margen de fabricación'}.
                      Solo aparecen categorías con al menos una venta.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="sticky left-0 z-10 bg-background py-2 pr-3">Mes</th>
                          {productKeysActive.map((key) => {
                            const meta = economiaProductoMeta(key);
                            return (
                              <th key={key} className="py-2 px-2 text-right" title={meta.label}>
                                <div className="flex flex-col items-end gap-0.5">
                                  <span
                                    className="size-2 rounded-sm"
                                    style={{ backgroundColor: meta.color }}
                                  />
                                  <span className="text-xs">{meta.shortLabel}</span>
                                </div>
                              </th>
                            );
                          })}
                          <th className="py-2 pl-2 text-right font-medium text-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productBreakdown.map((r) => {
                          const isCurrent = r.key === currentMonthKey;
                          const rowTotal =
                            desgloseMetric === 'unidades'
                              ? r.totalUnidades
                              : desgloseMetric === 'ventas'
                                ? r.totalVentas
                                : r.totalMargen;
                          return (
                            <tr key={r.key} className={economiaTableRowClass(isCurrent)}>
                              <td className={economiaStickyCellClass()}>
                                <Badge variant={isCurrent ? 'default' : 'outline'}>{r.label}</Badge>
                              </td>
                              {productKeysActive.map((key) => {
                                const v = cellMetric(r.byProduct[key], desgloseMetric);
                                return (
                                  <td
                                    key={key}
                                    className={`py-2 px-2 text-right tabular-nums ${
                                      v === 0 ? 'text-muted-foreground/50' : ''
                                    }`}
                                  >
                                    {v === 0 ? '—' : formatDesgloseMetric(v)}
                                  </td>
                                );
                              })}
                              <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                                {formatDesgloseMetric(rowTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                          <td className="sticky left-0 z-10 bg-muted/40 py-2 pr-3">Total</td>
                          {productKeysActive.map((key) => {
                            const sum = sumProductAcrossMonths(productBreakdown, key);
                            return (
                              <td key={key} className="py-2 px-2 text-right tabular-nums">
                                {formatDesgloseMetric(cellMetric(sum, desgloseMetric))}
                              </td>
                            );
                          })}
                          <td className="py-2 pl-2 text-right tabular-nums">
                            {formatDesgloseMetric(
                              desgloseMetric === 'unidades'
                                ? productBreakdown.reduce((s, r) => s + r.totalUnidades, 0)
                                : desgloseMetric === 'ventas'
                                  ? productBreakdown.reduce((s, r) => s + r.totalVentas, 0)
                                  : productBreakdown.reduce((s, r) => s + r.totalMargen, 0),
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="mensual">
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="space-y-2 border-b border-border/50 bg-muted/15 px-4 py-3">
                  <div>
                    <CardTitle className="text-base">P&amp;L por mes</CardTitle>
                    <CardDescription className="text-xs leading-snug">
                      Ventas, gastos del mes y transferido. Tocá <span className="font-medium text-foreground">Gastos</span>{' '}
                      o <span className="font-medium text-foreground">Ganancias</span> en el encabezado para ver el
                      desglose.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="max-h-[min(32rem,60vh)] overflow-auto p-0">
                  <table className={`w-full text-sm ${mensualDetalleGastos || mensualDetalleGanancias ? 'min-w-[1400px]' : 'min-w-[960px]'}`}>
                    <thead className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="sticky left-0 z-30 bg-card/95 py-2 pl-4 pr-3 backdrop-blur-sm">Mes</th>
                        <th className="py-2 pr-3 text-right">Sellos</th>
                        <th className="py-2 pr-3 text-right">Pedidos</th>
                        <th className="py-2 pr-3 text-right">Ventas brutas</th>
                        {mensualDetalleGastos ? (
                          <>
                            <th className="py-2 pr-2 text-right">
                              <button
                                type="button"
                                onClick={() => setMensualDetalleGastos(false)}
                                className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-primary hover:bg-muted"
                                title="Clic para ocultar desglose de gastos"
                                aria-expanded
                              >
                                Gastos
                                <ChevronDown className="size-3.5 rotate-180 opacity-70" aria-hidden />
                              </button>
                              <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Costos fijos</span>
                            </th>
                            <th className="py-2 pr-2 text-right text-xs font-normal">Costos ventas</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal">Gastos extras</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal">Publicidad</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal">Envíos</th>
                          </>
                        ) : (
                          <PlToggleTh
                            expanded={false}
                            onToggle={() => setMensualDetalleGastos(true)}
                            collapsedLabel="Gastos"
                            expandedHint="desglose de gastos"
                          />
                        )}
                        <th className="py-2 pr-3 text-right">Rentabilidad</th>
                        <th className="py-2 pr-3 text-right">Transferido</th>
                        <th
                          className="py-2 pr-3 text-right"
                          title="Transferido − gasto operativo del mes"
                        >
                          Transf. − gastos
                        </th>
                        <th className="py-2 pr-3 text-right">Pendiente</th>
                        {mensualDetalleGanancias ? (
                          <>
                            <th className="py-2 pr-2 text-right">
                              <button
                                type="button"
                                onClick={() => setMensualDetalleGanancias(false)}
                                className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-primary hover:bg-muted"
                                title="Clic para ocultar desglose de ganancias"
                                aria-expanded
                              >
                                Ganancias
                                <ChevronDown className="size-3.5 rotate-180 opacity-70" aria-hidden />
                              </button>
                              <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Inv. Cyprea</span>
                            </th>
                            <th className="py-2 pr-2 text-right text-xs font-normal">Inv. empresa</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal">Compra USD</th>
                            <th className="py-2 pr-4 text-right text-xs font-normal">Ganancia USD</th>
                          </>
                        ) : (
                          <PlToggleTh
                            expanded={false}
                            onToggle={() => setMensualDetalleGanancias(true)}
                            collapsedLabel="Ganancias"
                            expandedHint="desglose de ganancias"
                          />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((r) => {
                        const isCurrent = r.key === currentMonthKey;
                        return (
                        <tr key={r.key} className={economiaTableRowClass(isCurrent)}>
                          <td className={economiaStickyCellClass()}>
                            <Badge variant={isCurrent ? 'default' : 'outline'}>{r.label}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">{r.sellos}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{r.pedidos}</td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatArs(r.ventasBrutas)}</td>
                          {mensualDetalleGastos ? (
                            <>
                              {r.fuenteResumen ? (
                                <td
                                  className="py-2 pr-2 text-right text-muted-foreground"
                                  colSpan={5}
                                  title="Mes con cierre resumen: un solo gasto real (incluye publicidad)"
                                >
                                  Resumen {formatArs(r.gastosReales)}
                                  {r.publicidad > 0 ? (
                                    <span className="ml-1 text-[10px]">(pub. {formatArs(r.publicidad)})</span>
                                  ) : null}
                                </td>
                              ) : (
                                <>
                                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.costosFijos)}</td>
                                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.costosVentas)}</td>
                                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.gastosExtras)}</td>
                                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.publicidad)}</td>
                                  <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.enviosManual)}</td>
                                </>
                              )}
                            </>
                          ) : (
                            <td className="py-2 pr-3 text-right font-medium tabular-nums">
                              <div className="flex flex-col items-end gap-0.5 leading-tight">
                                <span>{formatArs(totalGastosOperativos(r))}</span>
                                {r.fuenteResumen ? (
                                  <span className="text-[10px] font-normal text-muted-foreground">resumen</span>
                                ) : null}
                              </div>
                            </td>
                          )}
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatArs(r.rentabilidadPesos)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatArs(r.transferido)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatArs(r.transferidoMenosGastos)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatArs(r.pendiente)}</td>
                          {mensualDetalleGanancias ? (
                            <>
                              <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.inversionCypreaArs)}</td>
                              <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.inversionEmpresaArs)}</td>
                              <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">{formatArs(r.compraDolaresArs)}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{formatUsd(r.gananciaInversionesUsd)}</td>
                            </>
                          ) : (
                            <td className="py-2 pr-4 text-right">
                              <div className="flex flex-col items-end gap-0.5 leading-tight">
                                <span className="font-medium tabular-nums">{formatArs(totalGananciasGrupoArs(r))}</span>
                                <span className="text-[11px] text-muted-foreground">{formatUsd(r.gananciaInversionesUsd)}</span>
                              </div>
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                        <td className="py-2 pr-3">
                          <span className="text-foreground">Total</span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{totals.sellos}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{totals.pedidos}</td>
                        <td className="py-2 pr-3 text-right">{formatArs(totals.ventasBrutas)}</td>
                        {mensualDetalleGastos ? (
                          <>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.costosFijos)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.costosVentas)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.gastosExtras)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.publicidad)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.enviosManual)}</td>
                          </>
                        ) : (
                          <td className="py-2 pr-3 text-right">
                            {formatArs(totals.gastosOperativos)}
                          </td>
                        )}
                        <td className="py-2 pr-3 text-right">{formatArs(totals.rentabilidadPesos)}</td>
                        <td className="py-2 pr-3 text-right">{formatArs(totals.transferido)}</td>
                        <td className="py-2 pr-3 text-right">{formatArs(totals.transferidoMenosGastos)}</td>
                        <td className="py-2 pr-3 text-right">{formatArs(totals.pendiente)}</td>
                        {mensualDetalleGanancias ? (
                          <>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.inversionCypreaArs)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.inversionEmpresaArs)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(totals.compraDolaresArs)}</td>
                            <td className="py-2 pr-2 text-right text-muted-foreground">{formatUsd(totals.gananciaInversionesUsd)}</td>
                          </>
                        ) : (
                          <td className="py-2 pr-3 text-right">
                            <div className="flex flex-col items-end gap-0.5 leading-tight">
                              <span>
                                {formatArs(
                                  totals.inversionEmpresaArs +
                                    totals.inversionCypreaArs +
                                    totals.compraDolaresArs,
                                )}
                              </span>
                              <span className="text-[11px] font-normal text-muted-foreground">
                                {formatUsd(totals.gananciaInversionesUsd)}
                              </span>
                            </div>
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mix">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg">Mix acumulado por producto</CardTitle>
                    <CardDescription className="text-xs">
                      Participación en unidades y ventas en todo el período. El mes a mes está en Por producto.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {productTotals
                      .slice()
                      .sort((a, b) => b.unidades - a.unidades)
                      .map((row) => {
                        const pct = totalProductUnidades > 0 ? (row.unidades / totalProductUnidades) * 100 : 0;
                        return (
                          <div key={row.key} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="size-2.5 rounded-sm" style={{ backgroundColor: row.meta.color }} />
                                <span>{row.meta.label}</span>
                                <span className="text-muted-foreground">{row.unidades} u.</span>
                              </div>
                              <span className="font-medium">{formatArs(row.ventas)}</span>
                            </div>
                            <div className="h-2 rounded bg-muted">
                              <div
                                className="h-2 rounded"
                                style={{ width: `${pct}%`, backgroundColor: row.meta.color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-3">
                  <Card>
                    <CardHeader>
                      <CardDescription>Ticket promedio</CardDescription>
                      <CardTitle>{formatArs(ticketPromedio)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Unidades por pedido</CardDescription>
                      <CardTitle>{unidadesPromedio.toFixed(1)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Pedidos totales</CardDescription>
                      <CardTitle>{totals.pedidos}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Sellos / unidades</CardDescription>
                      <CardTitle>
                        {totals.sellos}
                        <span className="text-base font-normal text-muted-foreground"> / {totals.unidades}</span>
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tendencias">
              <div className="flex flex-col gap-3">
                <Card className="border-border/70 shadow-sm">
                  <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
                    <CardTitle className="text-base">Ganancia por año</CardTitle>
                    <CardDescription className="text-xs">
                      <strong className="font-medium text-foreground">Teórica</strong> = ventas − gastos.{' '}
                      <strong className="font-medium text-foreground">Ganancia real</strong> = dólares + inversiones.
                      Margen, ticket y ritmo mensual dan contexto al total.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-auto p-0">
                    <table className="w-full min-w-[1180px] text-sm">
                      <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pl-4 pr-3">Año</th>
                          <th className="py-2 pr-3 text-right">Sellos</th>
                          <th className="py-2 pr-3 text-right">Ticket</th>
                          <th className="py-2 pr-3 text-right">Ventas</th>
                          <th
                            className="py-2 pr-3 text-right"
                            title="Teórica ÷ ventas"
                          >
                            Margen
                          </th>
                          <th className="py-2 pr-3 text-right">Teórica</th>
                          <th className="py-2 pr-2 text-right text-xs font-normal">Compra USD</th>
                          <th className="py-2 pr-2 text-right text-xs font-normal">Inversiones</th>
                          <th className="py-2 pr-3 text-right font-medium text-foreground">Ganancia real</th>
                          <th
                            className="py-2 pr-3 text-right"
                            title="Ganancia real ÷ meses del año"
                          >
                            Real / mes
                          </th>
                          <th
                            className="py-2 pr-3 text-right"
                            title="Ganancia real ÷ ventas"
                          >
                            Real / ventas
                          </th>
                          <th className="py-2 pr-4 text-right">vs año ant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearly.map((y, i) => {
                          const prev = i > 0 ? yearly[i - 1] : null;
                          const deltaReal =
                            prev && prev.gananciaRealArs !== 0
                              ? ((y.gananciaRealArs - prev.gananciaRealArs) / Math.abs(prev.gananciaRealArs)) * 100
                              : null;
                          const deltaVentas =
                            prev && prev.ventasBrutas > 0
                              ? ((y.ventasBrutas - prev.ventasBrutas) / prev.ventasBrutas) * 100
                              : null;
                          const ticket = y.pedidos > 0 ? y.ventasBrutas / y.pedidos : 0;
                          const margen =
                            y.ventasBrutas > 0 ? (y.rentabilidadPesos / y.ventasBrutas) * 100 : null;
                          const realSobreVentas =
                            y.ventasBrutas > 0 ? (y.gananciaRealArs / y.ventasBrutas) * 100 : null;
                          const realPorMes = y.meses > 0 ? y.gananciaRealArs / y.meses : 0;
                          const inversiones = y.inversionEmpresaArs + y.inversionCypreaArs;
                          const isCurrent = y.year === currentYearKey;
                          return (
                            <tr key={y.year} className={economiaTableRowClass(isCurrent)}>
                              <td className={economiaStickyCellClass()}>
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant={isCurrent ? 'default' : 'outline'} className="w-fit">
                                    {y.year}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">{y.meses} meses</span>
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-right font-medium tabular-nums">{y.sellos}</td>
                              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                                {ticket > 0 ? formatArs(ticket) : '—'}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                <div className="flex flex-col items-end gap-0.5 leading-tight">
                                  <span className="font-medium">{formatArs(y.ventasBrutas)}</span>
                                  {deltaVentas != null ? (
                                    <span
                                      className={`text-[10px] ${
                                        deltaVentas >= 0 ? 'text-emerald-600' : 'text-red-600'
                                      }`}
                                    >
                                      {formatPct(deltaVentas)} vs ant.
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                                {margen == null ? '—' : `${margen.toFixed(0)}%`}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">{formatArs(y.rentabilidadPesos)}</td>
                              <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                                {y.compraDolaresArs > 0 ? formatArs(y.compraDolaresArs) : '—'}
                              </td>
                              <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                                {inversiones > 0 ? (
                                  <div className="flex flex-col items-end gap-0.5 leading-tight">
                                    <span>{formatArs(inversiones)}</span>
                                    <span className="text-[10px] font-normal">
                                      {[
                                        y.inversionEmpresaArs > 0
                                          ? `Emp. ${formatCompactArs(y.inversionEmpresaArs)}`
                                          : null,
                                        y.inversionCypreaArs > 0
                                          ? `Cyp. ${formatCompactArs(y.inversionCypreaArs)}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </span>
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                                {formatArs(y.gananciaRealArs)}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                                {formatArs(realPorMes)}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                                {realSobreVentas == null ? '—' : `${realSobreVentas.toFixed(0)}%`}
                              </td>
                              <td
                                className={`py-2 pr-4 text-right tabular-nums ${
                                  deltaReal == null
                                    ? 'text-muted-foreground'
                                    : deltaReal >= 0
                                      ? 'text-emerald-600'
                                      : 'text-red-600'
                                }`}
                              >
                                {formatPct(deltaReal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const invTotal = totals.inversionEmpresaArs + totals.inversionCypreaArs;
                          const realTotal =
                            totals.compraDolaresArs + totals.inversionEmpresaArs + totals.inversionCypreaArs;
                          const margenTotal =
                            totals.ventasBrutas > 0
                              ? (totals.rentabilidadPesos / totals.ventasBrutas) * 100
                              : null;
                          const realPct =
                            totals.ventasBrutas > 0 ? (realTotal / totals.ventasBrutas) * 100 : null;
                          return (
                            <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                              <td className="py-2 pl-4 pr-3">Total</td>
                              <td className="py-2 pr-3 text-right tabular-nums">{totals.sellos}</td>
                              <td className="py-2 pr-3 text-right">
                                {formatArs(totals.pedidos > 0 ? totals.ventasBrutas / totals.pedidos : 0)}
                              </td>
                              <td className="py-2 pr-3 text-right">{formatArs(totals.ventasBrutas)}</td>
                              <td className="py-2 pr-3 text-right text-muted-foreground">
                                {margenTotal == null ? '—' : `${margenTotal.toFixed(0)}%`}
                              </td>
                              <td className="py-2 pr-3 text-right">{formatArs(totals.rentabilidadPesos)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">
                                {formatArs(totals.compraDolaresArs)}
                              </td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(invTotal)}</td>
                              <td className="py-2 pr-3 text-right">{formatArs(realTotal)}</td>
                              <td className="py-2 pr-3 text-right text-muted-foreground">—</td>
                              <td className="py-2 pr-3 text-right text-muted-foreground">
                                {realPct == null ? '—' : `${realPct.toFixed(0)}%`}
                              </td>
                              <td className="py-2 pr-4 text-right text-muted-foreground">—</td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </CardContent>
                  <p className="border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
                    Real / mes = ganancia real ÷ meses con datos (útil si el año está incompleto). Real / ventas = qué
                    % de la facturación se pasó a dólares o inversiones.
                  </p>
                </Card>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {yearly.map((y) => {
                    const inversiones = y.inversionEmpresaArs + y.inversionCypreaArs;
                    const usdShare =
                      y.gananciaRealArs > 0 ? (y.compraDolaresArs / y.gananciaRealArs) * 100 : 0;
                    const invShare = y.gananciaRealArs > 0 ? (inversiones / y.gananciaRealArs) * 100 : 0;
                    const realVsTeorica =
                      y.rentabilidadPesos !== 0
                        ? (y.gananciaRealArs / Math.abs(y.rentabilidadPesos)) * 100
                        : null;
                    const isCurrent = y.year === currentYearKey;
                    return (
                      <div
                        key={`mix-${y.year}`}
                        className={`rounded-lg border px-4 py-3 ${
                          isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-card'
                        }`}
                      >
                        <p className="text-sm font-semibold">{y.year} · mix de la real</p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="flex h-full w-full">
                            <div
                              className="h-full bg-sky-500/80"
                              style={{ width: `${usdShare}%` }}
                              title={`Dólares ${usdShare.toFixed(0)}%`}
                            />
                            <div
                              className="h-full bg-amber-500/80"
                              style={{ width: `${invShare}%` }}
                              title={`Inversiones ${invShare.toFixed(0)}%`}
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                          <span>
                            <span className="mr-1 inline-block size-1.5 rounded-full bg-sky-500/80" />
                            Dólares {usdShare.toFixed(0)}%
                          </span>
                          <span>
                            <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500/80" />
                            Inversiones {invShare.toFixed(0)}%
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Real vs teórica:{' '}
                          <span className="font-medium tabular-nums text-foreground">
                            {realVsTeorica == null ? '—' : `${realVsTeorica.toFixed(0)}%`}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            (cuánto de la teórica se materializó en USD/inversiones)
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader className="px-4 py-3">
                      <CardTitle className="text-sm">Tendencia · ventas</CardTitle>
                      <CardDescription className="text-xs">{formatArs(totals.ventasBrutas)} acumulado</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <TinyLineChart
                        values={monthly.map((m) => m.ventasBrutas)}
                        labels={monthly.map((m) => m.label)}
                      />
                    </CardContent>
                  </Card>
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader className="px-4 py-3">
                      <CardTitle className="text-sm">Tendencia · teórica</CardTitle>
                      <CardDescription className="text-xs">
                        {formatArs(totals.rentabilidadPesos)} acumulado
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <TinyLineChart
                        values={monthly.map((m) => m.rentabilidadPesos)}
                        labels={monthly.map((m) => m.label)}
                      />
                    </CardContent>
                  </Card>
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader className="px-4 py-3">
                      <CardTitle className="text-sm">Tendencia · ganancia real</CardTitle>
                      <CardDescription className="text-xs">
                        {formatArs(
                          totals.compraDolaresArs +
                            totals.inversionEmpresaArs +
                            totals.inversionCypreaArs,
                        )}{' '}
                        acumulado
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <TinyLineChart
                        values={monthly.map(
                          (m) => m.compraDolaresArs + m.inversionEmpresaArs + m.inversionCypreaArs,
                        )}
                        labels={monthly.map((m) => m.label)}
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      <Toaster />
    </AppMain>
  );
}
