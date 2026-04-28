import { supabase } from '@/lib/supabase/client';
import { mergeVariableCostsFromDb, variableCostsToParamsJson, type VariableCostsState } from '@/lib/gastos/variableCosts';

export type LatestFabricacionParams = {
  id: string;
  effectiveFrom: string;
  params: VariableCostsState;
  note: string | null;
};

export async function fetchLatestFabricacionParams(): Promise<LatestFabricacionParams | null> {
  const { data, error } = await supabase
    .from('fabricacion_parametros')
    .select('id, effective_from, params, note')
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    effectiveFrom: data.effective_from,
    params: mergeVariableCostsFromDb(data.params),
    note: data.note ?? null,
  };
}

/**
 * Nueva versión de parámetros en DB (INSERT). Los ítems nuevos usarán esta tarifa según `effective_from`.
 */
export async function insertFabricacionParamsVersion(
  state: VariableCostsState,
  options?: { effectiveFromIso?: string; note?: string },
): Promise<void> {
  const effective_from = options?.effectiveFromIso ?? new Date().toISOString();
  const params = variableCostsToParamsJson(state);

  const { error } = await supabase.from('fabricacion_parametros').insert({
    effective_from,
    params,
    note: options?.note ?? 'App Gastos',
  });

  if (error) throw error;
}
