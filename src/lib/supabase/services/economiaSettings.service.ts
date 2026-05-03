import { supabase } from '@/lib/supabase/client';

export type EconomiaCajaRow = {
  efectivo: number;
  mercadopago: number;
  santanderCatalina: number;
  santanderJulian: number;
  bbva: number;
};

export type EconomiaSettingsRow = {
  usdReference: number;
  caja: EconomiaCajaRow;
  updatedAt: string | null;
};

export function emptyEconomiaCaja(): EconomiaCajaRow {
  return {
    efectivo: 0,
    mercadopago: 0,
    santanderCatalina: 0,
    santanderJulian: 0,
    bbva: 0,
  };
}

function mapRow(data: {
  usd_reference: number;
  caja_efectivo: number;
  caja_mercadopago: number;
  caja_santander_catalina: number;
  caja_santander_julian: number;
  caja_bbva: number;
  updated_at: string;
}): EconomiaSettingsRow {
  return {
    usdReference: Number(data.usd_reference) || 1200,
    caja: {
      efectivo: Number(data.caja_efectivo) || 0,
      mercadopago: Number(data.caja_mercadopago) || 0,
      santanderCatalina: Number(data.caja_santander_catalina) || 0,
      santanderJulian: Number(data.caja_santander_julian) || 0,
      bbva: Number(data.caja_bbva) || 0,
    },
    updatedAt: data.updated_at,
  };
}

export async function fetchEconomiaSettings(userId: string): Promise<EconomiaSettingsRow | null> {
  const { data, error } = await supabase
    .from('economia_settings')
    .select(
      'usd_reference, caja_efectivo, caja_mercadopago, caja_santander_catalina, caja_santander_julian, caja_bbva, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as Parameters<typeof mapRow>[0]);
}

/** Lee valores viejos guardados en el navegador (migración única a Supabase). */
export function readLegacyEconomiaLocalStorage(): { usdReference: number; caja: EconomiaCajaRow } | null {
  try {
    const usdRaw = localStorage.getItem('economia_usd_rate');
    const cajaRaw = localStorage.getItem('economia_flujo_caja');
    if (!usdRaw && !cajaRaw) return null;
    const usdReference = usdRaw ? Number(usdRaw) || 1200 : 1200;
    const caja = emptyEconomiaCaja();
    if (cajaRaw) {
      const p = JSON.parse(cajaRaw) as Partial<EconomiaCajaRow>;
      caja.efectivo = Number(p.efectivo) || 0;
      caja.mercadopago = Number(p.mercadopago) || 0;
      caja.santanderCatalina = Number(p.santanderCatalina) || 0;
      caja.santanderJulian = Number(p.santanderJulian) || 0;
      caja.bbva = Number(p.bbva) || 0;
    }
    return { usdReference, caja };
  } catch {
    return null;
  }
}

export function clearLegacyEconomiaLocalStorage(): void {
  try {
    localStorage.removeItem('economia_usd_rate');
    localStorage.removeItem('economia_flujo_caja');
  } catch {
    /* ignore */
  }
}

export async function upsertEconomiaSettings(
  userId: string,
  input: { usdReference: number; caja: EconomiaCajaRow },
): Promise<void> {
  const usd = Number(input.usdReference) || 1200;
  const c = input.caja;
  const { error } = await supabase.from('economia_settings').upsert(
    {
      user_id: userId,
      usd_reference: usd,
      caja_efectivo: Number(c.efectivo) || 0,
      caja_mercadopago: Number(c.mercadopago) || 0,
      caja_santander_catalina: Number(c.santanderCatalina) || 0,
      caja_santander_julian: Number(c.santanderJulian) || 0,
      caja_bbva: Number(c.bbva) || 0,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
