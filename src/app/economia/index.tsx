import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { AppMain } from '@/components/layout/AppMain';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOrders } from '@/lib/hooks/useOrders';
import { pedidoEnPesos } from '@/lib/internacional';
import { Button } from '@/components/ui/button';
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
import { MesEnCursoPanel } from '@/components/economia/MesEnCursoPanel';
import { Panel, PanelTitle, Segmentado, Stat, formatArsCorto, formatPct as pctUi } from '@/components/economia/controlGastosUi';
import {
  BarrasApiladasMes,
  BarrasMes,
  CeldaMes,
  Sparkline,
  Variacion,
  filaCls,
  pieCls,
  tablaCls,
  tdCls,
  theadCls,
  thCls,
} from '@/components/economia/EconomiaGraficos';
import { MontoInput } from '@/components/gastos/GastosUi';
import { estimarFijos, sumarGastosAutoAMeses } from '@/lib/gastos/gastosAuto';
import { useGastosAuto } from '@/lib/hooks/useGastosAuto';
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
  toArgentinaDateKey,
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
  ECONOMIA_ENVIO_SIN_TIPO_ARS,
  economiaEnvioImputadoArs,
  economiaPedidoListoParaImputarEnvio,
  orderHasShippingCarrierAndService,
  ordenAndreaniConLinkAsignado,
} from '@/lib/economia/envioImputado';
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
import { itemCuentaComoVenta, ordenCuentaComoVenta } from '@/lib/pedidos/tipoPedido';

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

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
  /** Todas las unidades (sellos + accesorios) que cuentan como venta. */
  unidades: number;
  /** Solo ítems tipo SELLO que cuentan como venta. */
  sellos: number;
  pedidos: number;
  /** Regalos: costo de fabricación de ítems regalo + envío de pedidos Regalo (gasto, resta de la rentabilidad). */
  costoRegalos: number;
  /** Pruebas: costo de fabricación de pedidos de Prueba (gasto, resta de la rentabilidad). */
  costoPruebas: number;
  /** Cantidad de ítems regalo del mes (informativo). */
  regalosCount: number;
  /** Cantidad de ítems de pruebas del mes (informativo). */
  pruebasCount: number;
};

function totalGastosOperativos(r: MonthlyRow): number {
  if (r.fuenteResumen && r.gastosReales > 0) return r.gastosReales;
  return (
    r.costosFijos +
    r.costosVentas +
    r.gastosExtras +
    r.publicidad +
    r.enviosManual +
    r.costoRegalos +
    r.costoPruebas
  );
}

function totalGananciasGrupoArs(r: Pick<MonthlyRow, 'inversionEmpresaArs' | 'inversionCypreaArs' | 'compraDolaresArs'>): number {
  return r.inversionEmpresaArs + r.inversionCypreaArs + r.compraDolaresArs;
}

