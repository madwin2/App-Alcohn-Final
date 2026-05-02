import { supabase } from '@/lib/supabase/client';
import {
  mergeMonthlyPayload,
  type MonthlyExpensesPayload,
  totalGastosMensuales,
} from '@/lib/gastos/monthlyOperationalCosts';

/** Todas las filas; clave = YYYY-MM. */
export async function fetchAllGastosMensuales(): Promise<Record<string, MonthlyExpensesPayload>> {
  const { data, error } = await supabase.from('gastos_mensuales').select('mes, data');

  if (error) throw error;
  const out: Record<string, MonthlyExpensesPayload> = {};
  for (const row of data ?? []) {
    out[row.mes] = mergeMonthlyPayload(row.data);
  }
  return out;
}

/** Mapa mes → total ARS (para Economía). */
export async function fetchTotalesGastosMensualesPorMes(): Promise<Record<string, number>> {
  const byMonth = await fetchAllGastosMensuales();
  const totals: Record<string, number> = {};
  for (const [mes, payload] of Object.entries(byMonth)) {
    totals[mes] = totalGastosMensuales(payload);
  }
  return totals;
}

export async function upsertGastosMensuales(mes: string, payload: MonthlyExpensesPayload): Promise<void> {
  const { error } = await supabase.from('gastos_mensuales').upsert(
    {
      mes,
      data: payload as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'mes' },
  );

  if (error) throw error;
}
