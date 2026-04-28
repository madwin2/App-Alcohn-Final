import { supabase } from '@/lib/supabase/client';

export type RealMovementType = 'USD_PURCHASE' | 'INV_EMPRESA' | 'INV_CYPREA';

export type RealMovement = {
  id: string;
  date: string;
  type: RealMovementType;
  amountArs: number;
  amountUsd?: number;
  rate?: number;
  createdAt: string;
};

export async function fetchEconomiaMovimientosReales(): Promise<RealMovement[]> {
  const { data, error } = await supabase
    .from('economia_movimientos_reales')
    .select('id, movement_date, movement_type, amount_ars, amount_usd, usd_rate, created_at')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    date: row.movement_date,
    type: row.movement_type as RealMovementType,
    amountArs: Number(row.amount_ars || 0),
    amountUsd: row.amount_usd != null ? Number(row.amount_usd) : undefined,
    rate: row.usd_rate != null ? Number(row.usd_rate) : undefined,
    createdAt: row.created_at,
  }));
}

export async function createEconomiaMovimientoReal(input: {
  date: string;
  type: RealMovementType;
  amountArs: number;
  amountUsd?: number;
  rate?: number;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.from('economia_movimientos_reales').insert({
    movement_date: input.date,
    movement_type: input.type,
    amount_ars: input.amountArs,
    amount_usd: input.amountUsd ?? null,
    usd_rate: input.rate ?? null,
    note: input.note ?? null,
  });
  if (error) throw error;
}

export async function deleteEconomiaMovimientoReal(id: string): Promise<void> {
  const { error } = await supabase.from('economia_movimientos_reales').delete().eq('id', id);
  if (error) throw error;
}
