/** Gastos operativos por mes (pantalla Gastos + Economía). */

export const MONTHLY_CATEGORIES = [
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

export const MONTHLY_EXTRA_CATEGORIES = [
  { key: 'alquiler_oficina', label: 'Alquiler oficina' },
  { key: 'monotributos', label: 'Monotributos' },
  { key: 'contador', label: 'Contador' },
  { key: 'seguro', label: 'Seguro' },
  { key: 'credito', label: 'Crédito' },
] as const;

export type MonthlyCategoryKey = (typeof MONTHLY_CATEGORIES)[number]['key'];
export type MonthlyExtraKey = (typeof MONTHLY_EXTRA_CATEGORIES)[number]['key'];
export type MonthlyScalarKey = MonthlyCategoryKey | MonthlyExtraKey;

export type MonthlyExpensesPayload = {
  /** montos por user_id (usuarios aprobados en la app) */
  sueldos_por_usuario: Record<string, number>;
} & Record<MonthlyScalarKey, number>;

export function emptyMonthlyPayload(): MonthlyExpensesPayload {
  const base = {} as Record<MonthlyScalarKey, number>;
  for (const c of MONTHLY_CATEGORIES) base[c.key] = 0;
  for (const c of MONTHLY_EXTRA_CATEGORIES) base[c.key] = 0;
  return { ...base, sueldos_por_usuario: {} };
}

export function mergeMonthlyPayload(partial: unknown): MonthlyExpensesPayload {
  const out = emptyMonthlyPayload();
  if (!partial || typeof partial !== 'object') return out;
  const o = partial as Record<string, unknown>;
  for (const c of MONTHLY_CATEGORIES) {
    const v = o[c.key];
    out[c.key] = typeof v === 'number' && !Number.isNaN(v) ? v : 0;
  }
  for (const c of MONTHLY_EXTRA_CATEGORIES) {
    const v = o[c.key];
    out[c.key] = typeof v === 'number' && !Number.isNaN(v) ? v : 0;
  }
  const sp = o.sueldos_por_usuario;
  if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
    for (const [uid, raw] of Object.entries(sp as Record<string, unknown>)) {
      const n = typeof raw === 'number' && !Number.isNaN(raw) ? raw : Number(raw);
      out.sueldos_por_usuario[uid] = Number.isFinite(n) ? n : 0;
    }
  }
  return out;
}

/** Suma de sueldos cargados (mismo conjunto de claves que en payload). */
export function sumSueldos(payload: MonthlyExpensesPayload): number {
  return Object.values(payload.sueldos_por_usuario).reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0);
}

/** Aguinaldo mensual provisionado: total sueldos / 12. */
export function aguinaldoMensual(payload: MonthlyExpensesPayload): number {
  return sumSueldos(payload) / 12;
}

/** Total gastos del mes = categorías + extras + sueldos + aguinaldo. */
export function totalGastosMensuales(payload: MonthlyExpensesPayload): number {
  let s = 0;
  for (const c of MONTHLY_CATEGORIES) s += payload[c.key] || 0;
  for (const c of MONTHLY_EXTRA_CATEGORIES) s += payload[c.key] || 0;
  s += sumSueldos(payload);
  s += aguinaldoMensual(payload);
  return s;
}
