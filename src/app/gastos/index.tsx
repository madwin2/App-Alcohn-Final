import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { AppMain } from '@/components/layout/AppMain';
import { useAuth } from '@/lib/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { ChevronDown, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { BarraBronce, Panel, PanelTitle, formatArsCorto, formatPct } from '@/components/economia/controlGastosUi';
import { BotonQuitar, FilaMonto, Grupo, MesSelector, MontoInput } from '@/components/gastos/GastosUi';
import type { ValuacionMes } from '@/lib/gastos/gastosAuto';
import { cn } from '@/lib/utils/cn';
import {
  DEFAULT_VARIABLE_COSTS,
  type VariableCostsState,
} from '@/lib/gastos/variableCosts';
import {
  aguinaldoFromSueldos,
  ensureSueldosForUsers,
  getBundleForMonth,
  hydrateMonthlyCostsRuntime,
  isResumenMensual,
  newSalaryEntry,
  sueldosListsEqual,
  sumSueldos,
  totalFixedCosts,
  type ExtrasMonth,
  type FixedCostsMonth,
  type GastosPagosTracking,
  type MonthCostsBundle,
  type SalaryEntry,
} from '@/lib/gastos/monthlyEconomiaCosts';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import {
  fetchLatestFabricacionParams,
  insertFabricacionParamsVersion,
} from '@/lib/supabase/services/fabricacionParametros.service';
import { loadGastosMensualesIntoCache, upsertGastosMensualesMerged } from '@/lib/supabase/services/gastosMensuales.service';
import { GastosAutoCard } from '@/components/gastos/GastosAutoCard';
import { GastosRecurrentesCard } from '@/components/gastos/GastosRecurrentesCard';
import { useGastosAuto } from '@/lib/hooks/useGastosAuto';

export type { VariableCostsState };

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

const STORAGE_VARIABLE = 'gastos_variable_costs_v1';

/** Extras que Economía resta como gasto operativo. */
const EXTRAS_OPERATIVOS: { key: keyof ExtrasMonth; label: string }[] = [
  { key: 'publicidad', label: 'Publicidad' },
  { key: 'automatizaciones', label: 'Automatizaciones' },
  { key: 'envios', label: 'Envíos' },
  { key: 'impuestos', label: 'Impuestos' },
  { key: 'gastos_varios', label: 'Gastos varios' },
  { key: 'remodelaciones', label: 'Remodelaciones' },
];

/** Extras que Economía muestra aparte (no restan de la ganancia). */
const EXTRAS_INVERSION: { key: keyof ExtrasMonth; label: string }[] = [
  { key: 'compra_dolares', label: 'Compra de dólares' },
  { key: 'inversiones_empresa', label: 'Inversiones de la empresa' },
  { key: 'inversion_cyprea', label: 'Inversiones en Cyprea' },
];

const EXTRA_FIELDS = [...EXTRAS_OPERATIVOS, ...EXTRAS_INVERSION];

type CampoFabricacion = { key: keyof VariableCostsState; label: string; hint?: string; unidad?: string };

const GRUPOS_FABRICACION: Array<{ titulo: string; campos: CampoFabricacion[] }> = [
  {
    titulo: 'Ítems terminados',
    campos: [
      { key: 'soldador100', label: 'Soldador 100 W', hint: 'Sin amortización' },
      { key: 'soldador200', label: 'Soldador 200 W', hint: 'Sin amortización' },
      { key: 'baseRemachadora', label: 'Base remachadora', hint: 'Sin amortización' },
      { key: 'mangoGolpe', label: 'Mango de golpe', hint: 'Total' },
      { key: 'amortFresa', label: 'Amortización de fresa', hint: 'Por ítem (no aplica a mango de golpe)' },
    ],
  },
  {
    titulo: 'Bronce · $ por cm de planchuela',
    campos: [
      { key: 'planchuela12', label: '12 mm' },
      { key: 'planchuela20', label: '20 mm' },
      { key: 'planchuela25', label: '25 mm' },
      { key: 'planchuela40', label: '40 mm' },
      { key: 'planchuela63', label: '63 mm' },
    ],
  },
  {
    titulo: 'Piezas y packaging',
    campos: [
      { key: 'mangoMadera', label: 'Mango de madera' },
      { key: 'varilla', label: 'Varilla' },
      { key: 'prisionero', label: 'Prisionero' },
      { key: 'tubo', label: 'Tubo' },
      { key: 'cajaAbc', label: 'Caja plástica de abecedario' },
      { key: 'soporteAbc', label: 'Soporte de abecedario' },
    ],
  },
  {
    titulo: 'Medidas de material',
    campos: [
      { key: 'selloPerdidaCorteCm', label: 'Pérdida de corte por sello', hint: 'Se suma al largo (0,8 cm = 8 mm)', unidad: 'cm' },
      { key: 'abcCmSimple', label: 'Abecedario: mayúsculas o minúsculas', unidad: 'cm' },
      { key: 'abcCmAmbas', label: 'Abecedario: mayúsculas y minúsculas', unidad: 'cm' },
    ],
  },
];

