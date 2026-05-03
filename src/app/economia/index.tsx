import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOrders } from '@/lib/hooks/useOrders';
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
import {
  GASTOS_MONTHLY_UPDATED_EVENT,
  gananciaInversionesExtrasArs,
  gastosExtrasEnviosManual,
  gastosExtrasSinEnvioParaEconomia,
  getBundleForMonth,
  getFixedTotalForMonth,
  inversionesExtrasArs,
  loadAllMonthlyCosts,
  readLegacyFixedScalar,
} from '@/lib/gastos/monthlyEconomiaCosts';

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

/** Si la orden no tiene empresa/servicio de envío cargado, imputamos este costo (todo se envía). */
const ECONOMIA_ENVIO_SIN_TIPO_ARS = 5000;

function orderHasShippingCarrierAndService(order: Order): boolean {
  const c = order.shipping?.carrier;
  const s = order.shipping?.service;
  return Boolean(c && c !== 'OTRO' && s);
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
  rentabilidadPesos: number;
  rentabilidadUsd: number;
  gananciaInversionesArs: number;
  gananciaInversionesUsd: number;
  /** Suma ítems en TRANSFERIDO + mismo envío imputado que en ventas (por orden, si ya despachado). */
  transferido: number;
  /** Transferido − (costos fijos + costos ventas + gastos extras + publicidad + envíos manual). */
  transferidoMenosGastos: number;
  /** Inversiones empresa + Cyprea (extras Gastos). */
  inversionesArs: number;
  /** Desglose extras Gastos (mismo mes). */
  inversionEmpresaArs: number;
  inversionCypreaArs: number;
  compraDolaresArs: number;
  pendiente: number;
  unidades: number;
  pedidos: number;
};

function totalGastosOperativos(r: Pick<MonthlyRow, 'costosFijos' | 'costosVentas' | 'gastosExtras' | 'publicidad' | 'enviosManual'>): number {
  return r.costosFijos + r.costosVentas + r.gastosExtras + r.publicidad + r.enviosManual;
}

function totalGananciasGrupoArs(r: Pick<MonthlyRow, 'inversionEmpresaArs' | 'inversionCypreaArs' | 'compraDolaresArs'>): number {
  return r.inversionEmpresaArs + r.inversionCypreaArs + r.compraDolaresArs;
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('es-AR', { month: 'short', year: '2-digit' });
};

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const itemTypeLabel = (item: string) => {
  if (item === 'SELLO') return 'Sellos';
  if (item === 'SOLDADOR') return 'Soldadores';
  if (item === 'MANGO_GOLPE') return 'Mango de golpe';
  if (item === 'ABECEDARIO') return 'Abecedarios';
  if (item === 'BASE_REMACHADORA') return 'Base remachadora';
  return item;
};

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

const orderMonthKey = (order: Order): string => {
  const d = order.orderDate ? new Date(order.orderDate) : new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
};

