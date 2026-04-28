import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { Label } from '@/components/ui/label';

const ALLOWED_EMAIL = 'julian.475@hotmail.com';

/** Misma clave que Economía para que el costo fijo mensual sea único. */
const STORAGE_KEY_FIXED = 'economia_fixed_monthly_cost_ars';

const STORAGE_VARIABLE = 'gastos_variable_costs_v1';
const STORAGE_MONTHLY = 'gastos_mensuales_v1';

export type VariableCostsState = {
  soldador100: number;
  soldador200: number;
  baseRemachadora: number;
  mangoGolpe: number;
  amortFresa: number;
  planchuela12: number;
  planchuela20: number;
  planchuela25: number;
  planchuela40: number;
  planchuela63: number;
  tubo: number;
  cajaAbc: number;
  mangoMadera: number;
  varilla: number;
  prisionero: number;
  soporteAbc: number;
  abcCmSimple: number;
  abcCmAmbas: number;
  selloPerdidaCorteCm: number;
};

const DEFAULT_VARIABLE: VariableCostsState = {
  soldador100: 13000,
  soldador200: 30000,
  baseRemachadora: 13000,
  mangoGolpe: 7000,
  amortFresa: 5600,
  planchuela12: 375,
  planchuela20: 530,
  planchuela25: 690,
  planchuela40: 1015,
  planchuela63: 2190,
  tubo: 1100,
  cajaAbc: 4000,
  mangoMadera: 860,
  varilla: 250,
  prisionero: 100,
  soporteAbc: 12000,
  abcCmSimple: 40,
  abcCmAmbas: 80,
  selloPerdidaCorteCm: 0.8,
};

const MONTHLY_CATEGORIES = [
  { key: 'publicidad', label: 'Publicidad' },
  { key: 'envios', label: 'Envíos' },
  { key: 'compra_dolares', label: 'Compra de dólares (ahorro de la empresa)' },
  { key: 'inversiones_empresa', label: 'Inversiones que hace la empresa' },
  { key: 'gastos_varios', label: 'Gastos varios' },
  { key: 'automatizaciones', label: 'Automatizaciones' },
  { key: 'impuestos', label: 'Impuestos' },
  { key: 'remodelacion', label: 'Remodelación' },
  { key: 'inversion_cyprea', label: 'Inversiones en Cyprea' },
] as const;

type MonthlyKey = (typeof MONTHLY_CATEGORIES)[number]['key'];

type MonthlyExpensesRow = Record<MonthlyKey, number>;

const emptyMonthlyRow = (): MonthlyExpensesRow =>
  MONTHLY_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = 0;
    return acc;
  }, {} as MonthlyExpensesRow);

