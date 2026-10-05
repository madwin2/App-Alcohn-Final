// Recibe el gasto diario por campaña que manda el script de Google Ads
// (`scripts/google-ads/enviar-gastos.js`). Sin JWT: se valida con el header `x-ingest-secret`
// contra el secreto `GOOGLE_ADS_INGEST_SECRET`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json, logSync, reemplazarRegistrosRango, type RegistroInput } from "../_shared/gastosRegistros.ts";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
  currency?: string;
  desde?: string;
  hasta?: string;
  rows?: Array<{ date?: string; campaignId?: string | number; campaignName?: string; cost?: number }>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = (Deno.env.get("GOOGLE_ADS_INGEST_SECRET") ?? "").trim();
  if (!secret || req.headers.get("x-ingest-secret") !== secret) return json({ error: "No autorizado" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const body = (await req.json()) as Body;
    const currency = String(body.currency ?? "").toUpperCase();
    if (currency !== "USD" && currency !== "ARS") throw new Error(`moneda no soportada: ${currency}`);
    if (!body.desde || !body.hasta || !FECHA.test(body.desde) || !FECHA.test(body.hasta) || body.desde > body.hasta) {
      throw new Error("rango desde/hasta inválido");
    }

    const { data: cfg } = await db.from("control_gastos_config").select("fecha_inicio").maybeSingle();
    const inicio: string = cfg?.fecha_inicio ?? "2026-09-29";
    const desde = body.desde < inicio ? inicio : body.desde;
    if (desde > body.hasta) return json({ ok: true, filas: 0, nota: "rango anterior a fecha_inicio" });

    const rows: RegistroInput[] = (body.rows ?? [])
      .filter((r) => r.date && FECHA.test(r.date))
      .map((r) => ({
        fecha: r.date!,
        categoria: "publicidad",
        concepto: r.campaignName || String(r.campaignId ?? "Google Ads"),
        external_ref: String(r.campaignId ?? ""),
        moneda: currency as "USD" | "ARS",
        monto: Number(r.cost) || 0,
        iva_aplica: true,
      }));

    const n = await reemplazarRegistrosRango(db, "google_ads", desde, body.hasta, rows);
    await logSync(db, "google_ads", true, `${desde} → ${body.hasta} (${currency})`, n);
    return json({ ok: true, filas: n });
  } catch (e) {
    await logSync(db, "google_ads", false, String(e));
    return json({ ok: false, error: String(e) }, 400);
  }
});