function TinyLineChart({ values }: { values: number[] }) {
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
        <span>Máx {max.toFixed(0)}</span>
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
  const { orders, loading } = useOrders();
  const { toast } = useToast();
  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  const [usdRate, setUsdRate] = useState(1200);
  const [gastosStorageTick, setGastosStorageTick] = useState(0);
  const [realMovements, setRealMovements] = useState<RealMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [usdAmount, setUsdAmount] = useState(0);
  const [usdBuyRate, setUsdBuyRate] = useState(usdRate);
  const [invEmpresaArs, setInvEmpresaArs] = useState(0);
  const [invCypreaArs, setInvCypreaArs] = useState(0);
  const [mensualDetalleGastos, setMensualDetalleGastos] = useState(false);
  const [mensualDetalleGanancias, setMensualDetalleGanancias] = useState(false);
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
    void loadGastosMensualesIntoCache(user.id).catch((e) => {
      toast({
        title: 'No se pudieron cargar los gastos mensuales',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    });
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
      const key = orderMonthKey(order);
      const bundle = getBundleForMonth(gastosPorMes, key);
      const costosFijosMes = getFixedTotalForMonth(bundle, legacyFixed);
      const gastosExtrasSinEnvioMes = gastosExtrasSinEnvioParaEconomia(bundle.extras);
      const publicidadMes = Number(bundle.extras.publicidad) || 0;
      const enviosManualMes = gastosExtrasEnviosManual(bundle.extras);
      const gananciaInvArs = gananciaInversionesExtrasArs(bundle.extras);
      const inversionesMes = inversionesExtrasArs(bundle.extras);
      const invEmpresaMes = Number(bundle.extras.inversiones_empresa) || 0;
      const invCypreaMes = Number(bundle.extras.inversion_cyprea) || 0;
      const compraDolaresMes = Number(bundle.extras.compra_dolares) || 0;

      const row =
        byMonth.get(key) ||
        ({
          key,
          label: monthLabel(key),
          ventasBrutas: 0,
          costosFijos: costosFijosMes,
          costosVentas: 0,
          gastosExtras: gastosExtrasSinEnvioMes,
          publicidad: publicidadMes,
          enviosManual: enviosManualMes,
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
          pedidos: 0,
        } satisfies MonthlyRow);

      row.pedidos += 1;
      const fab = Number(order.fabricationCostTotal || 0);
      const envioImputadoVentas = economiaPedidoListoParaImputarEnvio(order)
        ? orderHasShippingCarrierAndService(order)
          ? (shippingCostByOrderId[order.id] ?? ECONOMIA_ENVIO_SIN_TIPO_ARS)
          : ECONOMIA_ENVIO_SIN_TIPO_ARS
        : 0;
      row.ventasBrutas += Number(order.totalValue || 0) + envioImputadoVentas;
      row.costosVentas += fab;
      row.costosFijos = costosFijosMes;
      row.gastosExtras = gastosExtrasSinEnvioMes;
      row.publicidad = publicidadMes;
      row.enviosManual = enviosManualMes;
      row.gananciaInversionesArs = gananciaInvArs;
      row.gananciaInversionesUsd = usdRate > 0 ? gananciaInvArs / usdRate : 0;
      row.inversionesArs = inversionesMes;
      row.inversionEmpresaArs = invEmpresaMes;
      row.inversionCypreaArs = invCypreaMes;
      row.compraDolaresArs = compraDolaresMes;

      for (const item of order.items) {
        row.unidades += 1;

        const value = Number(item.itemValue || 0);
        if (item.saleState === 'TRANSFERIDO') {
          row.transferido += value;
        }
      }
      row.transferido += envioImputadoVentas;

      row.pendiente = row.ventasBrutas - row.transferido;
      row.rentabilidadPesos =
        row.ventasBrutas -
        row.costosFijos -
        row.costosVentas -
        row.gastosExtras -
        row.publicidad -
        row.enviosManual;
      row.rentabilidadUsd = usdRate > 0 ? row.rentabilidadPesos / usdRate : 0;
      const gastosDesdeTransferido =
        row.costosFijos +
        row.costosVentas +
        row.gastosExtras +
        row.publicidad +
        row.enviosManual;
      row.transferidoMenosGastos = row.transferido - gastosDesdeTransferido;

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
        pedidos: 0,
      },
    );
  }, [monthly]);

  const mensualTablaCols =
    2 + (mensualDetalleGastos ? 5 : 1) + 4 + (mensualDetalleGanancias ? 4 : 1);

  const totalCajaArs = useMemo(
    () =>
      cajaBalances.efectivo +
      cajaBalances.mercadopago +
      cajaBalances.santanderCatalina +
      cajaBalances.santanderJulian +
      cajaBalances.bbva,
    [cajaBalances],
  );

  const itemBreakdown = useMemo(() => {
    const map = new Map<string, { unidades: number; ventas: number; costos: number; ganancia: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const t = itemTypeOf(item);
        const current = map.get(t) || { unidades: 0, ventas: 0, costos: 0, ganancia: 0 };
        current.unidades += 1;
        current.ventas += Number(item.itemValue || 0);
        current.costos += Number(item.fabricationCostItem || 0);
        current.ganancia += Number(item.fabricationMarginItem || 0);
        map.set(t, current);
      }
    }
    return Array.from(map.entries()).map(([item, v]) => ({
      item,
      ...v,
      pct: totals.unidades > 0 ? (v.unidades / totals.unidades) * 100 : 0,
    }));
  }, [orders, totals.unidades]);

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

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
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
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-20 p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>Economía</CardTitle>
                  <Badge variant="secondary">Panel ejecutivo</Badge>
                </div>
                <CardDescription>Vista consolidada de ventas, costos, márgenes y tendencias.</CardDescription>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <p className="text-sm text-muted-foreground">
                    Costos fijos y extras por mes se cargan en <span className="font-medium text-foreground">Gastos</span> y se
                    guardan en <span className="font-medium text-foreground">Supabase</span>.
                    En <strong>Ventas brutas</strong> se suma el total del pedido más envío imputado solo cuando el pedido
                    ya está <strong>Despachado</strong> o <strong>Seguimiento enviado</strong> en todos los ítems (tabla de
                    costos o {formatArs(ECONOMIA_ENVIO_SIN_TIPO_ARS)} si no hay método cargado). <strong>Costos ventas</strong>{' '}
                    es solo fabricación. <strong>Envíos</strong> en la tabla mensual es el monto manual en Gastos (no ese
                    envío imputado). <strong>Transferido</strong> suma lo cobrado por ítem en estado transferido más ese
                    mismo envío imputado por pedido (alineado con ventas). <strong>Rentabilidad</strong> = ventas − fijos −
                    costos ventas − gastos extras − publicidad − envíos manual. <strong>Ganancia</strong> =
                    inversiones empresa + compra dólares (mismo mes en Gastos).
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="usd-rate">Dólar referencia</Label>
                  <Input
                    id="usd-rate"
                    type="number"
                    value={usdRate}
                    disabled={economiaSettingsLoading}
                    onChange={(e) => setUsdRate(Number(e.target.value || 1))}
                  />
                  <p className="text-xs text-muted-foreground">Se guarda en Supabase (misma cuenta que los movimientos).</p>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader>
                <CardDescription>Ventas brutas</CardDescription>
                <CardTitle className="text-2xl">{formatArs(totals.ventasBrutas)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Rentabilidad total</CardDescription>
                <CardTitle className="text-2xl">{formatArs(totals.rentabilidadPesos)}</CardTitle>
                <CardDescription>Tras ajustes: {formatArs(realSummary.gananciaRealArs)}</CardDescription>
              </CardHeader>
            </Card>
            <Dialog>
              <DialogTrigger asChild>
                <Card className="cursor-pointer transition-colors hover:bg-muted/30">
                  <CardHeader>
                    <CardDescription>Rentabilidad USD</CardDescription>
                    <CardTitle className="text-2xl">{formatUsd(totals.rentabilidadPesos / (usdRate || 1))}</CardTitle>
                    <CardDescription>Tras ajustes: {formatUsd(realSummary.gananciaRealUsd)} · click para ajustar</CardDescription>
                  </CardHeader>
                </Card>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Rentabilidad tras ajustes</DialogTitle>
                  <DialogDescription>
                    Registrá compras de USD e inversiones para ver la rentabilidad después de esos movimientos.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">Rentabilidad teórica</p>
                      <p className="text-lg font-semibold">{formatArs(totals.rentabilidadPesos)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">Ajustes acumulados</p>
                      <p className="text-lg font-semibold">{formatArs(realSummary.totalAdjustmentsArs)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">Rentabilidad real</p>
                      <p className="text-lg font-semibold">{formatArs(realSummary.gananciaRealArs)}</p>
                      <p className="text-xs text-muted-foreground">{formatUsd(realSummary.gananciaRealUsd)}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Compra de USD (ahorro)</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <Label htmlFor="mov-date-usd">Fecha</Label>
                      <Input id="mov-date-usd" type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
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
                      <p className="text-xs text-muted-foreground">Impacto en pesos: {formatArs(usdPurchaseArs)}</p>
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
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Inversiones</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <Label htmlFor="mov-date-inv">Fecha</Label>
                      <Input id="mov-date-inv" type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
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
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Movimientos cargados</CardTitle>
                    <CardDescription>
                      USD acumulados: {realSummary.usdPurchased.toFixed(2)} · Ahorro en pesos: {formatArs(realSummary.byType.USD_PURCHASE)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-64 overflow-auto">
                    <div className="flex flex-col gap-2">
                      {movementsLoading ? (
                        <p className="text-sm text-muted-foreground">Cargando movimientos...</p>
                      ) : realMovements.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Todavía no hay movimientos cargados.</p>
                      ) : (
                        realMovements.map((m) => (
                          <div key={m.id} className="flex items-center justify-between rounded border p-2 text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium">{movementTypeLabel(m.type)}</span>
                              <span className="text-xs text-muted-foreground">
                                {m.date}
                                {m.type === 'USD_PURCHASE' ? ` · ${m.amountUsd?.toFixed(2)} USD a ${formatArs(m.rate || 0)}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{formatArs(m.amountArs)}</span>
                              <Button variant="ghost" size="sm" disabled={movementsLoading} onClick={() => void removeMovement(m.id)}>
                                Quitar
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Card className="cursor-pointer transition-colors hover:bg-muted/30">
                  <CardHeader>
                    <CardDescription>Pendiente de cobro</CardDescription>
                    <CardTitle className="text-2xl">{formatArs(totals.pendiente)}</CardTitle>
                    <CardDescription>Click para ver desglose</CardDescription>
                  </CardHeader>
                </Card>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Desglose pendiente de cobro</DialogTitle>
                  <DialogDescription>Detalle por estado de venta pendiente.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <PendingPieChart data={pendingSlices} />
                  <div className="flex flex-col gap-3">
                    {(['DEUDOR', 'FOTO_ENVIADA', 'SEÑADO'] as const).map((state) => {
                      const total = pendingSlices.reduce((acc, x) => acc + x.amount, 0);
                      const pct = total > 0 ? (pendingBreakdown[state].amount / total) * 100 : 0;
                      return (
                        <Card key={state}>
                          <CardContent className="flex items-center justify-between py-4">
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-medium">{pendingLabel(state)}</p>
                              <p className="text-xs text-muted-foreground">
                                {pendingBreakdown[state].count} ítems · {pct.toFixed(1)}%
                              </p>
                            </div>
                            <p className="text-lg font-semibold">{formatArs(pendingBreakdown[state].amount)}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                    <Card>
                      <CardContent className="flex items-center justify-between py-4">
                        <p className="text-sm font-medium">Total pendiente</p>
                        <p className="text-lg font-semibold">{formatArs(totals.pendiente)}</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Card className="cursor-pointer transition-colors hover:bg-muted/30">
                  <CardHeader>
                    <CardDescription>Flujo / caja</CardDescription>
                    <CardTitle className="text-2xl">
                      {economiaSettingsLoading ? '…' : formatArs(totalCajaArs)}
                    </CardTitle>
                    <CardDescription>Click para cargar montos (Supabase)</CardDescription>
                  </CardHeader>
                </Card>
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
                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="font-medium text-foreground">Total</span>
                    <span className="text-lg font-semibold">{formatArs(totalCajaArs)}</span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="mensual">
            <TabsList>
              <TabsTrigger value="mensual">Mensual</TabsTrigger>
              <TabsTrigger value="mix">Mix de ítems</TabsTrigger>
              <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
            </TabsList>

            <TabsContent value="mensual">
              <Card>
                <CardHeader>
                  <CardTitle>Registro por mes</CardTitle>
                  <CardDescription>
                    <strong>Ventas brutas</strong>: total pedido + envío imputado solo con todos los ítems en Despachado o
                    Seguimiento enviado (tabla{' '}
                    <code className="text-xs bg-muted px-1 rounded">costos_de_envio</code> o{' '}
                    {formatArs(ECONOMIA_ENVIO_SIN_TIPO_ARS)} si no hay método). <strong>Costos ventas</strong>: solo
                    fabricación. <strong>Envíos</strong>: solo lo cargado a mano en Gastos. <strong>Transf. − gastos</strong>{' '}
                    = transferido cobrado − (fijos + ventas + extras + publicidad + envíos). <strong>Transferido</strong>{' '}
                    incluye el mismo envío imputado que ventas (una vez por pedido despachado: tabla o{' '}
                    {formatArs(ECONOMIA_ENVIO_SIN_TIPO_ARS)} si no hay empresa/servicio). <strong>Inversiones</strong> =
                    inversión empresa + inversión Cyprea (Gastos, mismo mes). <strong>Rentabilidad</strong> = ventas −
                    costos listados. <strong>Ganancia</strong> = inversiones empresa + compra dólares (Gastos, mismo mes).
                    Podés expandir <strong>Gastos</strong> y <strong>Ganancias</strong> tocando el encabezado de la columna;
                    el desglose se muestra en gris. Al final hay una fila <strong>Total</strong>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table
                    className={`w-full text-sm ${mensualDetalleGastos || mensualDetalleGanancias ? 'min-w-[1280px]' : 'min-w-[880px]'}`}
                  >
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Mes</th>
                        <th className="py-2 pr-3 text-right">Ventas brutas</th>
                        {mensualDetalleGastos ? (
                          <>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Costos fijos</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Costos ventas</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Gastos extras</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Publicidad</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Envíos</th>
                          </>
                        ) : (
                          <th className="py-2 pr-3 text-right">
                            <button
                              type="button"
                              className="inline-flex w-full flex-col items-end gap-0.5 rounded-md px-1 py-0.5 text-right font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setMensualDetalleGastos(true)}
                              aria-expanded={mensualDetalleGastos}
                            >
                              <span>Gastos</span>
                              <span className="text-[10px] font-normal text-muted-foreground">Mostrar desglose</span>
                            </button>
                          </th>
                        )}
                        <th className="py-2 pr-3 text-right">Rentabilidad</th>
                        <th className="py-2 pr-3 text-right">Transferido</th>
                        <th
                          className="py-2 pr-3 text-right"
                          title="Transferido − (fijos + ventas + extras + publicidad + envíos)"
                        >
                          Transf. − gastos
                        </th>
                        <th className="py-2 pr-3 text-right">Pendiente</th>
                        {mensualDetalleGanancias ? (
                          <>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Inv. Cyprea</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Inv. empresa</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Compra USD</th>
                            <th className="py-2 pr-2 text-right text-xs font-normal text-muted-foreground">Ganancia USD</th>
                          </>
                        ) : (
                          <th className="py-2 pr-3 text-right">
                            <button
                              type="button"
                              className="inline-flex w-full flex-col items-end gap-0.5 rounded-md px-1 py-0.5 text-right font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => setMensualDetalleGanancias(true)}
                              aria-expanded={mensualDetalleGanancias}
                            >
                              <span>Ganancias</span>
                              <span className="text-[10px] font-normal text-muted-foreground">Mostrar desglose</span>
                            </button>
                          </th>
                        )}
                      </tr>
                      {(mensualDetalleGastos || mensualDetalleGanancias) && (
                        <tr className="border-b bg-muted/30">
                          <th
                            colSpan={mensualTablaCols}
                            className="py-1.5 px-3 text-left text-xs font-normal text-muted-foreground"
                          >
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              {mensualDetalleGastos && (
                                <button
                                  type="button"
                                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                  onClick={() => setMensualDetalleGastos(false)}
                                >
                                  Ocultar desglose de gastos
                                </button>
                              )}
                              {mensualDetalleGanancias && (
                                <button
                                  type="button"
                                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                  onClick={() => setMensualDetalleGanancias(false)}
                                >
                                  Ocultar desglose de ganancias
                                </button>
                              )}
                            </div>
                          </th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {monthly.map((r) => (
                        <tr key={r.key} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{r.label}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.ventasBrutas)}</td>
                          {mensualDetalleGastos ? (
                            <>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.costosFijos)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.costosVentas)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.gastosExtras)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.publicidad)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.enviosManual)}</td>
                            </>
                          ) : (
                            <td className="py-2 pr-3 text-right font-medium">{formatArs(totalGastosOperativos(r))}</td>
                          )}
                          <td className="py-2 pr-3 text-right font-medium">{formatArs(r.rentabilidadPesos)}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.transferido)}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.transferidoMenosGastos)}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.pendiente)}</td>
                          {mensualDetalleGanancias ? (
                            <>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.inversionCypreaArs)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.inversionEmpresaArs)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatArs(r.compraDolaresArs)}</td>
                              <td className="py-2 pr-2 text-right text-muted-foreground">{formatUsd(r.gananciaInversionesUsd)}</td>
                            </>
                          ) : (
                            <td className="py-2 pr-3 text-right">
                              <div className="flex flex-col items-end gap-0.5 leading-tight">
                                <span className="font-medium">{formatArs(totalGananciasGrupoArs(r))}</span>
                                <span className="text-[11px] text-muted-foreground">{formatUsd(r.gananciaInversionesUsd)}</span>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                        <td className="py-2 pr-3">
                          <span className="text-foreground">Total</span>
                        </td>
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
                            {formatArs(
                              totals.costosFijos +
                                totals.costosVentas +
                                totals.gastosExtras +
                                totals.publicidad +
                                totals.enviosManual,
                            )}
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
                    <CardTitle>Desglose de ítems vendidos</CardTitle>
                    <CardDescription>Participación en unidades y ganancia por categoría.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {itemBreakdown.map((row) => (
                      <div key={row.item} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{itemTypeLabel(row.item)}</Badge>
                            <span className="text-muted-foreground">{row.unidades} u.</span>
                          </div>
                          <span className="font-medium">{formatArs(row.ganancia)}</span>
                        </div>
                        <div className="h-2 rounded bg-muted">
                          <div className="h-2 rounded bg-primary" style={{ width: `${row.pct}%` }} />
                        </div>
                      </div>
                    ))}
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
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tendencias">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Venta bruta</CardTitle>
                    <CardDescription>{formatArs(totals.ventasBrutas)} acumulado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart values={monthly.map((m) => m.ventasBrutas)} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rentabilidad USD</CardTitle>
                    <CardDescription>
                      {formatUsd(usdRate > 0 ? totals.rentabilidadPesos / usdRate : 0)} referencia acumulada
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart values={monthly.map((m) => m.rentabilidadUsd)} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Unidades vendidas</CardTitle>
                    <CardDescription>{totals.unidades} unidades</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart values={monthly.map((m) => m.unidades)} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
