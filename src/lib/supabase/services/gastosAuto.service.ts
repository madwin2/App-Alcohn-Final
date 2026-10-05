import { supabase } from '@/lib/supabase/client';
import {
  DEFAULT_CONTROL_GASTOS_CONFIG,
  type ControlGastosConfig,
  type GastoAutoCategoria,
  type GastoMoneda,
  type GastoProveedor,
  type GastoRegistro,
  type PagoUsd,
} from '@/lib/gastos/gastosAuto';

export const GASTOS_SYNC_FN = 'gastos-sync';

export type GastoRecurrente = {
  id: string;
  nombre: string;
  categoria: GastoAutoCategoria;
  moneda: GastoMoneda;
  monto: number;
  ivaAplica: boolean;
  diaDelMes: number;
  activo: boolean;
};

export type CotizacionUsd = { fecha: string; blueVenta: number; oficialVenta: number | null };

export type SyncLogRow = { proveedor: string; ok: boolean; detalle: string | null; filas: number | null; createdAt: string };

export type GastosAutoData = {
  config: ControlGastosConfig;
  registros: GastoRegistro[];
  pagos: PagoUsd[];
  cotizacion: CotizacionUsd | null;
  ultimosSync: SyncLogRow[];
};

async function fetchConfig(): Promise<ControlGastosConfig> {
  const { data, error } = await supabase
    .from('control_gastos_config')
    .select('objetivo_rentabilidad, iva_pct, otros_impuestos_usd_pct, fecha_inicio')
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_CONTROL_GASTOS_CONFIG;
  return {
    objetivoRentabilidad: Number(data.objetivo_rentabilidad),
    ivaPct: Number(data.iva_pct),
    otrosImpuestosUsdPct: Number(data.otros_impuestos_usd_pct),
    fechaInicio: data.fecha_inicio,
  };
}

async function fetchRegistros(desde: string): Promise<GastoRegistro[]> {
  const out: GastoRegistro[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('gastos_registros')
      .select('id, fecha, proveedor, categoria, concepto, external_ref, moneda, monto, iva_aplica')
      .gte('fecha', desde)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data || []) {
      out.push({
        id: r.id,
        fecha: r.fecha,
        proveedor: r.proveedor as GastoProveedor,
        categoria: r.categoria as GastoAutoCategoria,
        concepto: r.concepto,
        externalRef: r.external_ref,
        moneda: r.moneda as GastoMoneda,
        monto: Number(r.monto) || 0,
        ivaAplica: !!r.iva_aplica,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function fetchPagosUsd(): Promise<PagoUsd[]> {
  const { data, error } = await supabase
    .from('gastos_pagos_usd')
    .select('id, mes, fecha, usd, cotizacion, nota')
    .order('fecha', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    mes: r.mes,
    fecha: r.fecha,
    usd: Number(r.usd) || 0,
    cotizacion: Number(r.cotizacion) || 0,
    nota: r.nota,
  }));
}

export async function fetchUltimaCotizacion(hasta?: string): Promise<CotizacionUsd | null> {
  let q = supabase.from('cotizaciones_usd').select('fecha, blue_venta, oficial_venta').order('fecha', { ascending: false }).limit(1);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    fecha: data.fecha,
    blueVenta: Number(data.blue_venta),
    oficialVenta: data.oficial_venta != null ? Number(data.oficial_venta) : null,
  };
}

async function fetchUltimosSync(): Promise<SyncLogRow[]> {
  const { data, error } = await supabase
    .from('gastos_sync_log')
    .select('proveedor, ok, detalle, filas, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  // Último por proveedor.
  const seen = new Set<string>();
  const out: SyncLogRow[] = [];
  for (const r of data || []) {
    if (seen.has(r.proveedor)) continue;
    seen.add(r.proveedor);
    out.push({ proveedor: r.proveedor, ok: r.ok, detalle: r.detalle, filas: r.filas, createdAt: r.created_at });
  }
  return out;
}

export async function fetchGastosAutoData(): Promise<GastosAutoData> {
  const config = await fetchConfig();
  const [registros, pagos, cotizacion, ultimosSync] = await Promise.all([
    fetchRegistros(config.fechaInicio),
    fetchPagosUsd(),
    fetchUltimaCotizacion(),
    fetchUltimosSync(),
  ]);
  return { config, registros, pagos, cotizacion, ultimosSync };
}

export async function createPagoUsd(input: { mes: string; fecha: string; usd: number; cotizacion: number; nota?: string }): Promise<void> {
  const { error } = await supabase.from('gastos_pagos_usd').insert({
    mes: input.mes,
    fecha: input.fecha,
    usd: input.usd,
    cotizacion: input.cotizacion,
    nota: input.nota?.trim() || null,
  });
  if (error) throw error;
}

export async function deletePagoUsd(id: string): Promise<void> {
  const { error } = await supabase.from('gastos_pagos_usd').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchGastosRecurrentes(): Promise<GastoRecurrente[]> {
  const { data, error } = await supabase
    .from('gastos_recurrentes')
    .select('id, nombre, categoria, moneda, monto, iva_aplica, dia_del_mes, activo')
    .order('activo', { ascending: false })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria as GastoAutoCategoria,
    moneda: r.moneda as GastoMoneda,
    monto: Number(r.monto) || 0,
    ivaAplica: !!r.iva_aplica,
    diaDelMes: Number(r.dia_del_mes) || 1,
    activo: !!r.activo,
  }));
}

export async function upsertGastoRecurrente(input: Omit<GastoRecurrente, 'id'> & { id?: string }): Promise<void> {
  const row = {
    nombre: input.nombre.trim(),
    categoria: input.categoria,
    moneda: input.moneda,
    monto: input.monto,
    iva_aplica: input.ivaAplica,
    dia_del_mes: input.diaDelMes,
    activo: input.activo,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await supabase.from('gastos_recurrentes').update(row).eq('id', input.id)
    : await supabase.from('gastos_recurrentes').insert(row);
  if (error) throw error;
}

/** Corre la sincronización ahora (cotización, recurrentes, Meta, OpenAI). */
export async function ejecutarSyncGastos(): Promise<void> {
  const { error } = await supabase.functions.invoke(GASTOS_SYNC_FN, { body: { origen: 'app' } });
  if (error) throw error;
}
