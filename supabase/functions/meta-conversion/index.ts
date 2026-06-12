import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Leer secrets en cada request (no al cargar el módulo). */
const getMetaEnv = () => ({
  pixelId: (Deno.env.get("META_PIXEL_ID") ?? "").trim(),
  accessToken: (
    Deno.env.get("META_ACCESS_TOKEN") ?? Deno.env.get("API_META") ?? ""
  ).trim(),
  apiVersion: (Deno.env.get("META_API_VERSION") ?? "v21.0").trim(),
  testEventCode: (Deno.env.get("META_TEST_EVENT_CODE") ?? "").trim(),
  eventSourceUrl: (
    Deno.env.get("META_EVENT_SOURCE_URL") ?? "https://www.alcohncnc.com"
  ).trim(),
  currency: (Deno.env.get("META_CURRENCY") ?? "ARS").trim(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sha256Hex = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const hashEmail = async (email: string | null | undefined): Promise<string | null> => {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return sha256Hex(normalized);
};

/** Meta: solo dígitos, con código de país (ej. 54911...). */
const normalizePhone = (phone: string | null | undefined): string | null => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("54")) return digits;
  if (digits.startsWith("9") && digits.length >= 10) return `54${digits}`;
  if (digits.length >= 8 && digits.length <= 11) return `54${digits}`;
  return digits;
};

const hashPhone = async (phone: string | null | undefined): Promise<string | null> => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return sha256Hex(normalized);
};

const hashNamePart = async (value: string | null | undefined): Promise<string | null> => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return sha256Hex(normalized);
};

const toUnixSeconds = (isoOrDate: string | null | undefined): number => {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return Math.floor(Date.now() / 1000);
  return Math.floor(d.getTime() / 1000);
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

type OrdenRow = {
  id: string;
  origen: string | null;
  estado_pago_web: string | null;
  valor_total: number | string | null;
  created_at: string | null;
  pago_confirmado_at: string | null;
  fecha: string | null;
  clientes: {
    nombre: string | null;
    apellido: string | null;
    telefono: string | null;
    mail: string | null;
  } | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const metaEnv = getMetaEnv();

  if (!metaEnv.pixelId || !metaEnv.accessToken) {
    return new Response(
      JSON.stringify({
        error: "META_PIXEL_ID o META_ACCESS_TOKEN no configurados en secrets",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await req.json();
    const ordenId = String(body?.orden_id ?? "").trim();

    if (!ordenId) {
      return new Response(JSON.stringify({ error: "orden_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY") ??
      "";

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase no configurado en Edge Function" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from("meta_conversion_log")
      .select("orden_id, sent_at, meta_response")
      .eq("orden_id", ordenId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "already_sent",
          orden_id: ordenId,
          sent_at: existing.sent_at,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: orden, error: ordenError } = await supabase
      .from("ordenes")
      .select(`
        id,
        origen,
        estado_pago_web,
        valor_total,
        created_at,
        pago_confirmado_at,
        fecha,
        clientes (
          nombre,
          apellido,
          telefono,
          mail
        )
      `)
      .eq("id", ordenId)
      .single();

    if (ordenError || !orden) {
      return new Response(
        JSON.stringify({ error: "Orden no encontrada", details: ordenError }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const row = orden as OrdenRow;
    const esWeb = row.origen === "Web";
    const pagado = row.estado_pago_web === "pagado";

    if (esWeb && !pagado) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: "web_order_not_paid",
          orden_id: ordenId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const cliente = row.clientes;
    const emHash = await hashEmail(cliente?.mail);
    const phHash = await hashPhone(cliente?.telefono);
    const fnHash = await hashNamePart(cliente?.nombre);
    const lnHash = await hashNamePart(cliente?.apellido);

    if (!emHash && !phHash) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: "missing_customer_identifiers",
          orden_id: ordenId,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const purchaseAt = row.pago_confirmado_at ?? row.created_at ?? row.fecha;
    const eventTime = toUnixSeconds(purchaseAt);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 7 * 24 * 60 * 60;

    if (eventTime < nowSeconds - maxAgeSeconds) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: "event_time_older_than_7_days",
          orden_id: ordenId,
          event_time: eventTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userData: Record<string, string[]> = {};
    if (emHash) userData.em = [emHash];
    if (phHash) userData.ph = [phHash];
    if (fnHash) userData.fn = [fnHash];
    if (lnHash) userData.ln = [lnHash];

    const eventPayload: Record<string, unknown> = {
      event_name: "Purchase",
      event_time: eventTime,
      event_id: ordenId,
      action_source: esWeb ? "website" : "physical_store",
      user_data: userData,
      custom_data: {
        currency: metaEnv.currency,
        value: toNumber(row.valor_total),
      },
    };

    if (esWeb) {
      eventPayload.event_source_url = metaEnv.eventSourceUrl;
    }

    const metaBody: Record<string, unknown> = {
      data: [eventPayload],
    };

    if (metaEnv.testEventCode) {
      metaBody.test_event_code = metaEnv.testEventCode;
    }

    const metaUrl =
      `https://graph.facebook.com/${metaEnv.apiVersion}/${metaEnv.pixelId}/events` +
      `?access_token=${encodeURIComponent(metaEnv.accessToken)}`;

    const metaResponse = await fetch(metaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaBody),
    });

    const metaText = await metaResponse.text();
    let metaJson: unknown;
    try {
      metaJson = JSON.parse(metaText);
    } catch {
      metaJson = { raw: metaText };
    }

    const success = metaResponse.ok;
    const metaResponseWithDebug = {
      ...(typeof metaJson === "object" && metaJson !== null
        ? metaJson as Record<string, unknown>
        : { raw: metaJson }),
      _debug: {
        pixel_id: metaEnv.pixelId,
        test_event_code: metaEnv.testEventCode || null,
        action_source: eventPayload.action_source,
      },
    };

    await supabase.from("meta_conversion_log").insert({
      orden_id: ordenId,
      event_id: ordenId,
      event_time: eventTime,
      event_name: "Purchase",
      valor_total: toNumber(row.valor_total),
      currency: metaEnv.currency,
      success,
      meta_response: metaResponseWithDebug,
    });

    return new Response(
      JSON.stringify({
        success,
        orden_id: ordenId,
        event_time: eventTime,
        purchase_at: purchaseAt,
        meta_status: metaResponse.status,
        meta_response: metaResponseWithDebug,
      }),
      {
        status: success ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("meta-conversion error", message);

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
