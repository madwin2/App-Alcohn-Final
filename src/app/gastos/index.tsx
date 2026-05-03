import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  DEFAULT_VARIABLE_COSTS,
  type VariableCostsState,
} from '@/lib/gastos/variableCosts';
import {
  aguinaldoFromSueldos,
  emptyBundle,
  ensureSueldosForUsers,
  gastosExtrasParaTabla,
  getBundleForMonth,
  loadAllMonthlyCosts,
  newSalaryEntry,
  saveAllMonthlyCosts,
  sueldosListsEqual,
  sumSueldos,
  totalFixedCosts,
  type ExtrasMonth,
  type FixedCostsMonth,
  type MonthCostsBundle,
  type SalaryEntry,
} from '@/lib/gastos/monthlyEconomiaCosts';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import {
  fetchLatestFabricacionParams,
  insertFabricacionParamsVersion,
} from '@/lib/supabase/services/fabricacionParametros.service';

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

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

function formatEffectiveLabel(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
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
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [lastSynced, setLastSynced] = useState<{ effectiveFrom: string; note: string | null } | null>(null);
  const [vigenteDesdeLocal, setVigenteDesdeLocal] = useState('');

  const [approvedUsers, setApprovedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [approvedUsersLoading, setApprovedUsersLoading] = useState(true);

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  const appUserIdSet = useMemo(() => new Set(approvedUsers.map((u) => u.id)), [approvedUsers]);

  const isAppUserSueldo = useCallback((sueldoId: string) => appUserIdSet.has(sueldoId), [appUserIdSet]);

  useEffect(() => {
    setMonthlyByMonth(loadAllMonthlyCosts());
  }, []);

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
    if (!isAllowed || approvedUsers.length === 0) return;

    setMonthlyByMonth((prev) => {
      const cur = getBundleForMonth(prev, selectedMonth);
      const nextFixedSueldos = ensureSueldosForUsers(cur.fixed.sueldos, approvedUsers);
      const nextRealSueldos = ensureSueldosForUsers(cur.realFixed.sueldos, approvedUsers);

      if (
        sueldosListsEqual(cur.fixed.sueldos, nextFixedSueldos) &&
        sueldosListsEqual(cur.realFixed.sueldos, nextRealSueldos)
      ) {
        return prev;
      }

      return {
        ...prev,
        [selectedMonth]: {
          ...cur,
          fixed: { ...cur.fixed, sueldos: nextFixedSueldos },
          realFixed: { ...cur.realFixed, sueldos: nextRealSueldos },
        },
      };
    });
  }, [approvedUsers, selectedMonth, isAllowed]);

  useEffect(() => {
    saveAllMonthlyCosts(monthlyByMonth);
  }, [monthlyByMonth]);

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

  const updateRealFixed = (patch: Partial<FixedCostsMonth>) => {
    setBundleForMonth((b) => ({ ...b, realFixed: { ...b.realFixed, ...patch } }));
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

  const setRealSueldos = (sueldos: SalaryEntry[]) => updateRealFixed({ sueldos });

  const addRealSueldo = () => {
    setRealSueldos([...bundle.realFixed.sueldos, newSalaryEntry()]);
  };

  const patchRealSueldo = (id: string, patch: Partial<SalaryEntry>) => {
    setRealSueldos(bundle.realFixed.sueldos.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeRealSueldo = (id: string) => {
    setRealSueldos(bundle.realFixed.sueldos.filter((s) => s.id !== id));
  };

  const totalFijos = totalFixedCosts(bundle.fixed);
  const aguinaldo = aguinaldoFromSueldos(bundle.fixed.sueldos);
  const sueldosSum = sumSueldos(bundle.fixed.sueldos);
  const extrasTabla = gastosExtrasParaTabla(bundle.extras);
  const totalExtrasAll = EXTRA_FIELDS.reduce((s, f) => s + (bundle.extras[f.key] || 0), 0);

  const totalRealesFijos = totalFixedCosts(bundle.realFixed);
  const aguinaldoReal = aguinaldoFromSueldos(bundle.realFixed.sueldos);
  const sueldosSumReal = sumSueldos(bundle.realFixed.sueldos);
  const totalGastosRealesRegistrados = totalExtrasAll + totalRealesFijos;

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
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-20 p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fijos ideales, gastos reales (extras + fijos reales) y mes calendario (elegís el mes arriba; por defecto el
            actual). Parámetros de fabricación en Supabase. Solo tu usuario; los montos mensuales se guardan en este
            navegador.
          </p>
        </div>

        <Card className="sticky top-4 z-10 border-primary/20 shadow-sm bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <CardHeader>
            <CardTitle>Mes a editar</CardTitle>
            <CardDescription>
              Elegí un mes para ver y modificar <strong>fijos ideales</strong>, <strong>gastos reales del mes</strong> y
              extras. En Economía la ganancia usa los <strong>fijos ideales</strong> y las categorías de extras; los
              importes reales de fijos son solo registro. Por defecto abrís el <strong>mes actual</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mes</Label>
              <input
                className="bg-background border rounded-md px-3 py-2 text-sm min-w-[11rem]"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedMonth(mesActualKey)}>
              Ir al mes actual
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!monthlyByMonth[selectedMonth]) {
                  setMonthlyByMonth((m) => ({ ...m, [selectedMonth]: emptyBundle() }));
                }
              }}
            >
              Inicializar mes vacío
            </Button>
            <p className="w-full text-sm text-muted-foreground">
              Editando: <span className="font-medium text-foreground">{etiquetaMesSeleccionado}</span>
              {esMesActual ? (
                <span className="ml-2 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                  Mes actual
                </span>
              ) : null}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos fijos mensuales (ideal)</CardTitle>
            <CardDescription>
              Presupuesto o plan del mes <strong>{etiquetaMesSeleccionado}</strong>
              {esMesActual ? ' (mes actual)' : ''}. Se suman en Economía como <strong>Costos fijos</strong> en la fila de
              ese mes. El aguinaldo es la suma de sueldos ÷ 12 (provisión mensual). Lo que realmente pagaste va en{' '}
              <strong>Gastos reales del mes</strong> más abajo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Suma sueldos:</span>{' '}
                <span className="font-semibold">{formatArs(sueldosSum)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Aguinaldo (sueldos ÷ 12):</span>{' '}
                <span className="font-semibold">{formatArs(aguinaldo)}</span>
              </p>
              <p className="pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Total costos fijos ({etiquetaMesSeleccionado}):</span>{' '}
                <span className="font-semibold text-foreground">{formatArs(totalFijos)}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <NumberField label="Monotributos" value={bundle.fixed.monotributos} onChange={(n) => updateFixed({ monotributos: n })} />
              <NumberField label="Contador" value={bundle.fixed.contador} onChange={(n) => updateFixed({ contador: n })} />
              <NumberField label="Alquiler" value={bundle.fixed.alquiler} onChange={(n) => updateFixed({ alquiler: n })} />
              <NumberField label="Seguro" value={bundle.fixed.seguro} onChange={(n) => updateFixed({ seguro: n })} />
              <NumberField label="Crédito" value={bundle.fixed.credito} onChange={(n) => updateFixed({ credito: n })} />
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Servicios</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <NumberField label="Electricidad" value={bundle.fixed.electricidad} onChange={(n) => updateFixed({ electricidad: n })} />
                <NumberField label="Agua" value={bundle.fixed.agua} onChange={(n) => updateFixed({ agua: n })} />
                <NumberField label="Internet" value={bundle.fixed.internet} onChange={(n) => updateFixed({ internet: n })} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">Sueldos (por persona)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Una fila por usuario aprobado en la app (nombre fijo). Podés sumar otros sueldos con el botón.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSueldo}>
                  Agregar otro sueldo
                </Button>
              </div>
              {approvedUsersLoading ? (
                <p className="text-sm text-muted-foreground">Cargando usuarios de la app…</p>
              ) : bundle.fixed.sueldos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay sueldos cargados. Si no hay usuarios aprobados en la app, usá «Agregar otro sueldo».
                </p>
              ) : (
                <div className="space-y-3">
                  {bundle.fixed.sueldos.map((s) => {
                    const appRow = isAppUserSueldo(s.id);
                    return (
                      <div key={s.id} className="flex flex-col gap-2 sm:flex-row sm:items-end border rounded-md p-3">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Nombre
                            {appRow ? (
                              <span className="ml-1.5 text-[10px] font-normal text-primary">(usuario app)</span>
                            ) : null}
                          </Label>
                          <input
                            className="w-full bg-background border rounded-md px-3 py-2 text-sm disabled:opacity-70"
                            value={s.nombre}
                            disabled={appRow}
                            onChange={(e) => patchSueldo(s.id, { nombre: e.target.value })}
                            placeholder="Ej. Juan"
                          />
                        </div>
                        <div className="w-full sm:w-40 space-y-1">
                          <Label className="text-xs text-muted-foreground">Monto (ARS)</Label>
                          <input
                            className="w-full bg-background border rounded-md px-3 py-2 text-sm"
                            type="number"
                            inputMode="decimal"
                            value={s.monto}
                            onChange={(e) => patchSueldo(s.id, { monto: Number(e.target.value) || 0 })}
                          />
                        </div>
                        {!appRow ? (
                          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => removeSueldo(s.id)}>
                            Quitar
                          </Button>
                        ) : (
                          <span className="shrink-0 w-[72px]" aria-hidden />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costos variables de fabricación</CardTitle>
            <CardDescription className="mt-1.5">
              Sincronizado con la tabla <code className="text-xs bg-muted px-1 rounded">fabricacion_parametros</code> en
              Supabase. Al guardar se inserta una <strong>nueva versión</strong> con fecha de vigencia; el trigger de
              costos usa la tarifa correspondiente al{' '}
              <code className="text-xs bg-muted px-1 rounded">created_at</code> de cada sello.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-4">
              <div className="flex flex-col gap-2 sm:items-end shrink-0 w-full sm:w-auto">
                {lastSynced ? (
                  <p className="text-xs text-muted-foreground max-w-[280px] sm:text-right">
                    Última versión cargada: <span className="text-foreground">{formatEffectiveLabel(lastSynced.effectiveFrom)}</span>
                    {lastSynced.note ? ` · ${lastSynced.note}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground sm:text-right">Aún no hay datos en la tabla o falló la carga.</p>
                )}
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <Label className="text-xs text-muted-foreground">Vigente desde (opcional)</Label>
                  <input
                    type="datetime-local"
                    className="bg-background border rounded-md px-3 py-2 text-sm w-full sm:w-[220px] disabled:opacity-50"
                    disabled={paramsDisabled}
                    value={vigenteDesdeLocal}
                    onChange={(e) => setVigenteDesdeLocal(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Vacío = momento del guardado (ahora).</p>
                </div>
                <Button type="button" onClick={handleGuardarCostosDb} disabled={paramsDisabled}>
                  {paramsSaving ? 'Guardando…' : paramsLoading ? 'Cargando…' : 'Guardar en Supabase'}
                </Button>
              </div>
            </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Gastos reales del mes</CardTitle>
            <CardDescription>
              Mes <strong>{etiquetaMesSeleccionado}</strong>
              {esMesActual ? ' (mes actual)' : ''}. Acá registrás la <strong>verdad contable</strong>: las mismas
              categorías diversas de siempre <em>más</em> un desglose como el de fijos, pero con lo efectivamente pagado.
              No reemplaza a los fijos ideales de arriba: Economía sigue usando el <strong>ideal</strong> para costos
              fijos y las categorías de la primera sección para <strong>Gastos extras</strong> y publicidad.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-10">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Categorías diversas</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Mismas categorías que usa Economía (gastos extras + publicidad). Los importes que cargás acá son los que
                  entran en la ecuación de ganancia del mes.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>
                  Suma tabla extras + publicidad (referencia Economía):{' '}
                  <strong className="text-foreground">{formatArs(extrasTabla + bundle.extras.publicidad)}</strong>
                </span>
                <span>
                  Total categorías (todas): <strong className="text-foreground">{formatArs(totalExtrasAll)}</strong>
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EXTRA_FIELDS.map((f) => (
                  <NumberField
                    key={f.key}
                    label={f.label}
                    value={bundle.extras[f.key]}
                    onChange={(n) => updateExtras({ [f.key]: n } as Partial<ExtrasMonth>)}
                  />
                ))}
              </div>
            </div>

            <div className="border-t pt-8 space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-1">Fijos reales (lo pagado)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Mismos rubros que en <strong>Gastos fijos (ideal)</strong>, pero independientes: acá va lo que salió de
                  la cuenta, banco o facturas.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Suma sueldos (real):</span>{' '}
                  <span className="font-semibold">{formatArs(sueldosSumReal)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Aguinaldo provisión (sueldos ÷ 12):</span>{' '}
                  <span className="font-semibold">{formatArs(aguinaldoReal)}</span>
                </p>
                <p className="pt-1 border-t border-border/60">
                  <span className="text-muted-foreground">Subtotal fijos reales ({etiquetaMesSeleccionado}):</span>{' '}
                  <span className="font-semibold text-foreground">{formatArs(totalRealesFijos)}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumberField
                  label="Monotributos (real)"
                  value={bundle.realFixed.monotributos}
                  onChange={(n) => updateRealFixed({ monotributos: n })}
                />
                <NumberField label="Contador (real)" value={bundle.realFixed.contador} onChange={(n) => updateRealFixed({ contador: n })} />
                <NumberField label="Alquiler (real)" value={bundle.realFixed.alquiler} onChange={(n) => updateRealFixed({ alquiler: n })} />
                <NumberField label="Seguro (real)" value={bundle.realFixed.seguro} onChange={(n) => updateRealFixed({ seguro: n })} />
                <NumberField label="Crédito (real)" value={bundle.realFixed.credito} onChange={(n) => updateRealFixed({ credito: n })} />
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Servicios (real)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <NumberField
                    label="Electricidad"
                    value={bundle.realFixed.electricidad}
                    onChange={(n) => updateRealFixed({ electricidad: n })}
                  />
                  <NumberField label="Agua" value={bundle.realFixed.agua} onChange={(n) => updateRealFixed({ agua: n })} />
                  <NumberField label="Internet" value={bundle.realFixed.internet} onChange={(n) => updateRealFixed({ internet: n })} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-medium">Sueldos reales (por persona)</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mismos usuarios de la app que en fijos ideales; acá cargás lo efectivamente pagado.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addRealSueldo}>
                    Agregar otro sueldo
                  </Button>
                </div>
                {approvedUsersLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando usuarios de la app…</p>
                ) : bundle.realFixed.sueldos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay sueldos reales cargados. Si no hay usuarios aprobados en la app, usá «Agregar otro sueldo».
                  </p>
                ) : (
                  <div className="space-y-3">
                    {bundle.realFixed.sueldos.map((s) => {
                      const appRow = isAppUserSueldo(s.id);
                      return (
                        <div key={s.id} className="flex flex-col gap-2 sm:flex-row sm:items-end border rounded-md p-3">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Nombre
                              {appRow ? (
                                <span className="ml-1.5 text-[10px] font-normal text-primary">(usuario app)</span>
                              ) : null}
                            </Label>
                            <input
                              className="w-full bg-background border rounded-md px-3 py-2 text-sm disabled:opacity-70"
                              value={s.nombre}
                              disabled={appRow}
                              onChange={(e) => patchRealSueldo(s.id, { nombre: e.target.value })}
                              placeholder="Ej. Juan"
                            />
                          </div>
                          <div className="w-full sm:w-40 space-y-1">
                            <Label className="text-xs text-muted-foreground">Monto (ARS)</Label>
                            <input
                              className="w-full bg-background border rounded-md px-3 py-2 text-sm"
                              type="number"
                              inputMode="decimal"
                              value={s.monto}
                              onChange={(e) => patchRealSueldo(s.id, { monto: Number(e.target.value) || 0 })}
                            />
                          </div>
                          {!appRow ? (
                            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => removeRealSueldo(s.id)}>
                              Quitar
                            </Button>
                          ) : (
                            <span className="shrink-0 w-[72px]" aria-hidden />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm">
              <p className="text-muted-foreground">
                Total registrado en esta tarjeta (extras + fijos reales, referencia; no se usa en Economía):{' '}
                <span className="font-semibold text-foreground">{formatArs(totalGastosRealesRegistrados)}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}