const COLOR_PARTE = {
  fijos: 'bg-white/70',
  publicidad: 'bg-[#e0812f]',
  automatizaciones: 'bg-white/35',
  otros: 'bg-white/15',
} as const;

/** Gasto operativo de un mes (mismo criterio que Economía) partido en grupos para la barra. */
function resumenGastoMes(b: MonthCostsBundle, auto: ValuacionMes | undefined) {
  if (isResumenMensual(b)) {
    return { total: Number(b.gastos_reales) || 0, partes: [] as Array<{ label: string; monto: number; color: string }> };
  }
  const e = b.extras;
  const n = (v: number | undefined) => Number(v) || 0;
  const fijos = totalFixedCosts(b.fixed);
  const publicidad = n(e.publicidad) + n(auto?.porCategoria.publicidad);
  const automatizaciones = n(e.automatizaciones) + n(auto?.porCategoria.automatizaciones);
  const otros =
    n(e.envios) + n(e.impuestos) + n(e.gastos_varios) + n(e.remodelaciones) + n(auto?.porCategoria.gastos_varios) + n(auto?.impuestosExtra);
  const partes = [
    { label: 'Sueldos y fijos', monto: fijos, color: COLOR_PARTE.fijos },
    { label: 'Publicidad', monto: publicidad, color: COLOR_PARTE.publicidad },
    { label: 'Automatizaciones', monto: automatizaciones, color: COLOR_PARTE.automatizaciones },
    { label: 'Otros', monto: otros, color: COLOR_PARTE.otros },
  ];
  return { total: partes.reduce((s, p) => s + p.monto, 0), partes };
}

