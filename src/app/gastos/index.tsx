import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { AppMain } from '@/components/layout/AppMain';
import { useAuth } from '@/lib/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart3 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  DEFAULT_VARIABLE_COSTS,
  type VariableCostsState,
} from '@/lib/gastos/variableCosts';
import {
  aguinaldoFromSueldos,
  emptyBundle,
  ensureSueldosForUsers,
  gastosExtrasSinEnvioParaEconomia,
  getBundleForMonth,
  hydrateMonthlyCostsRuntime,
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
import { loadGastosMensualesIntoCache, upsertGastosMensuales } from '@/lib/supabase/services/gastosMensuales.service';

export type { VariableCostsState };

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

const STORAGE_VARIABLE = 'gastos_variable_costs_v1';

const EXTRA_FIELDS: { key: keyof ExtrasMonth; label: string }[] = [
  { key: 'publicidad', label: 'Publicidad' },
  { key: 'envios', label: 'Envíos' },
  { key: 'inversiones_empresa', label: 'Inversiones de la empresa' },
  { key: 'compra_dolares', label: 'Compra de dólares' },
  { key: 'gastos_varios', label: 'Gastos varios' },
  { key: 'automatizaciones', label: 'Automatizaciones' },
  { key: 'remodelaciones', label: 'Remodelaciones' },
  { key: 'impuestos', label: 'Impuestos' },
  { key: 'inversion_cyprea', label: 'Inversiones en Cyprea' },
];

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

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

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

function NumberField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <input
        className="w-full bg-background border rounded-md px-3 py-2 text-sm disabled:opacity-50"
        type="number"
        inputMode="decimal"
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function GastoMontoRow({
  label,
  value,
  onChange,
  hint,
  disabled,
  paid,
  onPaidChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  disabled?: boolean;
  paid?: boolean;
  onPaidChange?: (paid: boolean) => void;
}) {
  return (
    <div className="flex gap-2 rounded-md border border-border/50 bg-muted/5 p-2 sm:items-end">
      <div className="min-w-0 flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <input
          className="w-full bg-background border rounded-md px-2.5 py-1.5 text-sm disabled:opacity-50"
          type="number"
          inputMode="decimal"
          disabled={disabled}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      {onPaidChange ? (
        <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1 border-l border-border/40 pl-2 pt-0.5 text-muted-foreground select-none">
          <Checkbox checked={!!paid} onCheckedChange={(c) => onPaidChange(c === true)} disabled={disabled} />
          <span className="text-[10px] leading-tight">Pagado</span>
        </label>
      ) : null}
    </div>
  );
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
  const [proyeccionOpen, setProyeccionOpen] = useState(false);
  const latestMonthlyRef = useRef<Record<string, MonthCostsBundle>>({});
  const latestLegacyRef = useRef(0);

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  const appUserIdSet = useMemo(() => new Set(approvedUsers.map((u) => u.id)), [approvedUsers]);

  const isAppUserSueldo = useCallback((sueldoId: string) => appUserIdSet.has(sueldoId), [appUserIdSet]);

  useEffect(() => {
    if (authLoading || !isAllowed || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGastosMensualesIntoCache(user.id);
        if (cancelled) return;
        setMonthlyByMonth(data.months);
        setLegacyFixedScalar(data.legacyFixedScalar);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        hydrateMonthlyCostsRuntime({}, 0);
        setMonthlyByMonth({});
        setLegacyFixedScalar(0);
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
    await upsertGastosMensuales(user.id, latestMonthlyRef.current, latestLegacyRef.current);
  }, [monthlyFromDbReady, isAllowed, user?.id]);

  useEffect(() => {
    if (!monthlyFromDbReady || !isAllowed || !user?.id) return;
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
  const extrasSinEnvio = gastosExtrasSinEnvioParaEconomia(bundle.extras);
  const totalExtrasAll = EXTRA_FIELDS.reduce((s, f) => s + (bundle.extras[f.key] || 0), 0);
  const totalProyectadoMes = totalFijos + totalExtrasAll;

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

  return (
    <AppMain className="flex min-h-screen flex-col">
        <div className="w-full max-w-[1920px] flex-1 space-y-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <header className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">Gastos</h1>
            <p className="truncate text-sm text-muted-foreground sm:max-w-xl sm:text-right">
              Fijos y extras por mes (Economía) · Tarifas de fabricación en otra tabla.
            </p>
          </header>

          <Dialog open={proyeccionOpen} onOpenChange={setProyeccionOpen}>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Proyección de gasto — {etiquetaMesSeleccionado}</DialogTitle>
                <DialogDescription>
                  Total mensual operativo según lo cargado abajo (costos fijos del mes + todas las categorías extras).
                  Los costos variables de fabricación son montos por unidad y no se suman acá.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 text-sm">
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Costos fijos</h4>
                  <ul className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2">
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Monotributos</span>
                      <span className="font-mono tabular-nums">{formatArs(bundle.fixed.monotributos)}</span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Contador + alquiler + seguro + crédito</span>
                      <span className="font-mono tabular-nums">
                        {formatArs(
                          bundle.fixed.contador +
                            bundle.fixed.alquiler +
                            bundle.fixed.seguro +
                            bundle.fixed.credito,
                        )}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Electricidad + agua + internet</span>
                      <span className="font-mono tabular-nums">
                        {formatArs(bundle.fixed.electricidad + bundle.fixed.agua + bundle.fixed.internet)}
                      </span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Sueldos (suma)</span>
                      <span className="font-mono tabular-nums">{formatArs(sueldosSum)}</span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Aguinaldo (sueldos ÷ 12)</span>
                      <span className="font-mono tabular-nums">{formatArs(aguinaldo)}</span>
                    </li>
                    <li className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                      <span>Subtotal costos fijos</span>
                      <span className="font-mono tabular-nums text-foreground">{formatArs(totalFijos)}</span>
                    </li>
                  </ul>
                </section>
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gastos extras</h4>
                  <ul className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2">
                    {EXTRA_FIELDS.map((f) => (
                      <li key={f.key} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          {f.label}
                          {bundle.pagos?.extras?.[f.key] ? (
                            <span className="ml-1.5 text-[10px] font-normal text-emerald-500">pagado</span>
                          ) : null}
                        </span>
                        <span className="font-mono tabular-nums">{formatArs(bundle.extras[f.key] || 0)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                      <span>Subtotal extras</span>
                      <span className="font-mono tabular-nums text-foreground">{formatArs(totalExtrasAll)}</span>
                    </li>
                  </ul>
                </section>
                <div className="rounded-lg bg-primary/10 px-4 py-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gasto mensual proyectado</p>
                  <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{formatArs(totalProyectadoMes)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Fijos + extras (todas las categorías)</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:items-stretch">
            <Card className="border-border/70 shadow-sm lg:col-span-1">
              <CardHeader className="space-y-0 p-3 pb-2">
                <CardTitle className="text-sm font-semibold leading-none">Mes a editar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-3 pt-0">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Calendario</Label>
                  <input
                    className="w-full min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="secondary" size="sm" className="h-8 flex-1 text-xs" onClick={() => setSelectedMonth(mesActualKey)}>
                    Mes actual
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    onClick={() => {
                      if (!monthlyByMonth[selectedMonth]) {
                        setMonthlyByMonth((m) => ({ ...m, [selectedMonth]: emptyBundle() }));
                      }
                    }}
                  >
                    Inicializar vacío
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">{etiquetaMesSeleccionado}</span>
                  {esMesActual ? (
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Actual
                    </Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3 lg:col-span-4 lg:grid lg:grid-cols-2 lg:gap-3">
              <button
                type="button"
                onClick={() => setProyeccionOpen(true)}
                className="flex flex-col rounded-lg border border-primary/30 bg-card p-4 text-left shadow-sm outline-none ring-offset-background transition hover:border-primary/50 hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gasto proyectado</span>
                  <BarChart3 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">{formatArs(totalProyectadoMes)}</p>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Fijos + extras del mes · Click para desglose (fabricación no entra).
                </p>
              </button>

              <Card className="border-border/60 shadow-sm">
                <CardHeader className="space-y-0 border-b border-border/40 px-3 py-2">
                  <CardTitle className="text-sm font-medium">Seguimiento de pagos</CardTitle>
                  <CardDescription className="text-[10px] leading-tight">
                    Marcá «Pagado» abajo · no afecta Economía
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-3">
                  {pagosResumen.totalAPagarArs <= 0 ? (
                    <p className="py-1 text-center text-xs text-muted-foreground">Sin montos este mes</p>
                  ) : (
                    <>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pagosResumen.pctMonto}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Porcentaje del monto marcado como pagado"
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                          style={{ width: `${pagosResumen.pctMonto}%` }}
                        />
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total pago</p>
                          <p className="truncate text-xl font-bold tabular-nums text-foreground">{formatArs(pagosResumen.totalPagadoArs)}</p>
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total a pagar</p>
                          <p className="truncate text-xl font-semibold tabular-nums text-muted-foreground">
                            {formatArs(pagosResumen.totalAPagarArs)}
                          </p>
                        </div>
                      </div>
                      <p className="text-center text-sm font-semibold tabular-nums text-muted-foreground">{pagosResumen.pctMonto}%</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start 2xl:gap-8">
            <Card className="min-w-0 border-border/70 shadow-sm">
              <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
                <CardTitle className="text-lg">Gastos fijos mensuales</CardTitle>
                <CardDescription className="text-xs leading-snug text-muted-foreground">
                  {etiquetaMesSeleccionado}
                  {esMesActual ? ' · mes actual' : ''} · En Economía como costos fijos (aguinaldo = sueldos ÷ 12).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4">
                <div className="grid gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Sueldos</span>
                    <p className="font-semibold tabular-nums text-foreground">{formatArs(sueldosSum)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Aguinaldo ÷12</span>
                    <p className="font-semibold tabular-nums text-foreground">{formatArs(aguinaldo)}</p>
                  </div>
                  <div className="sm:text-right">
                    <span className="text-muted-foreground">Total fijos</span>
                    <p className="text-base font-bold tabular-nums text-foreground">{formatArs(totalFijos)}</p>
                  </div>
                </div>

                {aguinaldo > 0 ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Provisión aguinaldo (solo control de pago)</span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
                      <Checkbox
                        checked={!!bundle.pagos?.fixed?.aguinaldo}
                        onCheckedChange={(c) =>
                          setBundleForMonth((b) =>
                            withPagos(b, (fixed) => {
                              if (c === true) fixed.aguinaldo = true;
                              else delete fixed.aguinaldo;
                            }),
                          )
                        }
                      />
                      Pagado
                    </label>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {FIXED_MONTO_ROWS.map(({ key, label }) => (
                    <GastoMontoRow
                      key={key}
                      label={label}
                      value={Number(bundle.fixed[key]) || 0}
                      onChange={(n) => updateFixed({ [key]: n } as Partial<FixedCostsMonth>)}
                      paid={!!bundle.pagos?.fixed?.[key as string]}
                      onPaidChange={(v) =>
                        setBundleForMonth((b) =>
                          withPagos(b, (fixed) => {
                            if (v) fixed[key as string] = true;
                            else delete fixed[key as string];
                          }),
                        )
                      }
                    />
                  ))}
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Servicios</h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {SERVICIO_ROWS.map(({ key, label }) => (
                      <GastoMontoRow
                        key={key}
                        label={label}
                        value={Number(bundle.fixed[key]) || 0}
                        onChange={(n) => updateFixed({ [key]: n } as Partial<FixedCostsMonth>)}
                        paid={!!bundle.pagos?.fixed?.[key as string]}
                        onPaidChange={(v) =>
                          setBundleForMonth((b) =>
                            withPagos(b, (fixed) => {
                              if (v) fixed[key as string] = true;
                              else delete fixed[key as string];
                            }),
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sueldos</h3>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addSueldo}>
                      + Sueldo
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Usuarios app = nombre fijo; el resto editable.</p>
                  {approvedUsersLoading ? (
                    <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
                  ) : bundle.fixed.sueldos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay filas. Usá «+ Sueldo».</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {bundle.fixed.sueldos.map((s) => {
                        const appRow = isAppUserSueldo(s.id);
                        return (
                          <div key={s.id} className="flex gap-2 rounded-md border border-border/50 bg-muted/5 p-2">
                            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">
                                  Nombre
                                  {appRow ? <span className="text-primary"> · app</span> : null}
                                </Label>
                                <input
                                  className="w-full bg-background border rounded-md px-2 py-1.5 text-sm disabled:opacity-70"
                                  value={s.nombre}
                                  disabled={appRow}
                                  onChange={(e) => patchSueldo(s.id, { nombre: e.target.value })}
                                  placeholder="Nombre"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">Monto ARS</Label>
                                <input
                                  className="w-full bg-background border rounded-md px-2 py-1.5 text-sm"
                                  type="number"
                                  inputMode="decimal"
                                  value={s.monto}
                                  onChange={(e) => patchSueldo(s.id, { monto: Number(e.target.value) || 0 })}
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-center justify-between gap-1 border-l border-border/40 pl-2">
                              <label className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground select-none">
                                <Checkbox
                                  checked={!!bundle.pagos?.sueldos?.[s.id]}
                                  onCheckedChange={(c) =>
                                    setBundleForMonth((b) =>
                                      withPagos(b, (_f, sueldos) => {
                                        if (c === true) sueldos[s.id] = true;
                                        else delete sueldos[s.id];
                                      }),
                                    )
                                  }
                                />
                                Pago
                              </label>
                              {!appRow ? (
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-1 text-[11px]" onClick={() => removeSueldo(s.id)}>
                                  Quitar
                                </Button>
                              ) : (
                                <span className="h-7 w-8" aria-hidden />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-border/70 shadow-sm">
              <CardHeader className="border-b border-border/50 bg-muted/15 px-4 py-3">
                <CardTitle className="text-lg">Gastos extras del mes</CardTitle>
                <CardDescription className="text-xs leading-snug">
                  {etiquetaMesSeleccionado}
                  {esMesActual ? ' · actual' : ''} · Economía usa publicidad, envíos e inversiones según categoría.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 py-4">
                <div className="grid gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs sm:grid-cols-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Extras sin envíos</span>
                    <span className="font-semibold tabular-nums">{formatArs(extrasSinEnvio)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Envíos (manual)</span>
                    <span className="font-semibold tabular-nums">{formatArs(bundle.extras.envios)}</span>
                  </div>
                  <div className="flex justify-between gap-2 sm:col-span-2">
                    <span className="text-muted-foreground">Total extras + publicidad + envíos</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatArs(extrasSinEnvio + bundle.extras.envios + bundle.extras.publicidad)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-border/60 pt-2 sm:col-span-2">
                    <span className="font-medium">Suma todas las categorías</span>
                    <span className="text-lg font-bold tabular-nums text-foreground">{formatArs(totalExtrasAll)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {EXTRA_FIELDS.map((f) => (
                    <GastoMontoRow
                      key={f.key}
                      label={f.label}
                      value={bundle.extras[f.key]}
                      onChange={(n) => updateExtras({ [f.key]: n } as Partial<ExtrasMonth>)}
                      paid={!!bundle.pagos?.extras?.[f.key]}
                      onPaidChange={(v) =>
                        setBundleForMonth((b) =>
                          withPagos(b, (_f, _s, extras) => {
                            if (v) extras[f.key] = true;
                            else delete extras[f.key];
                          }),
                        )
                      }
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="w-full border-border/70 shadow-sm">
            <CardHeader className="space-y-4 border-b border-border/50 bg-muted/15 px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg">Costos variables de fabricación</CardTitle>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Tabla <code className="rounded bg-muted px-1 py-px text-[11px]">fabricacion_parametros</code>: nueva
                    versión al guardar; los sellos usan la tarifa vigente según su <code className="rounded bg-muted px-1 py-px text-[11px]">created_at</code>.
                  </p>
                </div>
                <Button type="button" className="h-9 shrink-0 self-start lg:self-center" onClick={handleGuardarCostosDb} disabled={paramsDisabled}>
                  {paramsSaving ? 'Guardando…' : paramsLoading ? 'Cargando…' : 'Guardar en Supabase'}
                </Button>
              </div>
              <div className="grid gap-4 rounded-lg border border-border/50 bg-background/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Última versión en base</Label>
                  {lastSynced ? (
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{formatEffectiveLabel(lastSynced.effectiveFrom)}</span>
                      {lastSynced.note ? <span className="text-muted-foreground"> · {lastSynced.note}</span> : null}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos o error de carga.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Vigente desde (opcional)</Label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                    disabled={paramsDisabled}
                    value={vigenteDesdeLocal}
                    onChange={(e) => setVigenteDesdeLocal(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Vacío = al guardar (ahora).</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-8 px-4 py-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Ítems terminados</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <NumberField label="Soldador 100W (sin amort.)" value={variable.soldador100} onChange={(n) => updateVariable({ soldador100: n })} disabled={paramsDisabled} />
                  <NumberField label="Soldador 200W (sin amort.)" value={variable.soldador200} onChange={(n) => updateVariable({ soldador200: n })} disabled={paramsDisabled} />
                  <NumberField label="Base remachadora (sin amort.)" value={variable.baseRemachadora} onChange={(n) => updateVariable({ baseRemachadora: n })} disabled={paramsDisabled} />
                  <NumberField label="Mango de golpe (total)" value={variable.mangoGolpe} onChange={(n) => updateVariable({ mangoGolpe: n })} disabled={paramsDisabled} />
                  <NumberField label="Amortización fresa (resto de ítems)" value={variable.amortFresa} onChange={(n) => updateVariable({ amortFresa: n })} hint="En DB no aplica a mango de golpe." disabled={paramsDisabled} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Bronce / planchuela ($ por cm)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <NumberField label="12 mm" value={variable.planchuela12} onChange={(n) => updateVariable({ planchuela12: n })} disabled={paramsDisabled} />
                  <NumberField label="20 mm" value={variable.planchuela20} onChange={(n) => updateVariable({ planchuela20: n })} disabled={paramsDisabled} />
                  <NumberField label="25 mm" value={variable.planchuela25} onChange={(n) => updateVariable({ planchuela25: n })} disabled={paramsDisabled} />
                  <NumberField label="40 mm" value={variable.planchuela40} onChange={(n) => updateVariable({ planchuela40: n })} disabled={paramsDisabled} />
                  <NumberField label="63 mm" value={variable.planchuela63} onChange={(n) => updateVariable({ planchuela63: n })} disabled={paramsDisabled} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Packaging</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <NumberField label="Tubo" value={variable.tubo} onChange={(n) => updateVariable({ tubo: n })} disabled={paramsDisabled} />
                  <NumberField label="Caja plástico abecedario" value={variable.cajaAbc} onChange={(n) => updateVariable({ cajaAbc: n })} disabled={paramsDisabled} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Piezas — sello</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <NumberField label="Mango madera" value={variable.mangoMadera} onChange={(n) => updateVariable({ mangoMadera: n })} disabled={paramsDisabled} />
                  <NumberField label="Varilla" value={variable.varilla} onChange={(n) => updateVariable({ varilla: n })} disabled={paramsDisabled} />
                  <NumberField label="Prisionero" value={variable.prisionero} onChange={(n) => updateVariable({ prisionero: n })} disabled={paramsDisabled} />
                  <NumberField label="Pérdida corte sello (cm)" value={variable.selloPerdidaCorteCm} onChange={(n) => updateVariable({ selloPerdidaCorteCm: n })} hint="Ej. 0,8 cm = 8 mm sumados al largo." disabled={paramsDisabled} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Piezas — abecedario</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <NumberField label="Soporte ABC" value={variable.soporteAbc} onChange={(n) => updateVariable({ soporteAbc: n })} disabled={paramsDisabled} />
                  <NumberField label="Cm material mayús. / minús. (una)" value={variable.abcCmSimple} onChange={(n) => updateVariable({ abcCmSimple: n })} disabled={paramsDisabled} />
                  <NumberField label="Cm material mayús. + minús. (ambas)" value={variable.abcCmAmbas} onChange={(n) => updateVariable({ abcCmAmbas: n })} disabled={paramsDisabled} />
                </div>
              </div>
            </CardContent>
          </Card>
      </div>
      <Toaster />
    </AppMain>
  );
}