function sumarFilas(rows: MonthlyRow[]) {
  return rows.reduce(
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
      acc.costoRegalos += r.costoRegalos;
      acc.costoPruebas += r.costoPruebas;
      acc.regalosCount += r.regalosCount;
      acc.pruebasCount += r.pruebasCount;
      return acc;
    },
    {
      costoRegalos: 0,
      costoPruebas: 0,
      regalosCount: 0,
      pruebasCount: 0,
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

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

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
    <th className="px-3 py-3 text-right text-[13px] font-normal">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors',
          'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
          expanded ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
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

type RangoEconomia = '12' | '24' | 'todo';
type MetricaVentas = 'ventas' | 'sellos' | 'pedidos';

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
  const gastosAuto = useGastosAuto(isAllowed);

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
  const [tab, setTab] = useState('mes-en-curso');
  const [rango, setRango] = useState<RangoEconomia>('12');
  const [metricaVentas, setMetricaVentas] = useState<MetricaVentas>('ventas');
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
      (o) =>
        orderHasShippingCarrierAndService(o) &&
        economiaPedidoListoParaImputarEnvio(o) &&
        !ordenAndreaniConLinkAsignado(o),
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
    // Gastos automáticos (Meta, Google, OpenAI, recurrentes) se suman a lo cargado a mano.
    const gastosPorMes = sumarGastosAutoAMeses(loadAllMonthlyCosts(), gastosAuto.porMes);
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
          costoRegalos: 0,
          costoPruebas: 0,
          regalosCount: 0,
          pruebasCount: 0,
        } satisfies MonthlyRow);

      const esVenta = ordenCuentaComoVenta(order);
      // Pruebas y regalos aparte no suman a pedidos.
      if (esVenta) row.pedidos += 1;
      const fab = Number(order.fabricationCostTotal || 0);
      const envioImputadoVentas = economiaEnvioImputadoArs(order, shippingCostByOrderId);
      // Ventas: solo pedidos Venta (el envío imputado y el valor del pedido no incluyen regalos/pruebas).
      if (esVenta) row.ventasBrutas += Number(order.totalValue || 0) + envioImputadoVentas;
      if (!resumen) {
        // Costo de fabricación de ítems regalo: sale de costosVentas y va a la línea "Regalos".
        const fabGiftItems = order.items
          .filter((i) => i.isGift)
          .reduce((s, i) => s + Number(i.fabricationCostItem || 0), 0);
        if (order.orderType === 'PRUEBA') {
          row.costoPruebas += fab;
        } else if (order.orderType === 'REGALO') {
          // Regalo aparte: fabricación + envío (lo paga Alcohn).
          row.costoRegalos += fab + envioImputadoVentas;
        } else {
          row.costosVentas += Math.max(0, fab - fabGiftItems);
          row.costoRegalos += fabGiftItems;
        }
      }
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
        if (order.orderType === 'PRUEBA') {
          row.pruebasCount += 1;
        } else if (order.orderType === 'REGALO' || item.isGift) {
          row.regalosCount += 1;
        }
        // Unidades, sellos y transferido: solo lo que cuenta como venta.
        if (!itemCuentaComoVenta(order, item)) continue;
        row.unidades += 1;
        if (itemTypeOf(item) === 'SELLO') row.sellos += 1;

        const value = Number(item.itemValue || 0);
        if (item.saleState === 'TRANSFERIDO') {
          row.transferido += value;
        }
      }
      if (esVenta) row.transferido += envioImputadoVentas;

      row.pendiente = row.ventasBrutas - row.transferido;
      // Regalos y pruebas son gasto operativo que resta de la rentabilidad.
      // En meses con cierre tipo Excel (`resumen`) los gastos reales ya los incluyen: no se vuelven a restar.
      const gastosOp =
        gastosOperativosParaEconomia(bundle, row.costosVentas, legacyFixed) +
        (resumen ? 0 : row.costoRegalos + row.costoPruebas);
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
        costoRegalos: 0,
        costoPruebas: 0,
        regalosCount: 0,
        pruebasCount: 0,
      };
      applyResumenVentasOverride(row, bundle, usdRate, legacyFixed);
      byMonth.set(key, row);
    }

    return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [orders, usdRate, gastosStorageTick, shippingCostByOrderId, gastosAuto.porMes]);

  const mesEnCurso = useMemo(() => {
    const hoy = todayArgentinaDateKey();
    const mes = hoy.slice(0, 7);
    const [y, m] = mes.split('-').map(Number);
    const anterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
    const gastos = loadAllMonthlyCosts();
    return {
      hoy,
      mes,
      anterior,
      row: monthly.find((r) => r.key === mes),
      // Lo que este mes todavía está en 0 se estima con el mes anterior, línea por línea.
      fijos: estimarFijos(getBundleForMonth(gastos, mes).fixed, gastos[anterior]?.fixed),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, gastosStorageTick]);

  /** Ventas por día del mes en curso (mismo criterio que P&L mensual: valor + envío imputado). */
  const ventasPorDiaMes = useMemo(() => {
    const porDia = new Map<string, { ventas: number; pedidos: number }>();
    for (const order of orders) {
      if (!ordenCuentaComoVenta(order) || orderBusinessMonthKey(order) !== mesEnCurso.mes) continue;
      const dia = order.createdAt ? toArgentinaDateKey(order.createdAt) : mesEnCurso.hoy;
      const d = porDia.get(dia) ?? { ventas: 0, pedidos: 0 };
      d.ventas += Number(order.totalValue || 0) + economiaEnvioImputadoArs(order, shippingCostByOrderId);
      d.pedidos += 1;
      porDia.set(dia, d);
    }
    return [...porDia.entries()].map(([fecha, v]) => ({ fecha, ...v }));
  }, [orders, mesEnCurso.mes, mesEnCurso.hoy, shippingCostByOrderId]);

  /** Últimos meses cerrados para comparar (sin el mes en curso). */
  const historialMeses = useMemo(
    () =>
      monthly
        .filter((r) => r.key < mesEnCurso.mes && r.ventasBrutas > 0)
        .map((r) => ({
          mes: r.key,
          label: r.label,
          ventas: r.ventasBrutas,
          publicidad: r.publicidad,
          ganancia: r.rentabilidadPesos,
          pedidos: r.pedidos,
        })),
    [monthly, mesEnCurso.mes],
  );

  const totals = useMemo(() => sumarFilas(monthly), [monthly]);

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
  const productBreakdown = useMemo(() => {
    const itemsByMonth: Array<{ monthKey: string; item: OrderItem; order: Order }> = [];
    for (const order of orders) {
      const monthKey = orderBusinessMonthKey(order);
      for (const item of order.items) {
        itemsByMonth.push({ monthKey, item, order });
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

  const totalCajaArs = useMemo(
    () =>
      cajaBalances.efectivo +
      cajaBalances.mercadopago +
      cajaBalances.santanderCatalina +
      cajaBalances.santanderJulian +
      cajaBalances.bbva,
    [cajaBalances],
  );

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
        // Pendiente de cobro: solo ventas (los regalos y pruebas no se cobran).
        if (!itemCuentaComoVenta(order, item)) continue;
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

  const mesesRango = rango === 'todo' ? Infinity : Number(rango);
  const monthlyRango = useMemo(() => monthly.slice(-mesesRango), [monthly, mesesRango]);
  const totalsRango = useMemo(() => sumarFilas(monthlyRango), [monthlyRango]);
  const productRango = useMemo(() => productBreakdown.slice(-mesesRango), [productBreakdown, mesesRango]);
  const productTotalsRango = useMemo(
    () =>
      productKeysActive
        .map((key) => ({ key, meta: economiaProductoMeta(key), ...sumProductAcrossMonths(productRango, key) }))
        .filter((p) => p.unidades > 0 || p.ventas > 0),
    [productRango, productKeysActive],
  );
  /** Meses cerrados del período (sin el mes en curso), para promedios. */
  const cerradosRango = useMemo(() => monthlyRango.filter((m) => m.key !== currentMonthKey), [monthlyRango, currentMonthKey]);

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

  const actualKey = currentMonthKey;
  const valorVentas = (m: MonthlyRow) => (metricaVentas === 'ventas' ? m.ventasBrutas : metricaVentas === 'sellos' ? m.sellos : m.pedidos);
  const formatoVentas = (n: number) => (metricaVentas === 'ventas' ? formatArsCorto(n) : String(Math.round(n)));
  const promedioVentas = cerradosRango.length ? cerradosRango.reduce((s, m) => s + valorVentas(m), 0) / cerradosRango.length : 0;
  const mejorMes = cerradosRango.reduce<MonthlyRow | null>((a, m) => (!a || valorVentas(m) > valorVentas(a) ? m : a), null);
  const ticketRango = totalsRango.pedidos > 0 ? totalsRango.ventasBrutas / totalsRango.pedidos : 0;
  const unidadesPorPedidoRango = totalsRango.pedidos > 0 ? totalsRango.unidades / totalsRango.pedidos : 0;
  const etiquetaRango = rango === 'todo' ? `todo (${monthly.length} meses)` : `últimos ${rango} meses`;
  const totalMetricaProducto = (r: { totalUnidades: number; totalVentas: number; totalMargen: number }) =>
    desgloseMetric === 'unidades' ? r.totalUnidades : desgloseMetric === 'ventas' ? r.totalVentas : r.totalMargen;
  const formatoProducto = (n: number) => (desgloseMetric === 'unidades' ? String(Math.round(n)) : formatArsCorto(n));
  const totalUnidadesRango = productTotalsRango.reduce((s, p) => s + p.unidades, 0);
  const tabsConRango = tab === 'ventas' || tab === 'productos' || tab === 'resultados';

  return (
    <AppMain className="flex min-h-screen flex-col">
      <div className="w-full max-w-[1920px] flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {/* ---------- Encabezado ---------- */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Economía</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ventas, gastos y resultados de Alcohn. Los gastos se cargan en <span className="text-foreground">Gastos</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-full bg-white/[0.05] pl-4 pr-1 text-xs text-muted-foreground">
              Dólar de referencia
              <input
                type="number"
                aria-label="Dólar de referencia"
                className="h-7 w-24 rounded-full bg-white/[0.06] px-3 text-right text-sm tabular-nums text-foreground outline-none focus:ring-1 focus:ring-white/20"
                value={usdRate}
                disabled={economiaSettingsLoading}
                onChange={(e) => setUsdRate(Number(e.target.value || 1))}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-4 text-xs text-muted-foreground"
              onClick={() => setShowMetodologia((v) => !v)}
              aria-expanded={showMetodologia}
            >
              <HelpCircle className="size-3.5" aria-hidden />
              Cómo se calcula
            </Button>
          </div>
        </header>

        {showMetodologia ? (
          <Panel className="text-sm leading-relaxed text-muted-foreground">
            <ul className="grid gap-x-10 gap-y-2 md:grid-cols-2">
              <li>
                <span className="text-foreground">Ventas</span>: total del pedido + envío imputado cuando todos los ítems están despachados
                (tabla de costos o {formatArs(ECONOMIA_ENVIO_SIN_TIPO_ARS)} si no hay método). Andreani con link no suma envío.
              </li>
              <li>
                <span className="text-foreground">Fabricación</span>: costo de lo vendido. Regalos y pruebas no son ventas: se restan como gasto.
              </li>
              <li>
                <span className="text-foreground">Ganancia</span> = ventas − fijos − fabricación − extras − publicidad − envíos. En meses de cierre
                histórico, ventas − gasto real del mes.
              </li>
              <li>
                <span className="text-foreground">Cobrado</span>: ítems en Transferido + su envío. <span className="text-foreground">Ahorro e inversiones</span>
                (compra de dólares, inversiones) no restan de la ganancia.
              </li>
            </ul>
          </Panel>
        ) : null}

        {/* ---------- Herramientas: pendiente, caja, ahorro ---------- */}
        <div className="grid gap-4 md:grid-cols-3">
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="group rounded-3xl bg-white/[0.035] p-5 text-left transition-colors hover:bg-white/[0.06]">
                <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                  Pendiente de cobro
                  <Wallet className="size-4 opacity-60" aria-hidden />
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{formatArsCorto(totals.pendiente)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deudores {formatArsCorto(pendingBreakdown.DEUDOR.amount)} · Foto enviada {formatArsCorto(pendingBreakdown.FOTO_ENVIADA.amount)} · Señado{' '}
                  {formatArsCorto(pendingBreakdown.SEÑADO.amount)}
                </p>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl rounded-3xl">
              <DialogHeader>
                <DialogTitle>Pendiente de cobro</DialogTitle>
                <DialogDescription>Lo vendido que todavía no está en Transferido, por estado.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <PendingPieChart data={pendingSlices} />
                <div className="flex flex-col divide-y divide-white/[0.06] rounded-2xl bg-white/[0.03] px-4">
                  {(['DEUDOR', 'FOTO_ENVIADA', 'SEÑADO'] as const).map((state) => {
                    const total = pendingSlices.reduce((acc, x) => acc + x.amount, 0);
                    const p = total > 0 ? pendingBreakdown[state].amount / total : 0;
                    return (
                      <div key={state} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-sm">{pendingLabel(state)}</p>
                          <p className="text-xs text-muted-foreground">
                            {pendingBreakdown[state].count} ítems · {pctUi(p)}
                          </p>
                        </div>
                        <p className="text-base font-medium tabular-nums">{formatArs(pendingBreakdown[state].amount)}</p>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between py-3">
                    <p className="text-sm font-medium">Total</p>
                    <p className="text-base font-semibold tabular-nums">{formatArs(totals.pendiente)}</p>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="group rounded-3xl bg-white/[0.035] p-5 text-left transition-colors hover:bg-white/[0.06]">
                <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                  Caja
                  <Banknote className="size-4 opacity-60" aria-hidden />
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{economiaSettingsLoading ? '…' : formatArsCorto(totalCajaArs)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Efectivo, Mercado Pago y bancos · se carga a mano, tocá para actualizar</p>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl">
              <DialogHeader>
                <DialogTitle>Caja</DialogTitle>
                <DialogDescription>Saldos en pesos por cuenta. Se guardan solos.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col divide-y divide-white/[0.05]">
                {(
                  [
                    { key: 'efectivo' as const, label: 'Efectivo' },
                    { key: 'mercadopago' as const, label: 'Mercado Pago' },
                    { key: 'santanderCatalina' as const, label: 'Santander Catalina' },
                    { key: 'santanderJulian' as const, label: 'Santander Julián' },
                    { key: 'bbva' as const, label: 'BBVA' },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm">{label}</span>
                    <MontoInput
                      className="w-44"
                      ariaLabel={label}
                      disabled={economiaSettingsLoading}
                      value={cajaBalances[key]}
                      onChange={(n) => setCajaBalances((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }))}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-lg font-semibold tabular-nums">{formatArs(totalCajaArs)}</span>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="group rounded-3xl bg-white/[0.035] p-5 text-left transition-colors hover:bg-white/[0.06]">
                <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                  Ahorro e inversiones
                  <CircleDollarSign className="size-4 opacity-60" aria-hidden />
                </div>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{formatArsCorto(realSummary.totalAdjustmentsArs)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {realSummary.usdPurchased > 0 ? `${formatUsd(realSummary.usdPurchased)} comprados · ` : ''}
                  movimientos reales · tocá para cargar
                </p>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl rounded-3xl">
              <DialogHeader>
                <DialogTitle>Ahorro e inversiones</DialogTitle>
                <DialogDescription>Compras de dólares e inversiones: no son gastos, pero muestran cuánto de la ganancia se separó.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-4 rounded-2xl bg-white/[0.03] p-4">
                <Stat label="Ganancia acumulada" value={formatArsCorto(totals.rentabilidadPesos)} />
                <Stat label="Separado (ahorro + inversiones)" value={formatArsCorto(realSummary.totalAdjustmentsArs)} />
                <Stat label="Queda" value={formatArsCorto(realSummary.gananciaRealArs)} hint={formatUsd(realSummary.gananciaRealUsd)} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-2xl bg-white/[0.03] p-4">
                  <h4 className="text-sm font-medium">Compra de dólares</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Fecha</Label>
                      <Input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">USD comprados</Label>
                      <Input type="number" value={usdAmount} onChange={(e) => setUsdAmount(Number(e.target.value || 0))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Precio por dólar</Label>
                      <Input type="number" value={usdBuyRate} onChange={(e) => setUsdBuyRate(Number(e.target.value || 0))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">En pesos</Label>
                      <p className="flex h-9 items-center text-sm tabular-nums">{formatArs(usdPurchaseArs)}</p>
                    </div>
                  </div>
                  <Button
                    className="rounded-full"
                    disabled={movementsLoading}
                    onClick={() => {
                      if (!movementDate || usdAmount <= 0 || usdBuyRate <= 0) return;
                      void addMovement({ date: movementDate, type: 'USD_PURCHASE', amountUsd: usdAmount, rate: usdBuyRate, amountArs: usdPurchaseArs });
                      setUsdAmount(0);
                    }}
                  >
                    Agregar compra
                  </Button>
                </div>
                <div className="space-y-3 rounded-2xl bg-white/[0.03] p-4">
                  <h4 className="text-sm font-medium">Inversiones</h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">En la empresa (pesos)</Label>
                    <div className="flex gap-2">
                      <Input type="number" value={invEmpresaArs} onChange={(e) => setInvEmpresaArs(Number(e.target.value || 0))} />
                      <Button
                        variant="secondary"
                        className="rounded-full"
                        disabled={movementsLoading}
                        onClick={() => {
                          if (!movementDate || invEmpresaArs <= 0) return;
                          void addMovement({ date: movementDate, type: 'INV_EMPRESA', amountArs: invEmpresaArs });
                          setInvEmpresaArs(0);
                        }}
                      >
                        Agregar
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">En Cyprea (pesos)</Label>
                    <div className="flex gap-2">
                      <Input type="number" value={invCypreaArs} onChange={(e) => setInvCypreaArs(Number(e.target.value || 0))} />
                      <Button
                        variant="secondary"
                        className="rounded-full"
                        disabled={movementsLoading}
                        onClick={() => {
                          if (!movementDate || invCypreaArs <= 0) return;
                          void addMovement({ date: movementDate, type: 'INV_CYPREA', amountArs: invCypreaArs });
                          setInvCypreaArs(0);
                        }}
                      >
                        Agregar
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Se usa la fecha de la izquierda.</p>
                </div>
              </div>

              <div className="rounded-2xl bg-white/[0.03]">
                <div className="flex items-baseline justify-between px-4 pt-3">
                  <p className="text-sm font-medium">Movimientos</p>
                  <p className="text-xs text-muted-foreground">
                    {formatUsd(realSummary.usdPurchased)} comprados · {formatArsCorto(realSummary.byType.USD_PURCHASE)} en pesos
                  </p>
                </div>
                <div className="max-h-64 overflow-auto px-4 pb-2">
                  {movementsLoading ? (
                    <p className="py-3 text-sm text-muted-foreground">Cargando…</p>
                  ) : realMovements.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">Todavía no hay movimientos.</p>
                  ) : (
                    realMovements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 border-t border-white/[0.05] py-2.5 text-sm first:border-0">
                        <div className="min-w-0">
                          <p>{movementTypeLabel(m.type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.date}
                            {m.type === 'USD_PURCHASE' ? ` · ${formatUsd(m.amountUsd ?? 0)} a ${formatArs(m.rate || 0)}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums">{formatArs(m.amountArs)}</span>
                          <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" disabled={movementsLoading} onClick={() => void removeMovement(m.id)}>
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
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="-mx-1 overflow-x-auto px-1">
              <TabsList className="h-auto gap-0.5 rounded-full bg-white/[0.05] p-1">
                {[
                  { value: 'mes-en-curso', label: 'Mes en curso' },
                  { value: 'ventas', label: 'Ventas' },
                  { value: 'productos', label: 'Productos' },
                  { value: 'resultados', label: 'Resultados por mes' },
                  { value: 'anual', label: 'Por año' },
                ].map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="rounded-full px-4 py-1.5 text-sm text-muted-foreground data-[state=active]:bg-white/[0.14] data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {tabsConRango ? (
              <Segmentado<RangoEconomia>
                valor={rango}
                onChange={setRango}
                opciones={[
                  { valor: '12', label: '12 meses' },
                  { valor: '24', label: '24 meses' },
                  { valor: 'todo', label: 'Todo' },
                ]}
              />
            ) : null}
          </div>

          {/* ================= Mes en curso ================= */}
          <TabsContent value="mes-en-curso">
            <MesEnCursoPanel
              mes={mesEnCurso.mes}
              etiquetaMes={monthKeyLabelLong(mesEnCurso.mes)}
              hoy={mesEnCurso.hoy}
              row={mesEnCurso.row}
              fijos={mesEnCurso.fijos}
              etiquetaMesAnterior={monthKeyLabelLong(mesEnCurso.anterior).split(' ')[0].toLowerCase()}
              ventasPorDia={ventasPorDiaMes}
              historial={historialMeses}
              valuacion={gastosAuto.porMes[mesEnCurso.mes]}
              registros={gastosAuto.data?.registros ?? []}
              recurrentes={gastosAuto.data?.recurrentes ?? []}
              feriados={gastosAuto.data?.feriados ?? []}
              config={gastosAuto.data?.config ?? null}
              blueHoy={gastosAuto.blueHoy}
              loading={gastosAuto.loading}
            />
          </TabsContent>

          {/* ================= Ventas ================= */}
          <TabsContent value="ventas">
            <div className="flex flex-col gap-4">
              <Panel>
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-[15px] font-medium">Ventas por mes</h3>
                      <Segmentado<MetricaVentas>
                        valor={metricaVentas}
                        onChange={setMetricaVentas}
                        opciones={[
                          { valor: 'ventas', label: 'Pesos' },
                          { valor: 'sellos', label: 'Sellos' },
                          { valor: 'pedidos', label: 'Pedidos' },
                        ]}
                      />
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {etiquetaRango.charAt(0).toUpperCase() + etiquetaRango.slice(1)} · el mes en curso va punteado porque todavía no terminó.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-8">
                    <Stat label="Promedio por mes" value={formatoVentas(promedioVentas)} hint="meses cerrados" />
                    {mejorMes ? <Stat label="Mejor mes" value={formatoVentas(valorVentas(mejorMes))} hint={mejorMes.label} /> : null}
                    <Stat label="Ticket promedio" value={formatArsCorto(ticketRango)} />
                    <Stat label="Unidades por pedido" value={unidadesPorPedidoRango.toFixed(1).replace('.', ',')} />
                  </div>
                </div>
                <BarrasMes
                  datos={monthlyRango.map((m) => ({ key: m.key, label: m.label, valor: valorVentas(m), actual: m.key === actualKey }))}
                  formato={formatoVentas}
                  referencia={promedioVentas > 0 ? { valor: promedioVentas, label: 'promedio' } : undefined}
                />
              </Panel>

              <Panel>
                <PanelTitle title="Mes a mes" sub="Volumen, ticket y ganancia de cada mes" />
                <div className="max-h-[min(34rem,60vh)] overflow-auto">
                  <table className={cn(tablaCls, 'min-w-[760px]')}>
                    <thead className={theadCls}>
                      <tr>
                        <th className={thCls}>Mes</th>
                        <th className={thCls}>Pedidos</th>
                        <th className={thCls}>Sellos</th>
                        <th className={thCls}>Unidades</th>
                        <th className={thCls}>Ventas</th>
                        <th className={thCls}>Ticket</th>
                        <th className={thCls}>Ganancia</th>
                        <th className={thCls}>Margen</th>
                        <th className={thCls}>Ventas vs mes ant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthlyRango].reverse().map((r) => {
                        const idx = monthly.findIndex((m) => m.key === r.key);
                        const prev = idx > 0 ? monthly[idx - 1] : null;
                        const delta = prev && prev.ventasBrutas > 0 ? ((r.ventasBrutas - prev.ventasBrutas) / prev.ventasBrutas) * 100 : null;
                        const ticket = r.pedidos > 0 ? r.ventasBrutas / r.pedidos : 0;
                        const actual = r.key === actualKey;
                        return (
                          <tr key={r.key} className={filaCls(actual)}>
                            <td className={tdCls}>
                              <CeldaMes label={r.label} actual={actual} />
                            </td>
                            <td className={tdCls}>{r.pedidos}</td>
                            <td className={tdCls}>{r.sellos}</td>
                            <td className={tdCls}>{r.unidades}</td>
                            <td className={cn(tdCls, 'font-medium')}>{formatArs(r.ventasBrutas)}</td>
                            <td className={cn(tdCls, 'text-muted-foreground')}>{ticket > 0 ? formatArs(ticket) : '—'}</td>
                            <td className={cn(tdCls, r.rentabilidadPesos < 0 && 'text-red-400')}>{formatArs(r.rentabilidadPesos)}</td>
                            <td className={cn(tdCls, 'text-muted-foreground')}>{r.ventasBrutas > 0 ? pctUi(r.rentabilidadPesos / r.ventasBrutas) : '—'}</td>
                            <td className={tdCls}>{actual ? <span className="text-muted-foreground/60">en curso</span> : <Variacion pct={delta} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={pieCls}>
                        <td className={tdCls}>Total del período</td>
                        <td className={tdCls}>{totalsRango.pedidos}</td>
                        <td className={tdCls}>{totalsRango.sellos}</td>
                        <td className={tdCls}>{totalsRango.unidades}</td>
                        <td className={tdCls}>{formatArs(totalsRango.ventasBrutas)}</td>
                        <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(ticketRango)}</td>
                        <td className={tdCls}>{formatArs(totalsRango.rentabilidadPesos)}</td>
                        <td className={cn(tdCls, 'text-muted-foreground')}>
                          {totalsRango.ventasBrutas > 0 ? pctUi(totalsRango.rentabilidadPesos / totalsRango.ventasBrutas) : '—'}
                        </td>
                        <td className={tdCls} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
            </div>
          </TabsContent>

          {/* ================= Productos ================= */}
          <TabsContent value="productos">
            <div className="flex flex-col gap-4">
              <Panel>
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-[15px] font-medium">Productos por mes</h3>
                      <Segmentado<EconomiaMetricMode>
                        valor={desgloseMetric}
                        onChange={setDesgloseMetric}
                        opciones={[
                          { valor: 'unidades', label: 'Unidades' },
                          { valor: 'ventas', label: 'Ventas' },
                          { valor: 'margen', label: 'Margen' },
                        ]}
                      />
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Misma clasificación que Precios. «Margen» = venta − costo de fabricación. Pasá el mouse por una barra para el detalle.
                    </p>
                  </div>
                </div>
                <BarrasApiladasMes
                  filas={productRango.map((r) => ({
                    key: r.key,
                    label: r.label,
                    valores: Object.fromEntries(productKeysActive.map((k) => [k, cellMetric(r.byProduct[k], desgloseMetric)])) as Record<string, number>,
                  }))}
                  series={productKeysActive.map((k) => ({ key: k, label: economiaProductoMeta(k).shortLabel, color: economiaProductoMeta(k).color }))}
                  formato={formatoProducto}
                  actualKey={actualKey}
                />
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel>
                  <PanelTitle
                    title={`Este mes · ${monthKeyLabelLong(actualKey)}`}
                    sub={previousProductRow ? `Participación y cambio contra ${previousProductRow.label}` : 'Participación de cada producto'}
                  />
                  {!currentProductRow || totalMetricaProducto(currentProductRow) <= 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no hay ventas este mes.</p>
                  ) : (
                    <ul className="space-y-3">
                      {productKeysActive
                        .map((key) => {
                          const cur = cellMetric(currentProductRow.byProduct[key], desgloseMetric);
                          const prev = previousProductRow ? cellMetric(previousProductRow.byProduct[key], desgloseMetric) : 0;
                          return { key, meta: economiaProductoMeta(key), cur, prev };
                        })
                        .filter((p) => p.cur > 0 || p.prev > 0)
                        .sort((a, b) => b.cur - a.cur)
                        .map((p) => {
                          const share = p.cur / totalMetricaProducto(currentProductRow);
                          return (
                            <li key={p.key}>
                              <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="inline-flex items-center gap-2">
                                  <span className="size-2 rounded-full" style={{ backgroundColor: p.meta.color }} />
                                  {p.meta.label}
                                </span>
                                <span className="flex items-baseline gap-4 tabular-nums">
                                  <span>{formatoProducto(p.cur)}</span>
                                  <span className="w-10 text-right text-xs text-muted-foreground">{pctUi(share)}</span>
                                  <span className="w-14 text-right text-xs">
                                    {p.prev > 0 ? <Variacion pct={((p.cur - p.prev) / p.prev) * 100} /> : <span className="text-muted-foreground">nuevo</span>}
                                  </span>
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
                                <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: p.meta.color }} />
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">El mes en curso todavía no terminó: compará la participación más que los totales.</p>
                </Panel>

                <Panel>
                  <PanelTitle title="En el período" sub={`Unidades y ventas por producto · ${etiquetaRango}`} />
                  <ul className="space-y-3">
                    {productTotalsRango
                      .slice()
                      .sort((a, b) => b.unidades - a.unidades)
                      .map((p) => {
                        const share = totalUnidadesRango > 0 ? p.unidades / totalUnidadesRango : 0;
                        return (
                          <li key={p.key}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="inline-flex items-center gap-2">
                                <span className="size-2 rounded-full" style={{ backgroundColor: p.meta.color }} />
                                {p.meta.label}
                              </span>
                              <span className="flex items-baseline gap-4 tabular-nums">
                                <span className="text-muted-foreground">{p.unidades} u.</span>
                                <span className="w-20 text-right">{formatArsCorto(p.ventas)}</span>
                                <span className="w-10 text-right text-xs text-muted-foreground">{pctUi(share)}</span>
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: p.meta.color }} />
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                </Panel>
              </div>

              <Panel>
                <PanelTitle
                  title="Mes por producto"
                  sub={`Cada celda: ${desgloseMetric === 'unidades' ? 'unidades' : desgloseMetric === 'ventas' ? 'ventas' : 'margen de fabricación'}. Solo productos con alguna venta.`}
                />
                <div className="max-h-[min(34rem,60vh)] overflow-auto">
                  <table className={cn(tablaCls, 'min-w-[900px]')}>
                    <thead className={theadCls}>
                      <tr>
                        <th className={thCls}>Mes</th>
                        {productKeysActive.map((key) => {
                          const meta = economiaProductoMeta(key);
                          return (
                            <th key={key} className={thCls} title={meta.label}>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                                {meta.shortLabel}
                              </span>
                            </th>
                          );
                        })}
                        <th className={cn(thCls, 'text-foreground')}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...productRango].reverse().map((r) => {
                        const actual = r.key === actualKey;
                        return (
                          <tr key={r.key} className={filaCls(actual)}>
                            <td className={tdCls}>
                              <CeldaMes label={r.label} actual={actual} />
                            </td>
                            {productKeysActive.map((key) => {
                              const v = cellMetric(r.byProduct[key], desgloseMetric);
                              return (
                                <td key={key} className={cn(tdCls, v === 0 && 'text-muted-foreground/40')}>
                                  {v === 0 ? '—' : desgloseMetric === 'unidades' ? v : formatArs(v)}
                                </td>
                              );
                            })}
                            <td className={cn(tdCls, 'font-medium')}>
                              {desgloseMetric === 'unidades' ? totalMetricaProducto(r) : formatArs(totalMetricaProducto(r))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={pieCls}>
                        <td className={tdCls}>Total</td>
                        {productKeysActive.map((key) => {
                          const v = cellMetric(sumProductAcrossMonths(productRango, key), desgloseMetric);
                          return (
                            <td key={key} className={tdCls}>
                              {desgloseMetric === 'unidades' ? v : formatArs(v)}
                            </td>
                          );
                        })}
                        <td className={tdCls}>
                          {(() => {
                            const t = productRango.reduce((s, r) => s + totalMetricaProducto(r), 0);
                            return desgloseMetric === 'unidades' ? t : formatArs(t);
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
            </div>
          </TabsContent>

          {/* ================= Resultados por mes ================= */}
          <TabsContent value="resultados">
            <Panel>
              <PanelTitle
                title="Resultados por mes"
                sub="Ventas, gastos, ganancia y cobro de cada mes. Tocá «Gastos» o «Ahorro» en el encabezado para abrir el detalle."
              />
              <div className="max-h-[min(36rem,64vh)] overflow-auto">
                <table className={cn(tablaCls, mensualDetalleGastos || mensualDetalleGanancias ? 'min-w-[1500px]' : 'min-w-[1080px]')}>
                  <thead className={theadCls}>
                    <tr>
                      <th className={thCls}>Mes</th>
                      <th className={thCls}>Ventas</th>
                      {mensualDetalleGastos ? (
                        <>
                          <th className={thCls}>
                            <button
                              type="button"
                              onClick={() => setMensualDetalleGastos(false)}
                              className="inline-flex items-center gap-1 text-foreground"
                              aria-expanded
                            >
                              Fijos
                              <ChevronDown className="size-3.5 rotate-180 opacity-70" aria-hidden />
                            </button>
                          </th>
                          <th className={thCls}>Fabricación</th>
                          <th className={thCls}>Regalos</th>
                          <th className={thCls}>Pruebas</th>
                          <th className={thCls}>Extras</th>
                          <th className={thCls}>Publicidad</th>
                          <th className={thCls}>Envíos</th>
                        </>
                      ) : (
                        <PlToggleTh expanded={false} onToggle={() => setMensualDetalleGastos(true)} collapsedLabel="Gastos" expandedHint="detalle de gastos" />
                      )}
                      <th className={cn(thCls, 'text-foreground')}>Ganancia</th>
                      <th className={thCls}>Margen</th>
                      <th className={thCls}>Cobrado</th>
                      <th className={thCls} title="Cobrado − gastos del mes">
                        Cobrado − gastos
                      </th>
                      <th className={thCls}>Pendiente</th>
                      {mensualDetalleGanancias ? (
                        <>
                          <th className={thCls}>
                            <button
                              type="button"
                              onClick={() => setMensualDetalleGanancias(false)}
                              className="inline-flex items-center gap-1 text-foreground"
                              aria-expanded
                            >
                              Dólares
                              <ChevronDown className="size-3.5 rotate-180 opacity-70" aria-hidden />
                            </button>
                          </th>
                          <th className={thCls}>Inv. empresa</th>
                          <th className={thCls}>Inv. Cyprea</th>
                          <th className={thCls}>Total USD</th>
                        </>
                      ) : (
                        <PlToggleTh expanded={false} onToggle={() => setMensualDetalleGanancias(true)} collapsedLabel="Ahorro" expandedHint="detalle de ahorro" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthlyRango].reverse().map((r) => {
                      const actual = r.key === actualKey;
                      return (
                        <tr key={r.key} className={filaCls(actual)}>
                          <td className={tdCls}>
                            <CeldaMes
                              label={r.label}
                              actual={actual}
                              extra={r.fuenteResumen ? <span className="text-[11px] normal-case text-muted-foreground">cierre</span> : null}
                            />
                          </td>
                          <td className={cn(tdCls, 'font-medium')}>{formatArs(r.ventasBrutas)}</td>
                          {mensualDetalleGastos ? (
                            r.fuenteResumen ? (
                              <td className={cn(tdCls, 'text-muted-foreground')} colSpan={7} title="Mes con cierre histórico: un solo gasto real (incluye publicidad)">
                                Cierre histórico: {formatArs(r.gastosReales)}
                              </td>
                            ) : (
                              <>
                                <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.costosFijos)}</td>
                                <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.costosVentas)}</td>
                                <td className={cn(tdCls, 'text-muted-foreground')}>
                                  {formatArs(r.costoRegalos)}
                                  {r.regalosCount > 0 ? <span className="ml-1 text-[11px]">({r.regalosCount})</span> : null}
                                </td>
                                <td className={cn(tdCls, 'text-muted-foreground')}>
                                  {formatArs(r.costoPruebas)}
                                  {r.pruebasCount > 0 ? <span className="ml-1 text-[11px]">({r.pruebasCount})</span> : null}
                                </td>
                                <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.gastosExtras)}</td>
                                <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.publicidad)}</td>
                                <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.enviosManual)}</td>
                              </>
                            )
                          ) : (
                            <td className={tdCls}>{formatArs(totalGastosOperativos(r))}</td>
                          )}
                          <td className={cn(tdCls, 'font-medium', r.rentabilidadPesos < 0 && 'text-red-400')}>{formatArs(r.rentabilidadPesos)}</td>
                          <td className={cn(tdCls, 'text-muted-foreground')}>{r.ventasBrutas > 0 ? pctUi(r.rentabilidadPesos / r.ventasBrutas) : '—'}</td>
                          <td className={tdCls}>{formatArs(r.transferido)}</td>
                          <td className={cn(tdCls, r.transferidoMenosGastos < 0 && 'text-red-400/80')}>{formatArs(r.transferidoMenosGastos)}</td>
                          <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.pendiente)}</td>
                          {mensualDetalleGanancias ? (
                            <>
                              <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.compraDolaresArs)}</td>
                              <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.inversionEmpresaArs)}</td>
                              <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(r.inversionCypreaArs)}</td>
                              <td className={cn(tdCls, 'text-muted-foreground')}>{formatUsd(r.gananciaInversionesUsd)}</td>
                            </>
                          ) : (
                            <td className={tdCls}>
                              {totalGananciasGrupoArs(r) > 0 ? formatArs(totalGananciasGrupoArs(r)) : <span className="text-muted-foreground/60">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={pieCls}>
                      <td className={tdCls}>Total del período</td>
                      <td className={tdCls}>{formatArs(totalsRango.ventasBrutas)}</td>
                      {mensualDetalleGastos ? (
                        <>
                          <td className={tdCls}>{formatArs(totalsRango.costosFijos)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.costosVentas)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.costoRegalos)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.costoPruebas)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.gastosExtras)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.publicidad)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.enviosManual)}</td>
                        </>
                      ) : (
                        <td className={tdCls}>{formatArs(totalsRango.gastosOperativos)}</td>
                      )}
                      <td className={tdCls}>{formatArs(totalsRango.rentabilidadPesos)}</td>
                      <td className={cn(tdCls, 'text-muted-foreground')}>
                        {totalsRango.ventasBrutas > 0 ? pctUi(totalsRango.rentabilidadPesos / totalsRango.ventasBrutas) : '—'}
                      </td>
                      <td className={tdCls}>{formatArs(totalsRango.transferido)}</td>
                      <td className={tdCls}>{formatArs(totalsRango.transferidoMenosGastos)}</td>
                      <td className={tdCls}>{formatArs(totalsRango.pendiente)}</td>
                      {mensualDetalleGanancias ? (
                        <>
                          <td className={tdCls}>{formatArs(totalsRango.compraDolaresArs)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.inversionEmpresaArs)}</td>
                          <td className={tdCls}>{formatArs(totalsRango.inversionCypreaArs)}</td>
                          <td className={tdCls}>{formatUsd(totalsRango.gananciaInversionesUsd)}</td>
                        </>
                      ) : (
                        <td className={tdCls}>{formatArs(totalsRango.inversionEmpresaArs + totalsRango.inversionCypreaArs + totalsRango.compraDolaresArs)}</td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Panel>
          </TabsContent>

          {/* ================= Por año ================= */}
          <TabsContent value="anual">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[...yearly].reverse().map((y) => {
                  const idx = yearly.findIndex((x) => x.year === y.year);
                  const prev = idx > 0 ? yearly[idx - 1] : null;
                  const deltaVentas = prev && prev.ventasBrutas > 0 ? ((y.ventasBrutas - prev.ventasBrutas) / prev.ventasBrutas) * 100 : null;
                  const margen = y.ventasBrutas > 0 ? y.rentabilidadPesos / y.ventasBrutas : null;
                  const inversiones = y.inversionEmpresaArs + y.inversionCypreaArs;
                  const parteUsd = y.gananciaRealArs > 0 ? y.compraDolaresArs / y.gananciaRealArs : 0;
                  const actual = y.year === currentYearKey;
                  return (
                    <Panel key={y.year}>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-2xl font-semibold tabular-nums tracking-tight">{y.year}</h3>
                        <span className="text-xs text-muted-foreground">
                          {y.meses} meses{actual ? ' · en curso' : ''}
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-4">
                        <Stat
                          label="Ventas"
                          value={formatArsCorto(y.ventasBrutas)}
                          hint={deltaVentas != null ? <Variacion pct={deltaVentas} /> : `${y.sellos} sellos`}
                        />
                        <Stat
                          label="Ganancia"
                          value={<span className={cn(y.rentabilidadPesos < 0 && 'text-red-400')}>{formatArsCorto(y.rentabilidadPesos)}</span>}
                          hint={margen != null ? `${pctUi(margen)} de las ventas` : undefined}
                        />
                      </div>
                      <div className="mt-5 border-t border-white/[0.06] pt-4">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-muted-foreground">Separado: ahorro e inversiones</span>
                          <span className="tabular-nums">{formatArsCorto(y.gananciaRealArs)}</span>
                        </div>
                        {y.gananciaRealArs > 0 ? (
                          <>
                            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full bg-white/60" style={{ width: `${parteUsd * 100}%` }} />
                              <div className="h-full bg-[#e0812f]/80" style={{ width: `${(1 - parteUsd) * 100}%` }} />
                            </div>
                            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full bg-white/60" />
                                Dólares {formatArsCorto(y.compraDolaresArs)}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full bg-[#e0812f]/80" />
                                Inversiones {formatArsCorto(inversiones)}
                              </span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </Panel>
                  );
                })}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {[
                  { titulo: 'Ventas', valores: monthly.map((m) => m.ventasBrutas) },
                  { titulo: 'Ganancia', valores: monthly.map((m) => m.rentabilidadPesos) },
                  { titulo: 'Ahorro e inversiones', valores: monthly.map((m) => m.compraDolaresArs + m.inversionEmpresaArs + m.inversionCypreaArs) },
                ].map((t) => (
                  <Panel key={t.titulo}>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-[15px] font-medium">{t.titulo}</h3>
                      <span className="text-xs text-muted-foreground">mes a mes</span>
                    </div>
                    <Sparkline valores={t.valores} className="mt-4" alto={72} />
                    <div className="mt-2 flex justify-between text-[11px] capitalize text-muted-foreground">
                      <span>{monthly[0]?.label}</span>
                      <span>{monthly[monthly.length - 1]?.label}</span>
                    </div>
                  </Panel>
                ))}
              </div>

              <Panel>
                <PanelTitle title="Año por año" sub="Ganancia = ventas − gastos. Separado = lo que se pasó a dólares o se invirtió." />
                <div className="overflow-auto">
                  <table className={cn(tablaCls, 'min-w-[980px]')}>
                    <thead className={theadCls}>
                      <tr>
                        <th className={thCls}>Año</th>
                        <th className={thCls}>Sellos</th>
                        <th className={thCls}>Ticket</th>
                        <th className={thCls}>Ventas</th>
                        <th className={thCls}>vs año ant.</th>
                        <th className={cn(thCls, 'text-foreground')}>Ganancia</th>
                        <th className={thCls}>Margen</th>
                        <th className={thCls}>Separado</th>
                        <th className={thCls}>Separado / mes</th>
                        <th className={thCls}>Separado / ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...yearly].reverse().map((y) => {
                        const idx = yearly.findIndex((x) => x.year === y.year);
                        const prev = idx > 0 ? yearly[idx - 1] : null;
                        const deltaVentas = prev && prev.ventasBrutas > 0 ? ((y.ventasBrutas - prev.ventasBrutas) / prev.ventasBrutas) * 100 : null;
                        const ticket = y.pedidos > 0 ? y.ventasBrutas / y.pedidos : 0;
                        const actual = y.year === currentYearKey;
                        return (
                          <tr key={y.year} className={filaCls(actual)}>
                            <td className={tdCls}>
                              <CeldaMes label={`${y.year} · ${y.meses} meses`} actual={actual} />
                            </td>
                            <td className={tdCls}>{y.sellos}</td>
                            <td className={cn(tdCls, 'text-muted-foreground')}>{ticket > 0 ? formatArs(ticket) : '—'}</td>
                            <td className={cn(tdCls, 'font-medium')}>{formatArs(y.ventasBrutas)}</td>
                            <td className={tdCls}>
                              <Variacion pct={deltaVentas} />
                            </td>
                            <td className={cn(tdCls, 'font-medium', y.rentabilidadPesos < 0 && 'text-red-400')}>{formatArs(y.rentabilidadPesos)}</td>
                            <td className={cn(tdCls, 'text-muted-foreground')}>{y.ventasBrutas > 0 ? pctUi(y.rentabilidadPesos / y.ventasBrutas) : '—'}</td>
                            <td className={tdCls}>{formatArs(y.gananciaRealArs)}</td>
                            <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(y.meses > 0 ? y.gananciaRealArs / y.meses : 0)}</td>
                            <td className={cn(tdCls, 'text-muted-foreground')}>{y.ventasBrutas > 0 ? pctUi(y.gananciaRealArs / y.ventasBrutas) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={pieCls}>
                        <td className={tdCls}>Total</td>
                        <td className={tdCls}>{totals.sellos}</td>
                        <td className={cn(tdCls, 'text-muted-foreground')}>{formatArs(totals.pedidos > 0 ? totals.ventasBrutas / totals.pedidos : 0)}</td>
                        <td className={tdCls}>{formatArs(totals.ventasBrutas)}</td>
                        <td className={tdCls} />
                        <td className={tdCls}>{formatArs(totals.rentabilidadPesos)}</td>
                        <td className={cn(tdCls, 'text-muted-foreground')}>
                          {totals.ventasBrutas > 0 ? pctUi(totals.rentabilidadPesos / totals.ventasBrutas) : '—'}
                        </td>
                        <td className={tdCls}>{formatArs(totals.compraDolaresArs + totals.inversionEmpresaArs + totals.inversionCypreaArs)}</td>
                        <td className={tdCls} />
                        <td className={cn(tdCls, 'text-muted-foreground')}>
                          {totals.ventasBrutas > 0
                            ? pctUi((totals.compraDolaresArs + totals.inversionEmpresaArs + totals.inversionCypreaArs) / totals.ventasBrutas)
                            : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </AppMain>
  );
}
