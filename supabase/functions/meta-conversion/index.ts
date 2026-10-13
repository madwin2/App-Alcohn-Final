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
  attrSupabaseUrl: (Deno.env.get("META_ATTR_SUPABASE_URL") ?? "").trim(),
  attrSupabaseKey: (Deno.env.get("META_ATTR_SUPABASE_KEY") ?? "").trim(),
});

const ATTR_LOOKUP_TIMEOUT_MS = 2000;

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

/**
 * Forma canónica WA / clientes AR: 549 + número local.
 * Alineado a normalizePhoneDigitsCliente del frontend.
 */
const normalizePhoneWaId = (phone: string | null | undefined): string | null => {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;

  if (d.startsWith("549")) return d;
  if (d.startsWith("54") && d.length >= 11) return `549${d.slice(2)}`;
  if (d.startsWith("9") && d.length >= 10) return `54${d}`;
  if (d.length === 10) return `549${d}`;
  if (d.length === 11 && d.startsWith("0")) return `549${d.slice(1)}`;
  if (d.startsWith("54")) return d;
  return `54${d}`;
};

/** Variantes para match contra whatsapp_ad_referrals.wa_id (suele ser 549…). */
const waIdCandidates = (phone: string | null | undefined): string[] => {
  const canonical = normalizePhoneWaId(phone);
  if (!canonical) return [];

  const variants = new Set<string>([canonical]);
  if (canonical.startsWith("549") && canonical.length > 3) {
    variants.add(`54${canonical.slice(3)}`);
  }
  if (canonical.startsWith("54") && !canonical.startsWith("549") && canonical.length >= 12) {
    variants.add(`549${canonical.slice(2)}`);
  }
  return [...variants];
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

type WaAdReferral = {
  id: string;
  wa_id: string;
  ctwa_clid: string;
  source_url: string | null;
  source_id: string | null;
  source_type: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  message_timestamp: string | null;
  created_at: string;
};

type AttrLookupResult = {
  referral: WaAdReferral | null;
  status: "matched" | "not_found" | "skipped_no_config" | "skipped_no_phone" | "error" | "timeout";
  error?: string;
  wa_id_tried?: string[];
};

const referralSortKey = (row: WaAdReferral): number => {
  const raw = row.message_timestamp ?? row.created_at;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("attr_lookup_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });

/** Soft-fail: nunca bloquea el Purchase si el otro proyecto falla. */
const lookupWhatsappAdReferral = async (
  phone: string | null | undefined,
  attrUrl: string,
  attrKey: string,
): Promise<AttrLookupResult> => {
  if (!attrUrl || !attrKey) {
    return { referral: null, status: "skipped_no_config" };
  }

  const candidates = waIdCandidates(phone);
  if (!candidates.length) {
    return { referral: null, status: "skipped_no_phone" };
  }

  try {
    const attrClient = createClient(attrUrl, attrKey);
    const query = attrClient
      .from("whatsapp_ad_referrals")
      .select(
        "id, wa_id, ctwa_clid, source_url, source_id, source_type, phone_number_id, waba_id, message_timestamp, created_at",
      )
      .in("wa_id", candidates)
      .not("ctwa_clid", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    const { data, error } = await withTimeout(
      Promise.resolve(query),
      ATTR_LOOKUP_TIMEOUT_MS,
    );

    if (error) {
      console.error("meta-conversion attr lookup error", error.message);
      return {
        referral: null,
        status: "error",
        error: error.message,
        wa_id_tried: candidates,
      };
    }

    const rows = (data ?? []).filter(
      (row): row is WaAdReferral =>
        Boolean(row && typeof row.ctwa_clid === "string" && row.ctwa_clid.trim()),
    );

    if (!rows.length) {
      return { referral: null, status: "not_found", wa_id_tried: candidates };
    }

    rows.sort((a, b) => referralSortKey(b) - referralSortKey(a));
    return { referral: rows[0], status: "matched", wa_id_tried: candidates };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "attr_lookup_timeout") {
      console.error("meta-conversion attr lookup timeout");
      return { referral: null, status: "timeout", wa_id_tried: candidates };
    }
    console.error("meta-conversion attr lookup exception", message);
    return {
      referral: null,
      status: "error",
      error: message,
      wa_id_tried: candidates,
    };
  }
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

    const attrLookup = await lookupWhatsappAdReferral(
      cliente?.telefono,
      metaEnv.attrSupabaseUrl,
      metaEnv.attrSupabaseKey,
    );
    const referral = attrLookup.referral;
    const hasCtwa = Boolean(referral?.ctwa_clid);

    const userData: Record<string, unknown> = {};
    if (emHash) userData.em = [emHash];
    if (phHash) userData.ph = [phHash];
    if (fnHash) userData.fn = [fnHash];
    if (lnHash) userData.ln = [lnHash];
    if (hasCtwa && referral) {
      userData.ctwa_clid = referral.ctwa_clid.trim();
      const wabaId = (referral.waba_id ?? "").trim();
      if (wabaId) {
        userData.whatsapp_business_account_id = wabaId;
      }
    }

    let actionSource: string;
    if (hasCtwa) {
      actionSource = "business_messaging";
    } else if (esWeb) {
      actionSource = "website";
    } else {
      actionSource = "physical_store";
    }

    const eventPayload: Record<string, unknown> = {
      event_name: "Purchase",
      event_time: eventTime,
      event_id: ordenId,
      action_source: actionSource,
      user_data: userData,
      custom_data: {
        currency: metaEnv.currency,
        value: toNumber(row.valor_total),
      },
    };

    if (hasCtwa) {
      // Requerido por CAPI for Business Messaging (CTWA).
      eventPayload.messaging_channel = "whatsapp";
      if (referral?.source_url) {
        eventPayload.event_source_url = referral.source_url;
      }
    } else if (esWeb) {
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
        wa_attribution: {
          status: attrLookup.status,
          error: attrLookup.error ?? null,
          wa_id_tried: attrLookup.wa_id_tried ?? null,
          referral_id: referral?.id ?? null,
          wa_id_matched: referral?.wa_id ?? null,
          ctwa_clid: referral?.ctwa_clid ?? null,
          source_url: referral?.source_url ?? null,
          source_id: referral?.source_id ?? null,
          source_type: referral?.source_type ?? null,
          phone_number_id: referral?.phone_number_id ?? null,
          waba_id: referral?.waba_id ?? null,
        },
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
        wa_attribution_status: attrLookup.status,
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
