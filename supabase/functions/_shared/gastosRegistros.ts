// Helpers compartidos por `gastos-sync` y `gastos-ingest-google` (PLAN_CONTROL_GASTOS.md).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type RegistroInput = {
  fecha: string; // YYYY-MM-DD
  categoria: "publicidad" | "automatizaciones" | "gastos_varios";
  concepto: string;
  external_ref: string;
  moneda: "USD" | "ARS";
  monto: number;
  iva_aplica: boolean;
  raw?: unknown;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Hoy en Argentina (YYYY-MM-DD). */
export const hoyAR = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

export const restarDias = (fecha: string, n: number): string => {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
};

/**
 * Reemplaza los registros de un proveedor en [desde, hasta]: upsert de lo nuevo y borra lo que
 * ya no viene (campañas renombradas, gasto ajustado a 0). Idempotente.
 */
export async function reemplazarRegistrosRango(
  db: SupabaseClient,
  proveedor: string,
  desde: string,
  hasta: string,
  rows: RegistroInput[],
): Promise<number> {
  // Consolidar duplicados (mismo día + ref + concepto).
  const map = new Map<string, RegistroInput>();
  for (const r of rows) {
    if (r.fecha < desde || r.fecha > hasta) continue;
    if (!(r.monto > 0)) continue;
    const key = `${r.fecha}|${r.external_ref}|${r.concepto}`;
    const prev = map.get(key);
    if (prev) prev.monto += r.monto;
    else map.set(key, { ...r });
  }
  const payload = [...map.values()].map((r) => ({
    ...r,
    proveedor,
    monto: Math.round(r.monto * 10000) / 10000,
    synced_at: new Date().toISOString(),
  }));

  const keepIds: string[] = [];
  if (payload.length) {
    const { data, error } = await db
      .from("gastos_registros")
      .upsert(payload, { onConflict: "proveedor,fecha,external_ref,concepto" })
      .select("id");
    if (error) throw new Error(`upsert ${proveedor}: ${error.message}`);
    for (const r of data ?? []) keepIds.push(r.id as string);
  }

  let del = db.from("gastos_registros").delete().eq("proveedor", proveedor).gte("fecha", desde).lte("fecha", hasta);
  if (keepIds.length) del = del.not("id", "in", `(${keepIds.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) throw new Error(`limpieza ${proveedor}: ${delErr.message}`);

  return payload.length;
}

export async function logSync(
  db: SupabaseClient,
  proveedor: string,
  ok: boolean,
  detalle: string | null,
  filas: number | null = null,
): Promise<void> {
  await db.from("gastos_sync_log").insert({ proveedor, ok, detalle: detalle?.slice(0, 2000) ?? null, filas });
}
