import { supabase } from '@/lib/supabase/client';
import {
  clearLegacyMonthlyLocalStorage,
  hydrateMonthlyCostsRuntime,
  normalizeMonthsFromUnknown,
  tryReadLegacyMonthlyFromLocalStorage,
  type MonthCostsBundle,
} from '@/lib/gastos/monthlyEconomiaCosts';

export type GastosMensualesRow = {
  months: Record<string, MonthCostsBundle>;
  legacyFixedScalar: number;
  updatedAt: string | null;
};

async function fetchGastosMensualesRow(userId: string): Promise<GastosMensualesRow | null> {
  const { data, error } = await supabase
    .from('economia_gastos_mensuales')
    .select('months, legacy_fixed_scalar, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    months: normalizeMonthsFromUnknown(data.months),
    legacyFixedScalar: Number(data.legacy_fixed_scalar) || 0,
    updatedAt: data.updated_at,
  };
}

export async function upsertGastosMensuales(
  userId: string,
  months: Record<string, MonthCostsBundle>,
  legacyFixedScalar: number,
): Promise<void> {
  const { error } = await supabase.from('economia_gastos_mensuales').upsert(
    {
      user_id: userId,
      months,
      legacy_fixed_scalar: Number(legacyFixedScalar) || 0,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

/**
 * Lee Supabase; si no hay datos y existe backup en localStorage (v1/v2/legado), sube y limpia el navegador.
 * Actualiza la caché en memoria compartida con Economía.
 */
export async function loadGastosMensualesIntoCache(userId: string): Promise<GastosMensualesRow> {
  let row = await fetchGastosMensualesRow(userId);
  let months = row?.months ?? {};
  let legacy = row?.legacyFixedScalar ?? 0;

  const dbEmpty = !row || (Object.keys(months).length === 0 && legacy === 0);
  if (dbEmpty) {
    const local = tryReadLegacyMonthlyFromLocalStorage();
    if (local && (Object.keys(local.months).length > 0 || local.legacyFixed > 0)) {
      await upsertGastosMensuales(userId, local.months, local.legacyFixed);
      clearLegacyMonthlyLocalStorage();
      row = await fetchGastosMensualesRow(userId);
      months = row?.months ?? local.months;
      legacy = row?.legacyFixedScalar ?? local.legacyFixed;
    }
  }

  hydrateMonthlyCostsRuntime(months, legacy);
  return { months, legacyFixedScalar: legacy, updatedAt: row?.updatedAt ?? null };
}
