import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEB_PRECIO_LINK_MARKUP = 1.15;
const DEFAULT_WEB_SENIA = 20_000;

type WebCartItem = {
  id?: string;
  qty?: number;
  price?: number;
  precio_transferencia_ars?: number;
  precio_link_ars?: number;
  title?: string;
  designSlug?: string;
  variantSize?: string;
  collection?: string;
  material?: string;
};

type SelloInsert = {
  orden_id: string;
  item_type: string;
  tipo: string;
  diseno: string;
  valor: number;
  senia: number;
  estado_fabricacion: string;
  estado_venta: string;
  archivo_base: string | null;
  ancho_real: number | null;
  largo_real: number | null;
  mockup_solicitud_id: string | null;
  item_config: Record<string, unknown>;
  nota: string | null;
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const linkPriceToTransferencia = (linkPrice: number): number =>
  Math.round(linkPrice / WEB_PRECIO_LINK_MARKUP);

const resolveWebCartItemPrice = (
  item: WebCartItem,
  metodoPago: string | null | undefined,
): number => {
  const transferenciaExplicita =
    typeof item.precio_transferencia_ars === "number" &&
      Number.isFinite(item.precio_transferencia_ars)
      ? item.precio_transferencia_ars
      : null;

  const linkExplicito =
    typeof item.precio_link_ars === "number" && Number.isFinite(item.precio_link_ars)
      ? item.precio_link_ars
      : null;

  const priceFallback =
    typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null;

  if (metodoPago === "Transferencia") {
    if (transferenciaExplicita != null) return transferenciaExplicita;
    if (linkExplicito != null) return linkPriceToTransferencia(linkExplicito);
    if (priceFallback != null && priceFallback > 0) return priceFallback;
    return 0;
  }

  if (linkExplicito != null) return linkExplicito;
  if (priceFallback != null && priceFallback > 0) return priceFallback;
  if (transferenciaExplicita != null) {
    return Math.round(transferenciaExplicita * WEB_PRECIO_LINK_MARKUP);
  }
  return 0;
};

const asCartItems = (raw: unknown): WebCartItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is WebCartItem => item != null && typeof item === "object");
};

const readEnvioCosto = (notasWeb: Record<string, unknown> | null | undefined): number => {
  if (!notasWeb || typeof notasWeb !== "object") return 0;
  const envio = notasWeb.envio_costo;
  return typeof envio === "number" && Number.isFinite(envio) ? envio : 0;
};

const estimateWebOrdenTotal = (params: {
  notasWeb?: Record<string, unknown> | null;
  carritoJson?: unknown;
  metodoPago?: string | null;
  includeEnvio?: boolean;
}): number | null => {
  const items = asCartItems(params.carritoJson);
  const envio = readEnvioCosto(params.notasWeb);
  const addEnvio = params.includeEnvio !== false && params.metodoPago !== "Transferencia";

  if (items.length > 0) {
    let subtotal = 0;
    for (const item of items) {
      const qty = typeof item.qty === "number" && item.qty > 0 ? Math.floor(item.qty) : 1;
      const unitPrice = resolveWebCartItemPrice(item, params.metodoPago);
      if (unitPrice <= 0) return null;
      subtotal += unitPrice * qty;
    }
    return subtotal + (addEnvio ? envio : 0);
  }

  if (!params.notasWeb || typeof params.notasWeb !== "object") return null;
  const rawSubtotalTransferencia = params.notasWeb.subtotal_carrito_transferencia;
  const rawSubtotal = params.notasWeb.subtotal_carrito;
  let sub = 0;
  if (typeof rawSubtotalTransferencia === "number" && Number.isFinite(rawSubtotalTransferencia)) {
    sub = rawSubtotalTransferencia;
  } else if (typeof rawSubtotal === "number" && Number.isFinite(rawSubtotal)) {
    sub = rawSubtotal;
  }
  if (sub <= 0 && (!addEnvio || envio <= 0)) return null;
  return sub + (addEnvio ? envio : 0);
};

