// Sincronización diaria de gastos (PLAN_CONTROL_GASTOS.md, Etapa 1).
// Pasos: cotización dólar blue → recurrentes del mes → Meta Ads → OpenAI.
// Cada paso es independiente: si falta un secreto se saltea; si falla se registra en `gastos_sync_log`.
// Lo llama el cron `gastos-sync-diario` (07:00 AR) y el botón "Actualizar ahora" de Gastos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
  hoyAR,
  json,
  logSync,
  reemplazarRegistrosRango,
  restarDias,
  type RegistroInput,
} from "../_shared/gastosRegistros.ts";

/** Días hacia atrás que se re-sincronizan (las plataformas ajustan el gasto de días recientes). */
const DIAS_RESYNC = 7;

type Config = { fecha_inicio: string; openai_proyectos: Record<string, string> };

async function leerConfig(db: SupabaseClient): Promise<Config> {
  const { data, error } = await db
    .from("control_gastos_config")
    .select("fecha_inicio, openai_proyectos")
    .maybeSingle();
  if (error) throw new Error(`config: ${error.message}`);
  return {
    fecha_inicio: data?.fecha_inicio ?? "2026-09-29",
    openai_proyectos: (data?.openai_proyectos as Record<string, string>) ?? {},
  };
}

/** Desde fecha_inicio si el proveedor nunca sincronizó; si no, los últimos DIAS_RESYNC días. */
async function calcularDesde(db: SupabaseClient, proveedor: string, cfg: Config, hoy: string): Promise<string> {
  const { count } = await db
    .from("gastos_registros")
    .select("id", { count: "exact", head: true })
    .eq("proveedor", proveedor);
  if (!count) return cfg.fecha_inicio;
  const d = restarDias(hoy, DIAS_RESYNC);
  return d < cfg.fecha_inicio ? cfg.fecha_inicio : d;
}