function mesAnteriorKey(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const FIXED_MONTO_ROWS: { key: keyof FixedCostsMonth; label: string }[] = [
  { key: 'monotributos', label: 'Monotributos' },
  { key: 'contador', label: 'Contador' },
  { key: 'alquiler', label: 'Alquiler' },
  { key: 'seguro', label: 'Seguro' },
  { key: 'credito', label: 'Crédito' },
];

const SERVICIO_ROWS: { key: keyof FixedCostsMonth; label: string }[] = [
  { key: 'electricidad', label: 'Electricidad' },
  { key: 'agua', label: 'Agua' },
  { key: 'internet', label: 'Internet' },
];

function formatEffectiveLabel(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return 'Sin fecha de vigencia';
    return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function packPagos(
  fixed: Record<string, boolean>,
  sueldos: Record<string, boolean>,
  extras: Partial<Record<keyof ExtrasMonth, boolean>>,
): GastosPagosTracking | undefined {
  const f = Object.fromEntries(Object.entries(fixed).filter(([, v]) => v === true));
  const s = Object.fromEntries(Object.entries(sueldos).filter(([, v]) => v === true));
  const e = Object.fromEntries(Object.entries(extras).filter(([, v]) => v === true)) as Partial<
    Record<keyof ExtrasMonth, boolean>
  >;
  if (!Object.keys(f).length && !Object.keys(s).length && !Object.keys(e).length) return undefined;
  return { fixed: f, sueldos: s, extras: e };
}

function withPagos(
  b: MonthCostsBundle,
  fn: (
    fixed: Record<string, boolean>,
    sueldos: Record<string, boolean>,
    extras: Partial<Record<keyof ExtrasMonth, boolean>>,
  ) => void,
): MonthCostsBundle {
  const fixed = { ...(b.pagos?.fixed ?? {}) };
  const sueldos = { ...(b.pagos?.sueldos ?? {}) };
  const extras = { ...(b.pagos?.extras ?? {}) } as Partial<Record<keyof ExtrasMonth, boolean>>;
  fn(fixed, sueldos, extras);
  const pagos = packPagos(fixed, sueldos, extras);
  return { ...b, pagos };
}

/** Convierte valor de input datetime-local a ISO; vacío = undefined (usa ahora al guardar). */
function localDatetimeToIso(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
};

/** Ej. "2026-05" → "mayo de 2026" */
function formatMonthKeyLong(key: string): string {
  const [yStr, mStr] = key.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return key;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
}

export default function GastosPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [variable, setVariable] = useState<VariableCostsState>(DEFAULT_VARIABLE_COSTS);
  const [monthlyByMonth, setMonthlyByMonth] = useState<Record<string, MonthCostsBundle>>({});
  const [legacyFixedScalar, setLegacyFixedScalar] = useState(0);
  const [monthlyFromDbReady, setMonthlyFromDbReady] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [lastSynced, setLastSynced] = useState<{ effectiveFrom: string; note: string | null } | null>(null);
  const [vigenteDesdeLocal, setVigenteDesdeLocal] = useState('');

  const [approvedUsers, setApprovedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [approvedUsersLoading, setApprovedUsersLoading] = useState(true);
  const [fabricacionAbierta, setFabricacionAbierta] = useState(false);
  const latestMonthlyRef = useRef<Record<string, MonthCostsBundle>>({});
  const latestLegacyRef = useRef(0);
  const skipNextPersistRef = useRef(false);

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;
  const gastosAuto = useGastosAuto(isAllowed);

  const appUserIdSet = useMemo(() => new Set(approvedUsers.map((u) => u.id)), [approvedUsers]);

  const isAppUserSueldo = useCallback((sueldoId: string) => appUserIdSet.has(sueldoId), [appUserIdSet]);

  useEffect(() => {
    if (authLoading || !isAllowed || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGastosMensualesIntoCache(user.id);
        if (cancelled) return;
        skipNextPersistRef.current = true;
        setMonthlyByMonth(data.months);
        setLegacyFixedScalar(data.legacyFixedScalar);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // No vaciar la caché en memoria: Economía puede estar usándola.
        toast({
          title: 'No se pudieron cargar los gastos mensuales',
          description: msg,
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setMonthlyFromDbReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, user?.id, toast]);

  useEffect(() => {
    if (!isAllowed) {
      setApprovedUsers([]);
      setApprovedUsersLoading(false);
      return;
    }
    let cancelled = false;
    setApprovedUsersLoading(true);
    getApprovedUsers()
      .then((users) => {
        if (!cancelled) setApprovedUsers(users);
      })
      .catch(() => {
        if (!cancelled) setApprovedUsers([]);
      })
      .finally(() => {
        if (!cancelled) setApprovedUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAllowed]);

  useEffect(() => {
    if (!isAllowed || !monthlyFromDbReady || approvedUsers.length === 0) return;

    setMonthlyByMonth((prev) => {
      const cur = getBundleForMonth(prev, selectedMonth);
      const nextFixedSueldos = ensureSueldosForUsers(cur.fixed.sueldos, approvedUsers);

      if (sueldosListsEqual(cur.fixed.sueldos, nextFixedSueldos)) {
        return prev;
      }

      return {
        ...prev,
        [selectedMonth]: {
          ...cur,
          fixed: { ...cur.fixed, sueldos: nextFixedSueldos },
        },
      };
    });
  }, [approvedUsers, selectedMonth, isAllowed, monthlyFromDbReady]);

  useEffect(() => {
    if (!monthlyFromDbReady) return;
    hydrateMonthlyCostsRuntime(monthlyByMonth, legacyFixedScalar);
  }, [monthlyByMonth, legacyFixedScalar, monthlyFromDbReady]);

  useEffect(() => {
    latestMonthlyRef.current = monthlyByMonth;
    latestLegacyRef.current = legacyFixedScalar;
  }, [monthlyByMonth, legacyFixedScalar]);

  const persistMonthlyNow = useCallback(async () => {
    if (!monthlyFromDbReady || !isAllowed || !user?.id) return;
    const local = latestMonthlyRef.current;
    const merged = await upsertGastosMensualesMerged(user.id, local, latestLegacyRef.current);
    latestMonthlyRef.current = merged;
    hydrateMonthlyCostsRuntime(merged, latestLegacyRef.current);
    if (JSON.stringify(local) !== JSON.stringify(merged)) {
      skipNextPersistRef.current = true;
      setMonthlyByMonth(merged);
    }
  }, [monthlyFromDbReady, isAllowed, user?.id]);

  useEffect(() => {
    if (!monthlyFromDbReady || !isAllowed || !user?.id) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void persistMonthlyNow().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: 'No se pudieron guardar los gastos mensuales',
          description: msg,
          variant: 'destructive',
        });
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [monthlyByMonth, legacyFixedScalar, monthlyFromDbReady, isAllowed, user?.id, toast, persistMonthlyNow]);

  useEffect(() => {
    if (!monthlyFromDbReady || !isAllowed || !user?.id) return;

    const flushOnBackground = () => {
      if (document.visibilityState === 'hidden') {
        void persistMonthlyNow();
      }
    };
    const flushOnPageHide = () => {
      void persistMonthlyNow();
    };

    document.addEventListener('visibilitychange', flushOnBackground);
    window.addEventListener('pagehide', flushOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', flushOnBackground);
      window.removeEventListener('pagehide', flushOnPageHide);
    };
  }, [monthlyFromDbReady, isAllowed, user?.id, persistMonthlyNow]);

  useEffect(() => {
    localStorage.setItem(STORAGE_VARIABLE, JSON.stringify(variable));
  }, [variable]);

  useEffect(() => {
    if (authLoading || !isAllowed) return;
    let cancelled = false;
    (async () => {
      setParamsLoading(true);
      try {
        const latest = await fetchLatestFabricacionParams();
        if (cancelled) return;
        if (latest) {
          setVariable(latest.params);
          setLastSynced({ effectiveFrom: latest.effectiveFrom, note: latest.note });
        } else {
          const vRaw = localStorage.getItem(STORAGE_VARIABLE);
          if (vRaw) {
            try {
              const parsed = JSON.parse(vRaw) as Partial<VariableCostsState>;
              setVariable({ ...DEFAULT_VARIABLE_COSTS, ...parsed });
            } catch {
              /* empty */
            }
          }
          setLastSynced(null);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const vRaw = localStorage.getItem(STORAGE_VARIABLE);
        if (vRaw) {
          try {
            const parsed = JSON.parse(vRaw) as Partial<VariableCostsState>;
            setVariable({ ...DEFAULT_VARIABLE_COSTS, ...parsed });
          } catch {
            /* empty */
          }
        }
        toast({
          title: 'No se pudieron cargar los costos desde Supabase',
          description: msg,
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setParamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed]);

  const bundle = useMemo(() => getBundleForMonth(monthlyByMonth, selectedMonth), [monthlyByMonth, selectedMonth]);

  const setBundleForMonth = (patch: Partial<MonthCostsBundle> | ((prev: MonthCostsBundle) => MonthCostsBundle)) => {
    setMonthlyByMonth((prev) => {
      const cur = getBundleForMonth(prev, selectedMonth);
      const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch };
      return { ...prev, [selectedMonth]: next };
    });
  };

  const updateFixed = (patch: Partial<FixedCostsMonth>) => {
    setBundleForMonth((b) => ({ ...b, fixed: { ...b.fixed, ...patch } }));
  };

  const updateExtras = (patch: Partial<ExtrasMonth>) => {
    setBundleForMonth((b) => ({ ...b, extras: { ...b.extras, ...patch } }));
  };

  const setSueldos = (sueldos: SalaryEntry[]) => updateFixed({ sueldos });

  const addSueldo = () => {
    setSueldos([...bundle.fixed.sueldos, newSalaryEntry()]);
  };

  const patchSueldo = (id: string, patch: Partial<SalaryEntry>) => {
    setSueldos(bundle.fixed.sueldos.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSueldo = (id: string) => {
    setSueldos(bundle.fixed.sueldos.filter((s) => s.id !== id));
  };

  const totalFijos = totalFixedCosts(bundle.fixed);
  const aguinaldo = aguinaldoFromSueldos(bundle.fixed.sueldos);
  const sueldosSum = sumSueldos(bundle.fixed.sueldos);
  const esResumen = isResumenMensual(bundle);
  const inicioAuto = gastosAuto.data?.config.fechaInicio;
  const mesConGastosAuto = !!inicioAuto && selectedMonth >= inicioAuto.slice(0, 7);
  const gastosManualesOperativos = EXTRAS_OPERATIVOS.reduce((s, f) => s + (Number(bundle.extras[f.key]) || 0), 0);
  const inversionesMes = EXTRAS_INVERSION.reduce((s, f) => s + (Number(bundle.extras[f.key]) || 0), 0);
  const resumenMes = resumenGastoMes(bundle, gastosAuto.porMes[selectedMonth]);
  const keyAnterior = mesAnteriorKey(selectedMonth);
  const resumenMesAnterior = {
    ...resumenGastoMes(getBundleForMonth(monthlyByMonth, keyAnterior), gastosAuto.porMes[keyAnterior]),
    etiqueta: formatMonthKeyLong(keyAnterior).split(' de ')[0],
  };

  const pagosResumen = useMemo(() => {
    const pg = bundle.pagos;
    let totalAPagarArs = 0;
    let totalPagadoArs = 0;
    const add = (amount: number, isPaid: boolean) => {
      const a = Number(amount) || 0;
      if (a <= 0) return;
      totalAPagarArs += a;
      if (isPaid) totalPagadoArs += a;
    };
    for (const { key } of FIXED_MONTO_ROWS) add(Number(bundle.fixed[key]) || 0, !!pg?.fixed?.[key as string]);
    for (const { key } of SERVICIO_ROWS) add(Number(bundle.fixed[key]) || 0, !!pg?.fixed?.[key as string]);
    add(aguinaldo, !!pg?.fixed?.aguinaldo);
    for (const s of bundle.fixed.sueldos) add(Number(s.monto) || 0, !!pg?.sueldos?.[s.id]);
    for (const f of EXTRA_FIELDS) add(Number(bundle.extras[f.key]) || 0, !!pg?.extras?.[f.key]);
    const pctMonto =
      totalAPagarArs > 0 ? Math.min(100, Math.round((totalPagadoArs / totalAPagarArs) * 100)) : 0;
    return { totalAPagarArs, totalPagadoArs, pctMonto };
  }, [bundle, aguinaldo]);

  const mesActualKey = currentMonthKey();
  const esMesActual = selectedMonth === mesActualKey;
  const etiquetaMesSeleccionado = formatMonthKeyLong(selectedMonth);

  const updateVariable = (patch: Partial<VariableCostsState>) => {
    setVariable((v) => ({ ...v, ...patch }));
  };

  const handleGuardarCostosDb = async () => {
    setParamsSaving(true);
    try {
      const effectiveIso = localDatetimeToIso(vigenteDesdeLocal);
      await insertFabricacionParamsVersion(variable, {
        effectiveFromIso: effectiveIso,
        note: 'App Gastos',
      });
      const latest = await fetchLatestFabricacionParams();
      if (latest) {
        setLastSynced({ effectiveFrom: latest.effectiveFrom, note: latest.note });
        setVariable(latest.params);
      }
      setVigenteDesdeLocal('');
      toast({
        title: 'Costos guardados en Supabase',
        description: 'Se creó una nueva versión de parámetros. Los sellos nuevos usarán esta tarifa según la fecha de vigencia.',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Error al guardar',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setParamsSaving(false);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  const paramsDisabled = paramsLoading || paramsSaving;
  const etiquetaCorta = etiquetaMesSeleccionado.charAt(0).toUpperCase() + etiquetaMesSeleccionado.slice(1);

  const pagadoSueldo = (id: string) => !!bundle.pagos?.sueldos?.[id];
  const setPagadoFijo = (key: string, v: boolean) =>
    setBundleForMonth((b) =>
      withPagos(b, (fixed) => {
        if (v) fixed[key] = true;
        else delete fixed[key];
      }),
    );
  const setPagadoExtra = (key: keyof ExtrasMonth, v: boolean) =>
    setBundleForMonth((b) =>
      withPagos(b, (_f, _s, extras) => {
        if (v) extras[key] = true;
        else delete extras[key];
      }),
    );
  const setPagadoSueldo = (id: string, v: boolean) =>
    setBundleForMonth((b) =>
      withPagos(b, (_f, sueldos) => {
        if (v) sueldos[id] = true;
        else delete sueldos[id];
      }),
    );

  const pistaExtra = (key: keyof ExtrasMonth): string | undefined => {
    if (!mesConGastosAuto) return undefined;
    if (key === 'publicidad') return 'Meta y Google se suman solos; acá, solo otra publicidad';
    if (key === 'automatizaciones') return 'OpenAI y recurrentes se suman solos';
    if (key === 'impuestos') return 'Los de los dólares automáticos se suman solos';
    return undefined;
  };

  return (
    <AppMain className="flex min-h-screen flex-col">
      <div className="w-full max-w-[1920px] flex-1 space-y-4 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <header className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Gastos</h1>
            <p className="mt-1 text-sm text-muted-foreground">Lo que cuesta mantener Alcohn cada mes. Todo lo que cargás acá alimenta Economía.</p>
          </div>
          <MesSelector mes={selectedMonth} etiqueta={etiquetaCorta} onChange={setSelectedMonth} mesActual={mesActualKey} />
        </header>

        {esResumen ? (
          <Panel className="bg-amber-500/[0.06]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <h3 className="text-[15px] font-medium">Mes con cierre histórico</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Economía usa el gasto real total de este mes y no vuelve a sumar fabricación, fijos ni extras. No hace
                  falta cargar el detalle.
                </p>
              </div>
              <div className="w-56">
                <p className="mb-1.5 text-[13px] text-muted-foreground">Gasto real del mes</p>
                <MontoInput
                  ariaLabel="Gasto real del mes"
                  value={Number(bundle.gastos_reales) || 0}
                  onChange={(n) => setBundleForMonth((prev) => ({ ...prev, fuente: 'resumen', gastos_reales: Math.max(0, n) }))}
                />
              </div>
            </div>
          </Panel>
        ) : null}

        {/* ---------- Resumen del mes ---------- */}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
          <Panel className="lg:col-span-2 xl:col-span-6">
            <p className="text-[13px] text-muted-foreground">Gasto de {etiquetaMesSeleccionado}</p>
            <p className="mt-2 text-5xl font-semibold tabular-nums tracking-tight">{formatArsCorto(resumenMes.total)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {esResumen ? 'Cierre histórico cargado a mano' : 'Fijos, sueldos y gastos del mes, con los automáticos incluidos'}
            </p>
            {!esResumen && resumenMes.total > 0 ? (
              <>
                <div className="mt-6 flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  {resumenMes.partes.map((p) =>
                    p.monto > 0 ? (
                      <div key={p.label} className={cn('h-full', p.color)} style={{ width: `${(p.monto / resumenMes.total) * 100}%` }} />
                    ) : null,
                  )}
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                  {resumenMes.partes.map((p) => (
                    <li key={p.label} className="min-w-0">
                      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <span className={cn('size-2 shrink-0 rounded-full', p.color)} aria-hidden />
                        <span className="truncate">{p.label}</span>
                      </div>
                      <p className="mt-0.5 text-sm tabular-nums">
                        {formatArsCorto(p.monto)}
                        <span className="ml-1.5 text-xs text-muted-foreground">{formatPct(p.monto / resumenMes.total)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Panel>

          <Panel className="flex flex-col xl:col-span-3">
            <p className="text-[13px] text-muted-foreground">Contra {resumenMesAnterior.etiqueta}</p>
            {resumenMesAnterior.total > 0 && resumenMes.total > 0 ? (
              <>
                <p
                  className={cn(
                    'mt-2 text-4xl font-semibold tabular-nums tracking-tight',
                    resumenMes.total > resumenMesAnterior.total ? 'text-red-300' : 'text-emerald-300',
                  )}
                >
                  {resumenMes.total >= resumenMesAnterior.total ? '+' : '−'}
                  {formatPct(Math.abs(resumenMes.total / resumenMesAnterior.total - 1))}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatArsCorto(Math.abs(resumenMes.total - resumenMesAnterior.total))}{' '}
                  {resumenMes.total >= resumenMesAnterior.total ? 'más' : 'menos'} que los {formatArsCorto(resumenMesAnterior.total)} del mes anterior
                </p>
                {esMesActual ? (
                  <p className="mt-auto pt-4 text-xs text-muted-foreground">El mes en curso todavía puede sumar gastos.</p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Sin datos para comparar.</p>
            )}
          </Panel>

          <Panel className="flex flex-col xl:col-span-3">
            <p className="text-[13px] text-muted-foreground">Pagos marcados</p>
            {pagosResumen.totalAPagarArs > 0 ? (
              <>
                <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">{pagosResumen.pctMonto} %</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatArsCorto(pagosResumen.totalPagadoArs)} de {formatArsCorto(pagosResumen.totalAPagarArs)}
                </p>
                <BarraBronce className="mt-5" valor={pagosResumen.pctMonto / 100} />
                <p className="mt-auto pt-4 text-xs text-muted-foreground">
                  {pagosResumen.totalAPagarArs - pagosResumen.totalPagadoArs > 0
                    ? `Falta pagar ${formatArsCorto(pagosResumen.totalAPagarArs - pagosResumen.totalPagadoArs)}. Marcá cada gasto con ✓.`
                    : 'Todo lo cargado a mano está pago.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Todavía no hay gastos cargados a mano este mes.</p>
            )}
          </Panel>
        </div>

        {/* ---------- Automáticos ---------- */}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12 lg:items-start">
          <div className="xl:col-span-7">
            <GastosAutoCard
              mes={selectedMonth}
              etiquetaMes={etiquetaCorta}
              valuacion={gastosAuto.porMes[selectedMonth]}
              data={gastosAuto.data}
              blueHoy={gastosAuto.blueHoy}
              loading={gastosAuto.loading}
              error={gastosAuto.error}
              onReload={gastosAuto.reload}
            />
          </div>
          <div className="xl:col-span-5">
            <GastosRecurrentesCard onChanged={gastosAuto.reload} />
          </div>
        </div>

        {/* ---------- Carga a mano ---------- */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Panel>
            <PanelTitle
              title="Sueldos y gastos fijos"
              sub="Se cargan a mano cada mes · ✓ para marcar pagado"
              right={<span className="text-lg font-semibold tabular-nums">{formatArsCorto(totalFijos)}</span>}
            />
            <Grupo titulo="Sueldos" total={formatArsCorto(sueldosSum + aguinaldo)}>
              {approvedUsersLoading ? (
                <p className="py-2 text-sm text-muted-foreground">Cargando equipo…</p>
              ) : (
                bundle.fixed.sueldos.map((s) => {
                  const appRow = isAppUserSueldo(s.id);
                  return (
                    <FilaMonto
                      key={s.id}
                      label={
                        appRow ? (
                          s.nombre
                        ) : (
                          <input
                            aria-label="Nombre"
                            className="w-full bg-transparent outline-none placeholder:text-muted-foreground/60"
                            placeholder="Nombre"
                            value={s.nombre}
                            onChange={(e) => patchSueldo(s.id, { nombre: e.target.value })}
                          />
                        )
                      }
                      value={Number(s.monto) || 0}
                      onChange={(n) => patchSueldo(s.id, { monto: n })}
                      pagado={pagadoSueldo(s.id)}
                      onPagadoChange={(v) => setPagadoSueldo(s.id, v)}
                      extra={appRow ? null : <BotonQuitar onClick={() => removeSueldo(s.id)} label="Quitar sueldo" />}
                    />
                  );
                })
              )}
              <FilaMonto
                label="Aguinaldo"
                sub="Provisión mensual: sueldos ÷ 12"
                value={aguinaldo}
                soloLectura
                pagado={!!bundle.pagos?.fixed?.aguinaldo}
                onPagadoChange={(v) => setPagadoFijo('aguinaldo', v)}
              />
              <div className="pt-2">
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full px-3 text-xs text-muted-foreground" onClick={addSueldo}>
                  <Plus className="size-3.5" aria-hidden />
                  Agregar otro sueldo
                </Button>
              </div>
            </Grupo>
            <Grupo titulo="Fijos" total={formatArsCorto(FIXED_MONTO_ROWS.reduce((s, r) => s + (Number(bundle.fixed[r.key]) || 0), 0))}>
              {FIXED_MONTO_ROWS.map(({ key, label }) => (
                <FilaMonto
                  key={key}
                  label={label}
                  value={Number(bundle.fixed[key]) || 0}
                  onChange={(n) => updateFixed({ [key]: n } as Partial<FixedCostsMonth>)}
                  pagado={!!bundle.pagos?.fixed?.[key as string]}
                  onPagadoChange={(v) => setPagadoFijo(key as string, v)}
                />
              ))}
            </Grupo>
            <Grupo titulo="Servicios" total={formatArsCorto(SERVICIO_ROWS.reduce((s, r) => s + (Number(bundle.fixed[r.key]) || 0), 0))}>
              {SERVICIO_ROWS.map(({ key, label }) => (
                <FilaMonto
                  key={key}
                  label={label}
                  value={Number(bundle.fixed[key]) || 0}
                  onChange={(n) => updateFixed({ [key]: n } as Partial<FixedCostsMonth>)}
                  pagado={!!bundle.pagos?.fixed?.[key as string]}
                  onPagadoChange={(v) => setPagadoFijo(key as string, v)}
                />
              ))}
            </Grupo>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel>
              <PanelTitle
                title="Otros gastos del mes"
                sub="Lo que no se carga solo"
                right={<span className="text-lg font-semibold tabular-nums">{formatArsCorto(gastosManualesOperativos)}</span>}
              />
              <Grupo titulo="Gastos">
                {EXTRAS_OPERATIVOS.map((f) => (
                  <FilaMonto
                    key={f.key}
                    label={f.label}
                    sub={pistaExtra(f.key)}
                    value={Number(bundle.extras[f.key]) || 0}
                    onChange={(n) => updateExtras({ [f.key]: n } as Partial<ExtrasMonth>)}
                    pagado={!!bundle.pagos?.extras?.[f.key]}
                    onPagadoChange={(v) => setPagadoExtra(f.key, v)}
                  />
                ))}
              </Grupo>
            </Panel>

            <Panel>
              <PanelTitle
                title="Inversiones y ahorro"
                sub="No son gastos del negocio: Economía los muestra aparte, no restan de la ganancia"
                right={<span className="text-lg font-semibold tabular-nums">{formatArsCorto(inversionesMes)}</span>}
              />
              <div className="divide-y divide-white/[0.04]">
                {EXTRAS_INVERSION.map((f) => (
                  <FilaMonto
                    key={f.key}
                    label={f.label}
                    value={Number(bundle.extras[f.key]) || 0}
                    onChange={(n) => updateExtras({ [f.key]: n } as Partial<ExtrasMonth>)}
                    pagado={!!bundle.pagos?.extras?.[f.key]}
                    onPagadoChange={(v) => setPagadoExtra(f.key, v)}
                  />
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* ---------- Costos de fabricación ---------- */}
        <Panel>
          <button type="button" onClick={() => setFabricacionAbierta((v) => !v)} className="flex w-full items-center justify-between gap-4 text-left">
            <div>
              <h3 className="text-[15px] font-medium">Costos de fabricación por unidad</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Bronce, piezas y packaging con los que se calcula el costo de cada sello
                {lastSynced ? ` · vigentes desde ${formatEffectiveLabel(lastSynced.effectiveFrom)}` : ''}
              </p>
            </div>
            <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground transition-transform', fabricacionAbierta && 'rotate-180')} aria-hidden />
          </button>

          {fabricacionAbierta ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-x-10 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
                {GRUPOS_FABRICACION.map((g) => (
                  <Grupo key={g.titulo} titulo={g.titulo}>
                    {g.campos.map((c) => (
                      <div key={c.key} className="flex items-center gap-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{c.label}</p>
                          {c.hint ? <p className="truncate text-xs text-muted-foreground">{c.hint}</p> : null}
                        </div>
                        <MontoInput
                          className="w-36 shrink-0"
                          ariaLabel={c.label}
                          prefijo={c.unidad ?? '$'}
                          value={Number(variable[c.key]) || 0}
                          onChange={(n) => updateVariable({ [c.key]: n } as Partial<VariableCostsState>)}
                          disabled={paramsDisabled}
                        />
                      </div>
                    ))}
                  </Grupo>
                ))}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-white/[0.03] p-4">
                <p className="max-w-xl text-xs text-muted-foreground">
                  Guardar crea una versión nueva: los sellos se costean con la tarifa vigente cuando se cargaron, así que los
                  meses anteriores no cambian.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Vigente desde (vacío = ahora)</p>
                    <input
                      type="datetime-local"
                      className="h-9 rounded-lg bg-white/[0.04] px-3 text-sm outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50"
                      disabled={paramsDisabled}
                      value={vigenteDesdeLocal}
                      onChange={(e) => setVigenteDesdeLocal(e.target.value)}
                    />
                  </div>
                  <Button type="button" className="h-9 rounded-full px-5" onClick={handleGuardarCostosDb} disabled={paramsDisabled}>
                    {paramsSaving ? 'Guardando…' : paramsLoading ? 'Cargando…' : 'Guardar nueva versión'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
      <Toaster />
    </AppMain>
  );
}