const parseMonthlyStore = (raw: string | null): Record<string, MonthlyExpensesRow> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<MonthlyExpensesRow>>;
    const out: Record<string, MonthlyExpensesRow> = {};
    for (const [month, row] of Object.entries(parsed)) {
      const base = emptyMonthlyRow();
      for (const c of MONTHLY_CATEGORIES) {
        const v = row[c.key];
        base[c.key] = typeof v === 'number' && !Number.isNaN(v) ? v : 0;
      }
      out[month] = base;
    }
    return out;
  } catch {
    return {};
  }
};

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
};

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <input
        className="w-full bg-background border rounded-md px-3 py-2 text-sm"
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function GastosPage() {
  const { user, loading: authLoading } = useAuth();
  const [fixedMonthly, setFixedMonthly] = useState(0);
  const [variable, setVariable] = useState<VariableCostsState>(DEFAULT_VARIABLE);
  const [monthlyByMonth, setMonthlyByMonth] = useState<Record<string, MonthlyExpensesRow>>({});
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  useEffect(() => {
    const fixedRaw = localStorage.getItem(STORAGE_KEY_FIXED);
    if (fixedRaw) setFixedMonthly(Number(fixedRaw) || 0);

    const vRaw = localStorage.getItem(STORAGE_VARIABLE);
    if (vRaw) {
      try {
        const parsed = JSON.parse(vRaw) as Partial<VariableCostsState>;
        setVariable({ ...DEFAULT_VARIABLE, ...parsed });
      } catch {
        /* keep default */
      }
    }

    setMonthlyByMonth(parseMonthlyStore(localStorage.getItem(STORAGE_MONTHLY)));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FIXED, String(fixedMonthly));
  }, [fixedMonthly]);

  useEffect(() => {
    localStorage.setItem(STORAGE_VARIABLE, JSON.stringify(variable));
  }, [variable]);

  useEffect(() => {
    localStorage.setItem(STORAGE_MONTHLY, JSON.stringify(monthlyByMonth));
  }, [monthlyByMonth]);

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  const currentRow = useMemo(() => {
    return monthlyByMonth[selectedMonth] ?? emptyMonthlyRow();
  }, [monthlyByMonth, selectedMonth]);

  const setCategory = (key: MonthlyKey, value: number) => {
    setMonthlyByMonth((prev) => ({
      ...prev,
      [selectedMonth]: {
        ...(prev[selectedMonth] ?? emptyMonthlyRow()),
        [key]: value,
      },
    }));
  };

  const monthlyTotal = useMemo(() => {
    return MONTHLY_CATEGORIES.reduce((sum, c) => sum + (currentRow[c.key] || 0), 0);
  }, [currentRow]);

  const updateVariable = (patch: Partial<VariableCostsState>) => {
    setVariable((v) => ({ ...v, ...patch }));
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-20 p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold">Gastos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configuración de costos fijos, parámetros de fabricación y gastos operativos por mes (solo tu usuario).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Gastos fijos mensuales</CardTitle>
            <CardDescription>
              Se usa también en la vista Economía (mismo valor guardado en este navegador).
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-xs">
            <NumberField label="Monto mensual (ARS)" value={fixedMonthly} onChange={setFixedMonthly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costos variables de fabricación</CardTitle>
            <CardDescription>
              Borrador local (este navegador). En producción el costo por ítem lo calcula Postgres leyendo la tabla{' '}
              <code className="text-xs bg-muted px-1 rounded">fabricacion_parametros</code>: cada versión tiene una
              fecha <code className="text-xs bg-muted px-1 rounded">effective_from</code>. Para subir precios sin
              reescribir históricos, insertá una fila nueva en Supabase con los montos actualizados y la fecha desde
              la cual rigen; los sellos ya guardados no cambian hasta que edites esa fila.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h3 className="text-sm font-medium mb-3">Ítems terminados</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumberField label="Soldador 100W (sin amort.)" value={variable.soldador100} onChange={(n) => updateVariable({ soldador100: n })} />
                <NumberField label="Soldador 200W (sin amort.)" value={variable.soldador200} onChange={(n) => updateVariable({ soldador200: n })} />
                <NumberField label="Base remachadora (sin amort.)" value={variable.baseRemachadora} onChange={(n) => updateVariable({ baseRemachadora: n })} />
                <NumberField label="Mango de golpe (total)" value={variable.mangoGolpe} onChange={(n) => updateVariable({ mangoGolpe: n })} />
                <NumberField label="Amortización fresa (resto de ítems)" value={variable.amortFresa} onChange={(n) => updateVariable({ amortFresa: n })} hint="En DB no aplica a mango de golpe." />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Bronce / planchuela ($ por cm)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumberField label="12 mm" value={variable.planchuela12} onChange={(n) => updateVariable({ planchuela12: n })} />
                <NumberField label="20 mm" value={variable.planchuela20} onChange={(n) => updateVariable({ planchuela20: n })} />
                <NumberField label="25 mm" value={variable.planchuela25} onChange={(n) => updateVariable({ planchuela25: n })} />
                <NumberField label="40 mm" value={variable.planchuela40} onChange={(n) => updateVariable({ planchuela40: n })} />
                <NumberField label="63 mm" value={variable.planchuela63} onChange={(n) => updateVariable({ planchuela63: n })} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Packaging</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumberField label="Tubo" value={variable.tubo} onChange={(n) => updateVariable({ tubo: n })} />
                <NumberField label="Caja plástico abecedario" value={variable.cajaAbc} onChange={(n) => updateVariable({ cajaAbc: n })} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Piezas — sello</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumberField label="Mango madera" value={variable.mangoMadera} onChange={(n) => updateVariable({ mangoMadera: n })} />
                <NumberField label="Varilla" value={variable.varilla} onChange={(n) => updateVariable({ varilla: n })} />
                <NumberField label="Prisionero" value={variable.prisionero} onChange={(n) => updateVariable({ prisionero: n })} />
                <NumberField label="Pérdida corte sello (cm)" value={variable.selloPerdidaCorteCm} onChange={(n) => updateVariable({ selloPerdidaCorteCm: n })} hint="Ej. 0,8 cm = 8 mm sumados al largo." />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Piezas — abecedario</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <NumberField label="Soporte ABC" value={variable.soporteAbc} onChange={(n) => updateVariable({ soporteAbc: n })} />
                <NumberField label="Cm material mayús. / minús. (una)" value={variable.abcCmSimple} onChange={(n) => updateVariable({ abcCmSimple: n })} />
                <NumberField label="Cm material mayús. + minús. (ambas)" value={variable.abcCmAmbas} onChange={(n) => updateVariable({ abcCmAmbas: n })} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos del mes</CardTitle>
            <CardDescription>Montos en pesos por categoría; elegí el mes arriba.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mes</Label>
                <input
                  className="bg-background border rounded-md px-3 py-2 text-sm"
                  type="month"
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
                  onChange={(n) => setCategory(c.key, n)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}