// ---------------------------------------------------------------------------
async function syncCotizacion(db: SupabaseClient, hoy: string) {
  const get = async (tipo: string) => {
    const r = await fetch(`https://dolarapi.com/v1/dolares/${tipo}`);
    if (!r.ok) throw new Error(`dolarapi ${tipo}: HTTP ${r.status}`);
    const j = await r.json();
    const venta = Number(j?.venta);
    if (!(venta > 0)) throw new Error(`dolarapi ${tipo}: venta inválida`);
    return venta;
  };
  const blue = await get("blue");
  const oficial = await get("oficial").catch(() => null);
  const { error } = await db.from("cotizaciones_usd").upsert({
    fecha: hoy,
    blue_venta: blue,
    oficial_venta: oficial,
    fuente: "dolarapi",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return `blue ${blue}`;
}

// ---------------------------------------------------------------------------
async function syncRecurrentes(db: SupabaseClient, hoy: string) {
  const { data, error } = await db.rpc("generar_gastos_recurrentes", { p_hoy: hoy });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

// ---------------------------------------------------------------------------
async function syncMeta(db: SupabaseClient, cfg: Config, hoy: string) {
  const accountRaw = (Deno.env.get("META_ADS_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("META_ADS_TOKEN") ?? "").trim();
  if (!accountRaw || !token) return null;
  const version = (Deno.env.get("META_API_VERSION") ?? "v21.0").trim();
  const account = accountRaw.startsWith("act_") ? accountRaw : `act_${accountRaw}`;
  const base = `https://graph.facebook.com/${version}`;

  const accRes = await fetch(`${base}/${account}?fields=currency&access_token=${encodeURIComponent(token)}`);
  const acc = await accRes.json();
  if (!accRes.ok) throw new Error(`cuenta: ${acc?.error?.message ?? accRes.status}`);
  const currency = String(acc.currency ?? "").toUpperCase();
  if (currency !== "USD" && currency !== "ARS") throw new Error(`moneda de la cuenta no soportada: ${currency}`);

  const desde = await calcularDesde(db, "meta_ads", cfg, hoy);
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    fields: "campaign_id,campaign_name,spend",
    time_range: JSON.stringify({ since: desde, until: hoy }),
    limit: "500",
    access_token: token,
  });
  const rows: RegistroInput[] = [];
  let url: string | null = `${base}/${account}/insights?${params}`;
  while (url) {
    const res = await fetch(url);
    const j = await res.json();
    if (!res.ok) throw new Error(`insights: ${j?.error?.message ?? res.status}`);
    for (const it of j.data ?? []) {
      rows.push({
        fecha: it.date_start,
        categoria: "publicidad",
        concepto: it.campaign_name || it.campaign_id,
        external_ref: String(it.campaign_id ?? ""),
        moneda: currency as "USD" | "ARS",
        monto: Number(it.spend) || 0,
        iva_aplica: true,
      });
    }
    url = j.paging?.next ?? null;
  }
  const n = await reemplazarRegistrosRango(db, "meta_ads", desde, hoy, rows);
  return { n, detalle: `${desde} → ${hoy} (${currency})` };
}

// ---------------------------------------------------------------------------
async function syncOpenAI(db: SupabaseClient, cfg: Config, hoy: string) {
  const key = (Deno.env.get("OPENAI_ADMIN_KEY") ?? "").trim();
  if (!key) return null;
  const headers = { Authorization: `Bearer ${key}` };

  // Nombres de proyectos (la config puede sobrescribirlos).
  const nombres: Record<string, string> = {};
  const pr = await fetch("https://api.openai.com/v1/organization/projects?limit=100&include_archived=true", { headers });
  if (pr.ok) {
    const pj = await pr.json();
    for (const p of pj.data ?? []) nombres[p.id] = p.name;
  }
  Object.assign(nombres, cfg.openai_proyectos);

  const desde = await calcularDesde(db, "openai", cfg, hoy);
  const startTime = Math.floor(Date.parse(`${desde}T00:00:00Z`) / 1000);
  const rows: RegistroInput[] = [];
  let page: string | null = null;
  do {
    const qs = new URLSearchParams({ start_time: String(startTime), bucket_width: "1d", limit: "31" });
    qs.append("group_by", "project_id");
    if (page) qs.set("page", page);
    const res = await fetch(`https://api.openai.com/v1/organization/costs?${qs}`, { headers });
    const j = await res.json();
    if (!res.ok) throw new Error(`costs: ${j?.error?.message ?? res.status}`);
    for (const bucket of j.data ?? []) {
      const fecha = new Date(Number(bucket.start_time) * 1000).toISOString().slice(0, 10);
      for (const r of bucket.results ?? []) {
        const pid = r.project_id ?? "sin-proyecto";
        rows.push({
          fecha,
          categoria: "automatizaciones",
          concepto: nombres[pid] ?? (pid === "sin-proyecto" ? "OpenAI (sin proyecto)" : pid),
          external_ref: pid,
          moneda: "USD",
          monto: Number(r.amount?.value) || 0,
          iva_aplica: true,
        });
      }
    }
    page = j.has_more ? j.next_page : null;
  } while (page);

  const n = await reemplazarRegistrosRango(db, "openai", desde, hoy, rows);
  return { n, detalle: `${desde} → ${hoy}` };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const hoy = hoyAR();
  const resultado: Record<string, unknown> = { hoy };

  let cfg: Config;
  try {
    cfg = await leerConfig(db);
  } catch (e) {
    await logSync(db, "config", false, String(e));
    return json({ ok: false, error: String(e) }, 500);
  }

  const paso = async (proveedor: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      if (r === null) {
        resultado[proveedor] = "sin configurar";
        return;
      }
      const filas = typeof r === "number" ? r : (r as { n?: number })?.n ?? null;
      const detalle = typeof r === "string" ? r : (r as { detalle?: string })?.detalle ?? null;
      resultado[proveedor] = { ok: true, filas, detalle };
      await logSync(db, proveedor, true, detalle, filas);
    } catch (e) {
      resultado[proveedor] = { ok: false, error: String(e) };
      await logSync(db, proveedor, false, String(e));
    }
  };

  await paso("cotizacion", () => syncCotizacion(db, hoy));
  await paso("recurrentes", () => syncRecurrentes(db, hoy));
  await paso("meta_ads", () => syncMeta(db, cfg, hoy));
  await paso("openai", () => syncOpenAI(db, cfg, hoy));

  return json({ ok: true, ...resultado });
});
