import { useEffect, useMemo, useState } from 'react';
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
  aguinaldoMensual,
  emptyMonthlyPayload,
  mergeMonthlyPayload,
  MONTHLY_CATEGORIES,
  MONTHLY_EXTRA_CATEGORIES,
  sumSueldos,
  totalGastosMensuales,
  type MonthlyExpensesPayload,
  type MonthlyScalarKey,
} from '@/lib/gastos/monthlyOperationalCosts';
import {
  fetchLatestFabricacionParams,
  insertFabricacionParamsVersion,
} from '@/lib/supabase/services/fabricacionParametros.service';
import {
  fetchAllGastosMensuales,
  upsertGastosMensuales,
} from '@/lib/supabase/services/gastosMensuales.service';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';

export type { VariableCostsState };

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

const STORAGE_VARIABLE = 'gastos_variable_costs_v1';
const STORAGE_MONTHLY_LEGACY = 'gastos_mensuales_v1';

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
};

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

export default function GastosPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [variable, setVariable] = useState<VariableCostsState>(DEFAULT_VARIABLE_COSTS);
  const [monthlyByMonth, setMonthlyByMonth] = useState<Record<string, MonthlyExpensesPayload>>({});
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [approvedUsers, setApprovedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlySaving, setMonthlySaving] = useState(false);

  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [lastSynced, setLastSynced] = useState<{ effectiveFrom: string; note: string | null } | null>(null);
  const [vigenteDesdeLocal, setVigenteDesdeLocal] = useState('');

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  function tryImportLegacyLocal(): Record<string, MonthlyExpensesPayload> | null {
    const raw = localStorage.getItem(STORAGE_MONTHLY_LEGACY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, MonthlyExpensesPayload> = {};
      for (const [mk, row] of Object.entries(parsed)) {
        out[mk] = mergeMonthlyPayload(row);
      }
      return out;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (authLoading || !isAllowed) return;
    let cancelled = false;
    (async () => {
      setMonthlyLoading(true);
      try {
        const [users, fromDb] = await Promise.all([getApprovedUsers(), fetchAllGastosMensuales()]);
        if (cancelled) return;
        setApprovedUsers(users);
        if (Object.keys(fromDb).length > 0) {
          setMonthlyByMonth(fromDb);
        } else {
          const legacy = tryImportLegacyLocal();
          if (legacy && Object.keys(legacy).length > 0) {
            setMonthlyByMonth(legacy);
            toast({
              title: 'Gastos importados del navegador',
              description: 'Revisá los montos y tocá «Guardar este mes en Supabase» para cada mes que quieras persistir.',
            });
          }
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const legacy = tryImportLegacyLocal();
        if (legacy && Object.keys(legacy).length > 0) {
          setMonthlyByMonth(legacy);
          toast({
            title: 'No se pudieron cargar gastos desde Supabase',
            description: `${msg} · Mostrando datos guardados en este navegador.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'No se pudieron cargar gastos desde Supabase',
            description: msg,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setMonthlyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAllowed, toast]);

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
  }, [authLoading, isAllowed, toast]);

  const currentRow = useMemo(() => {
    const base = monthlyByMonth[selectedMonth] ?? emptyMonthlyPayload();
    const sueldos = { ...base.sueldos_por_usuario };
    for (const u of approvedUsers) {
      if (sueldos[u.id] === undefined) sueldos[u.id] = 0;
    }
    return { ...base, sueldos_por_usuario: sueldos };
  }, [monthlyByMonth, selectedMonth, approvedUsers]);

  const setScalar = (key: MonthlyScalarKey, value: number) => {
    setMonthlyByMonth((prev) => ({
      ...prev,
      [selectedMonth]: {
        ...(prev[selectedMonth] ?? emptyMonthlyPayload()),
        [key]: value,
      },
    }));
  };

  const setSueldoUsuario = (userId: string, value: number) => {
    setMonthlyByMonth((prev) => {
      const row = prev[selectedMonth] ?? emptyMonthlyPayload();
      return {
        ...prev,
        [selectedMonth]: {
          ...row,
          sueldos_por_usuario: { ...row.sueldos_por_usuario, [userId]: value },
        },
      };
    });
  };

  const monthlyTotal = useMemo(() => totalGastosMensuales(currentRow), [currentRow]);

  const updateVariable = (patch: Partial<VariableCostsState>) => {
    setVariable((v) => ({ ...v, ...patch }));
  };

  const handleGuardarGastosMes = async () => {
    setMonthlySaving(true);
    try {
      await upsertGastosMensuales(selectedMonth, currentRow);
      const fresh = await fetchAllGastosMensuales();
      setMonthlyByMonth(fresh);
      toast({
        title: 'Gastos guardados',
        description: `Mes ${selectedMonth} guardado en Supabase.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Error al guardar gastos',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setMonthlySaving(false);
    }
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

  useEffect(() => {
    localStorage.setItem(STORAGE_VARIABLE, JSON.stringify(variable));
  }, [variable]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  const paramsDisabled = paramsLoading || paramsSaving;
  const monthlyDisabled = monthlyLoading || monthlySaving;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-20 p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Parámetros de fabricación (Supabase) y gastos mensuales operativos guardados en base de datos.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Costos variables de fabricación</CardTitle>
                <CardDescription className="mt-1.5">
                  Sincronizado con la tabla <code className="text-xs bg-muted px-1 rounded">fabricacion_parametros</code>{' '}
                  en Supabase. Al guardar se inserta una <strong>nueva versión</strong> con fecha de vigencia; el trigger
                  de costos usa la tarifa correspondiente al <code className="text-xs bg-muted px-1 rounded">created_at</code>{' '}
                  de cada sello.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:items-end shrink-0">
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
          </CardHeader>
          <CardContent className="space-y-8">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Gastos mensuales</CardTitle>
                <CardDescription>
                  Suma de todas las categorías del mes (incluye sueldos, aguinaldo provisionado y rubros fijos). Elegí el
                  mes, editá y guardá en Supabase. Podés volver a meses anteriores para cargar o corregir.
                </CardDescription>
              </div>
              <Button type="button" onClick={handleGuardarGastosMes} disabled={monthlyDisabled}>
                {monthlySaving ? 'Guardando…' : monthlyLoading ? 'Cargando…' : 'Guardar este mes en Supabase'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mes</Label>
                <input
                  className="bg-background border rounded-md px-3 py-2 text-sm disabled:opacity-50"
                  type="month"
                  disabled={monthlyDisabled}
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground pb-2">
                Total del mes: <span className="font-semibold text-foreground">{formatArs(monthlyTotal)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MONTHLY_CATEGORIES.map((c) => (
                <NumberField
                  key={c.key}
                  label={c.label}
                  value={currentRow[c.key]}
                  onChange={(n) => setScalar(c.key, n)}
                  disabled={monthlyDisabled}
                />
              ))}
            </div>

            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-medium mb-3">Otros gastos fijos del mes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MONTHLY_EXTRA_CATEGORIES.map((c) => (
                  <NumberField
                    key={c.key}
                    label={c.label}
                    value={currentRow[c.key]}
                    onChange={(n) => setScalar(c.key, n)}
                    disabled={monthlyDisabled}
                  />
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-medium mb-3">Sueldos (usuarios de la app)</h3>
              {approvedUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay usuarios aprobados o aún se están cargando.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {approvedUsers.map((u) => (
                    <NumberField
                      key={u.id}
                      label={`Sueldo — ${u.name}`}
                      value={currentRow.sueldos_por_usuario[u.id] ?? 0}
                      onChange={(n) => setSueldoUsuario(u.id, n)}
                      disabled={monthlyDisabled}
                    />
                  ))}
                </div>
              )}
              <div className="mt-4 rounded-md border bg-muted/30 px-3 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Aguinaldo (provisión mensual)</p>
                <p className="text-lg font-semibold">{formatArs(aguinaldoMensual(currentRow))}</p>
                <p className="text-[11px] text-muted-foreground">
                  Suma de sueldos ({formatArs(sumSueldos(currentRow))}) ÷ 12. Ya está incluido en el total del mes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}