const resolveWebOrderSenia = (
  notasWeb: Record<string, unknown> | null | undefined,
  metodoPago?: string | null,
  carritoJson?: unknown,
): number => {
  if (notasWeb && typeof notasWeb === "object") {
    for (const key of [
      "senia_monto",
      "monto_senia",
      "senia_esperada",
      "monto_pagado",
      "total_pagado",
      "monto_cobrado",
      "monto_openpay",
    ] as const) {
      const raw = notasWeb[key];
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
    }
  }

  if (metodoPago && metodoPago !== "Transferencia") {
    const totalCobrado = estimateWebOrdenTotal({
      notasWeb,
      carritoJson,
      metodoPago,
      includeEnvio: true,
    });
    if (totalCobrado != null && totalCobrado > 0) return totalCobrado;
  }

  return DEFAULT_WEB_SENIA;
};

const allocateSeniaAcrossItems = (valores: number[], totalSenia: number): number[] => {
  let remaining = totalSenia;
  return valores.map((valor) => {
    if (remaining <= 0) return 0;
    const assigned = Math.min(remaining, valor);
    remaining -= assigned;
    return assigned;
  });
};

const parseVariantSizeCm = (
  variantSize: string | null | undefined,
): { ancho: number; largo: number } | null => {
  if (!variantSize?.trim()) return null;
  const normalized = variantSize.trim().replace(/,/g, ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
  if (!match) return null;

  let ancho = Number.parseFloat(match[1]);
  let largo = Number.parseFloat(match[2]);
  if (!Number.isFinite(ancho) || !Number.isFinite(largo)) return null;

  const unit = (match[3] ?? "cm").toLowerCase();
  if (unit === "mm") {
    ancho /= 10;
    largo /= 10;
  }

  return { ancho, largo };
};

const mockupDesignName = (mockup: Record<string, unknown> | null): string | null => {
  if (!mockup) return null;
  const nombreMuestra = typeof mockup.nombre_muestra === "string" ? mockup.nombre_muestra.trim() : "";
  const nombreSlug = typeof mockup.nombre_slug === "string" ? mockup.nombre_slug.trim() : "";
  return nombreMuestra || nombreSlug || null;
};

const isGenericWebCartTitle = (title: string | null | undefined): boolean => {
  if (!title?.trim()) return true;
  const normalized = title.trim().toLowerCase();
  return normalized === "sello personalizado" || normalized === "sello web" || normalized === "sello";
};

const resolveWebSelloDesignName = (params: {
  disenoNombre?: string | null;
  item: WebCartItem;
  mockup: Record<string, unknown> | null;
}): string => {
  const manual = params.disenoNombre?.trim();
  if (manual) return manual;

  const title = params.item.title?.trim();
  if (title && !isGenericWebCartTitle(title)) return title;

  return (
    mockupDesignName(params.mockup) ||
    params.item.designSlug?.trim() ||
    "Sello web"
  );
};

const mockupBaseUrl = (mockup: Record<string, unknown> | null): string | null => {
  if (!mockup) return null;
  const optimizadaUrl = typeof mockup.imagen_optimizada_url === "string"
    ? mockup.imagen_optimizada_url
    : null;
  const baseUrl = typeof mockup.archivo_base_url === "string" ? mockup.archivo_base_url : null;
  const url = optimizadaUrl || baseUrl;
  if (url) return url;
  const optimizadaPath = typeof mockup.imagen_optimizada_path === "string"
    ? mockup.imagen_optimizada_path.trim()
    : "";
  const basePath = typeof mockup.archivo_base_path === "string" ? mockup.archivo_base_path.trim() : "";
  return optimizadaPath || basePath || null;
};

const buildSellosFromWebCheckout = (params: {
  ordenId: string;
  carritoJson: unknown;
  notasWeb?: Record<string, unknown> | null;
  metodoPago?: string | null;
  mockup?: Record<string, unknown> | null;
  mockupSolicitudId?: string | null;
  seniaMonto?: number | null;
  disenoNombre?: string | null;
}): SelloInsert[] => {
  const items = asCartItems(params.carritoJson);
  if (items.length === 0) {
    throw new Error("El pedido no tiene ítems en carrito_json. No se pueden crear sellos.");
  }

  const expanded: Array<{ item: WebCartItem; unitPrice: number }> = [];
  for (const item of items) {
    const qty = typeof item.qty === "number" && item.qty > 0 ? Math.floor(item.qty) : 1;
    const unitPrice = resolveWebCartItemPrice(item, params.metodoPago);
    if (unitPrice <= 0) {
      throw new Error(`Ítem sin precio válido: ${item.title ?? item.id ?? "sin nombre"}`);
    }
    for (let i = 0; i < qty; i += 1) {
      expanded.push({ item, unitPrice });
    }
  }

  const valores = expanded.map((e) => e.unitPrice);
  const totalSenia =
    typeof params.seniaMonto === "number" && Number.isFinite(params.seniaMonto) && params.seniaMonto >= 0
      ? params.seniaMonto
      : resolveWebOrderSenia(params.notasWeb, params.metodoPago, params.carritoJson);
  const senias = allocateSeniaAcrossItems(valores, totalSenia);
  const mockupId = params.mockupSolicitudId ?? (typeof params.mockup?.id === "string" ? params.mockup.id : null);
  const parsedFromMockup = Array.isArray(params.mockup?.medidas_cotizacion_json)
    ? (params.mockup!.medidas_cotizacion_json[0] as Record<string, unknown> | undefined)
    : null;

  return expanded.map(({ item, unitPrice }, index) => {
    const size =
      parseVariantSizeCm(item.variantSize) ??
      (parsedFromMockup
        ? parseVariantSizeCm(
          typeof parsedFromMockup.size === "string"
            ? parsedFromMockup.size
            : typeof parsedFromMockup.variantSize === "string"
              ? parsedFromMockup.variantSize
              : null,
        )
        : null);

    const designName = resolveWebSelloDesignName({
      disenoNombre: params.disenoNombre,
      item,
      mockup: params.mockup ?? null,
    });

    return {
      orden_id: params.ordenId,
      item_type: "SELLO",
      tipo: "Clasico",
      diseno: designName,
      valor: unitPrice,
      senia: senias[index] ?? 0,
      estado_fabricacion: "Sin Hacer",
      estado_venta: "Señado",
      archivo_base: mockupBaseUrl(params.mockup ?? null),
      ancho_real: size?.ancho ?? null,
      largo_real: size?.largo ?? null,
      mockup_solicitud_id: mockupId,
      item_config: {
        origen: "web",
        design_slug: item.designSlug ?? null,
        collection: item.collection ?? null,
        variant_size: item.variantSize ?? null,
        material_web: item.material ?? null,
        cart_item_id: item.id ?? null,
      },
      nota: null,
    };
  });
};

const sellosNeedNormalization = (
  existing: Array<{ valor?: unknown; senia?: unknown }>,
  expected: SelloInsert[],
): boolean => {
  if (existing.length === 0) return true;
  if (existing.length !== expected.length) return true;

  const actualValor = existing.reduce((sum, s) => sum + toNumber(s.valor), 0);
  const actualSenia = existing.reduce((sum, s) => sum + toNumber(s.senia), 0);
  const expectedValor = expected.reduce((sum, s) => sum + s.valor, 0);
  const expectedSenia = expected.reduce((sum, s) => sum + s.senia, 0);

  if (expectedSenia > 0 && actualSenia <= 0) return true;
  if (Math.abs(actualValor - expectedValor) > 1) return true;
  return false;
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
      return new Response(JSON.stringify({ error: "Supabase no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existingLog } = await supabase
      .from("web_pedido_confirm_log")
      .select("orden_id, success, webhook_sent_at")
      .eq("orden_id", ordenId)
      .maybeSingle();

    if (existingLog?.success) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "already_processed",
          orden_id: ordenId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: orden, error: ordenError } = await supabase
      .from("ordenes")
      .select(`
        id,
        origen,
        estado_pago_web,
        estado_orden,
        metodo_pago,
        notas_web,
        carrito_json,
        mockup_solicitud_id,
        pago_confirmado_at,
        clientes (
          nombre,
          apellido,
          telefono
        )
      `)
      .eq("id", ordenId)
      .single();

    if (ordenError || !orden) {
      return new Response(JSON.stringify({ error: "Orden no encontrada", details: ordenError }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (orden.origen !== "Web") {
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: "not_web_order" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (orden.estado_pago_web !== "pagado") {
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: "not_paid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const notasWeb = (orden.notas_web as Record<string, unknown> | null) ?? null;
    if (notasWeb?.skip_pedido_registrado === true) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "skip_flag" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let mockup: Record<string, unknown> | null = null;
    const mockupId = orden.mockup_solicitud_id ?? null;
    if (mockupId) {
      const { data } = await supabase
        .from("mockup_solicitudes")
        .select("*")
        .eq("id", mockupId)
        .maybeSingle();
      mockup = (data as Record<string, unknown> | null) ?? null;
    }

    const carritoJson = orden.carrito_json ?? mockup?.carrito_json ?? null;
    const disenoNombre = typeof notasWeb?.diseno_confirmado === "string"
      ? notasWeb.diseno_confirmado
      : null;
    const seniaMonto = typeof notasWeb?.senia_confirmada === "number"
      ? notasWeb.senia_confirmada
      : null;

    const sellosPayload = buildSellosFromWebCheckout({
      ordenId,
      carritoJson,
      notasWeb,
      metodoPago: orden.metodo_pago ?? null,
      mockup,
      mockupSolicitudId: mockupId,
      seniaMonto,
      disenoNombre,
    });

    const { data: existingSellos } = await supabase
      .from("sellos")
      .select("id, valor, senia")
      .eq("orden_id", ordenId);

    let sellosNormalized = false;
    if (sellosNeedNormalization(existingSellos ?? [], sellosPayload)) {
      if (existingSellos?.length) {
        const { error: deleteError } = await supabase.from("sellos").delete().eq("orden_id", ordenId);
        if (deleteError) throw deleteError;
      }

      const { error: insertError } = await supabase.from("sellos").insert(sellosPayload);
      if (insertError) throw insertError;
      sellosNormalized = true;
    }

    const now = new Date().toISOString();
    const ordenUpdate: Record<string, unknown> = {};
    if (orden.estado_orden !== "Señado") {
      ordenUpdate.estado_orden = "Señado";
    }
    if (!orden.pago_confirmado_at) {
      ordenUpdate.pago_confirmado_at = now;
    }
    if (Object.keys(ordenUpdate).length > 0) {
      const { error: updateOrdenError } = await supabase
        .from("ordenes")
        .update(ordenUpdate)
        .eq("id", ordenId);
      if (updateOrdenError) throw updateOrdenError;
    }

    const cliente = orden.clientes as {
      nombre?: string | null;
      apellido?: string | null;
      telefono?: string | null;
    } | null;

    const telefono = cliente?.telefono?.trim() ?? "";
    const nombre = `${cliente?.nombre ?? ""} ${cliente?.apellido ?? ""}`.trim() || "Cliente";

    let webhookOk = false;
    let webhookError: string | null = null;

    if (telefono) {
      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-bot`;
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          numero_telefono: telefono,
          tipo_actualizacion: "pedido_registrado",
          nombre,
          datos: { numero_pedido: ordenId },
        }),
      });

      webhookOk = webhookResponse.ok;
      if (!webhookOk) {
        webhookError = await webhookResponse.text();
      }
    } else {
      webhookError = "cliente_sin_telefono";
    }

    await supabase.from("web_pedido_confirm_log").upsert({
      orden_id: ordenId,
      success: webhookOk,
      sellos_normalized: sellosNormalized,
      webhook_sent_at: webhookOk ? now : null,
      webhook_error: webhookError,
      processed_at: now,
    });

    return new Response(
      JSON.stringify({
        success: webhookOk,
        orden_id: ordenId,
        sellos_normalized: sellosNormalized,
        webhook_sent: webhookOk,
        webhook_error: webhookError,
      }),
      {
        status: webhookOk ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("confirm-web-order error", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
