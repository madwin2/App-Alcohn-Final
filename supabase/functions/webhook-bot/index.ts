import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_WEBHOOK_URL =
  Deno.env.get("BOT_WEBHOOK_URL") || "http://188.245.218.22:3000/webhook/pedido";
const WEBHOOK_TOKEN = (Deno.env.get("WEBHOOK_TOKEN") ?? "").trim();
const BOT_WEBHOOK_TIMEOUT = 10000; // 10 segundos

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const parseBoolean = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "si" || v === "sí";
  }
  return false;
};

const formatMeasure = (ancho: unknown, largo: unknown): string => {
  const a =
    ancho !== null && ancho !== undefined && ancho !== "" ? Number(ancho) : null;
  const l =
    largo !== null && largo !== undefined && largo !== "" ? Number(largo) : null;

  if (a && l) return `${a}x${l} cm`;
  if (a) return `${a} cm (ancho)`;
  if (l) return `${l} cm (largo)`;
  return "Medida no especificada";
};

const getItemTypeLabel = (itemType: unknown): string => {
  const t = String(itemType || "").toUpperCase();

  const labels: Record<string, string> = {
    SELLO: "Sello",
    ABECEDARIO: "ABC",
    SOLDADOR: "Soldador",
    MANGO_GOLPE: "Mango de golpe",
    BASE_REMACHADORA: "Base de remachadora",
  };

  return labels[t] || "Item";
};

const resolveItemDisplayName = (diseno: unknown, itemType: unknown): string => {
  const d = typeof diseno === "string" ? diseno.trim() : "";
  if (d.length > 0) return d;
  return getItemTypeLabel(itemType);
};

/** Foto presente (misma lógica que el trigger en SQL: NOT NULL y != ''). */
const tieneFotoSello = (row: { foto_sello?: unknown }): boolean => {
  const f = row?.foto_sello;
  if (f === null || f === undefined) return false;
  return String(f).trim() !== "";
};

Deno.serve(async (req: Request) => {
  console.log("webhook-bot invoked", { method: req.method, url: req.url });

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Solo permitir POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!WEBHOOK_TOKEN) {
    console.error("WEBHOOK_TOKEN no configurado (secret en Supabase).");
    return new Response(
      JSON.stringify({
        error: "WEBHOOK_TOKEN no configurado en Edge Function secrets",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // Obtener body
    const body = await req.json();
    console.log("incoming body", body);

    /** Mockups generados en la app: el bot debe enviar imágenes a `numero_telefono` (WhatsApp).
     * datos: { solicitud_mockup_id, mockup_cuero_url?, mockup_madera_url?, nombre_muestra? } */
    const tipoAct = String(body.tipo_actualizacion || "");
    if (tipoAct === "mockups_listos") {
      console.log("mockups_listos → reenvío al bot (mockups al cliente)", {
        solicitud_mockup_id: body?.datos?.solicitud_mockup_id,
        mockup_cuero_url: Boolean(body?.datos?.mockup_cuero_url),
        mockup_madera_url: Boolean(body?.datos?.mockup_madera_url),
      });
    }

    // Validar campos mínimos
    if (!body.numero_telefono || !body.tipo_actualizacion || !body.nombre) {
      console.warn("Datos incompletos en request", {
        has_numero_telefono: Boolean(body.numero_telefono),
        has_tipo_actualizacion: Boolean(body.tipo_actualizacion),
        has_nombre: Boolean(body.nombre),
      });

      return new Response(JSON.stringify({ error: "Datos incompletos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente Supabase
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || "https://dgbyrejfcqearevvzdmf.supabase.co";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";
    const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    if (!supabase) {
      console.error("No se pudo inicializar Supabase client (sin key).");
    }

    // Enriquecer payload si llega numero_pedido
    const numeroPedido = body?.datos?.numero_pedido as string | undefined;

    if (supabase && numeroPedido) {
      console.log("Enriqueciendo payload para numero_pedido", numeroPedido);

      // Traer orden + cliente (incluye teléfono)
      const { data: orden, error: ordenError } = await supabase
        .from("ordenes")
        .select(`
          id,
          valor_total,
          senia_total,
          restante,
          cliente_id,
          clientes (
            nombre,
            apellido,
            telefono
          )
        `)
        .eq("id", numeroPedido)
        .single();

      if (ordenError) {
        console.error("Error obteniendo orden", ordenError);
      }

      if (!ordenError && orden) {
        // Traer items incluyendo foto_sello para inferir "orden completa" sin depender solo del payload
        const { data: sellos, error: sellosError } = await supabase
          .from("sellos")
          .select(
            "id, diseno, tipo, item_type, item_config, valor, senia, ancho_real, largo_real, foto_sello",
          )
          .eq("orden_id", numeroPedido);

        if (sellosError) {
          console.error("Error obteniendo sellos", sellosError);
        }

        const rawSellos = sellosError || !sellos ? [] : sellos;

        const todosLosItemsTienenFoto =
          rawSellos.length > 0 && rawSellos.every((s: { foto_sello?: unknown }) =>
            tieneFotoSello(s),
          );

        const clienteNombreSolo =
          (orden as any)?.clientes?.nombre ||
          (body?.nombre ? String(body.nombre).split(" ")[0] : null);

        const clienteTelefono =
          (orden as any)?.clientes?.telefono || body.numero_telefono || null;

        const items = rawSellos.map((s: any) => {
          const anchoCm =
            s.ancho_real !== null &&
            s.ancho_real !== undefined &&
            s.ancho_real !== ""
              ? Number(s.ancho_real)
              : null;

          const largoCm =
            s.largo_real !== null &&
            s.largo_real !== undefined &&
            s.largo_real !== ""
              ? Number(s.largo_real)
              : null;

          const valorItem = toNumber(s.valor);
          const seniaItem = toNumber(s.senia);
          const nombreItem = resolveItemDisplayName(s.diseno, s.item_type);

          return {
            item_id: s.id,
            item_type: s.item_type || "SELLO",
            diseno: nombreItem,
            tipo: s.tipo || null,
            ancho_cm: anchoCm,
            largo_cm: largoCm,
            medida: formatMeasure(anchoCm, largoCm),
            valor_item: valorItem,
            senia_item: seniaItem,
            saldo_item: Math.max(0, valorItem - seniaItem),
          };
        });

        const valorTotalOrden = toNumber((orden as any).valor_total);
        const seniaTotalOrden = toNumber((orden as any).senia_total);
        const saldoSoloProductos = Math.max(0, valorTotalOrden - seniaTotalOrden);

        // `ordenes.restante` ya incluye envío (ver triggers update_orden_totals)
        const restanteOrdenRaw = (orden as any).restante;
        const saldoTotalOrdenPreferido =
          restanteOrdenRaw !== null &&
            restanteOrdenRaw !== undefined &&
            restanteOrdenRaw !== ""
            ? Math.max(0, toNumber(restanteOrdenRaw))
            : saldoSoloProductos;

        // Identificar item actual (si llega desde la automatización)
        const currentItemId =
          body?.datos?.item_id ||
          body?.datos?.sello_id ||
          body?.item_id ||
          body?.sello_id ||
          null;

        const itemActual = currentItemId
          ? items.find((it: any) => String(it.item_id) === String(currentItemId)) || null
          : null;

        body.datos = {
          ...(body.datos || {}),
          numero_pedido: numeroPedido,
          cliente_nombre: clienteNombreSolo,
          cliente_telefono: clienteTelefono,
          items,
          valor_total: valorTotalOrden,
          senia_total: seniaTotalOrden,
          saldo_total: saldoSoloProductos,
          item_actual: itemActual, // útil para plantillas del bot
        };

        const tipoActualizacion = String(body.tipo_actualizacion || "").toLowerCase();
        const esPedidoCompletado =
          tipoActualizacion.includes("completado") ||
          tipoActualizacion.includes("finalizado");

        const esPedidoListo = tipoActualizacion.includes("pedido_listo");

        const esUltimoSelloPayload = parseBoolean(body?.datos?.es_ultimo_sello);
        // Solo en pedido_listo: si el payload pierde `es_ultimo_sello`, inferimos desde DB
        // (todas las fotos presentes). Así no alteramos otros tipos de webhook.
        const esUltimoSello =
          esUltimoSelloPayload || (esPedidoListo && todosLosItemsTienenFoto);

        if (esPedidoListo && todosLosItemsTienenFoto && !esUltimoSelloPayload) {
          console.log("es_ultimo_sello inferido por DB (todas las fotos presentes)", {
            numero_pedido: numeroPedido,
            total_items: rawSellos.length,
          });
        }

        // Reglas de cobro:
        // - Si es último item (o pedido completado/finalizado): enviar RESTANTE GLOBAL
        // - Si no: NO forzar cobro global
        if (esUltimoSello || esPedidoCompletado) {
          body.datos.es_ultimo_sello = true;
          body.datos.tipo_mensaje_restante = "total_orden";
          body.datos.restante_a_pagar = saldoTotalOrdenPreferido;

          // Compatibilidad con bots que leen `restante_sello` o campos top-level "por item":
          body.datos.restante_sello = saldoTotalOrdenPreferido;
          body.datos.valor_item = valorTotalOrden;
          body.datos.senia_item = seniaTotalOrden;
          body.datos.saldo_item = saldoTotalOrdenPreferido;
        } else {
          // Evitar arrastre accidental de valores globales de una ejecución previa
          delete body.datos.restante_a_pagar;
          delete body.datos.valor_item;
          delete body.datos.senia_item;
          delete body.datos.saldo_item;
        }
      }
    } else if (!numeroPedido) {
      console.log("Request sin datos.numero_pedido, se envía payload original.");
    }

    // Enviar webhook al bot con timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BOT_WEBHOOK_TIMEOUT);

    let botSuccess = false;
    let botResponse: any = null;

    try {
      console.log("payload to bot", body);

      const response = await fetch(BOT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-token": WEBHOOK_TOKEN,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Evitar romper si el bot responde texto no-JSON
      const responseText = await response.text();
      try {
        botResponse = JSON.parse(responseText);
      } catch {
        botResponse = { raw: responseText };
      }

      botSuccess =
        response.ok &&
        (botResponse?.success === true || botResponse?.mensaje_id !== undefined);

      console.log("bot response", {
        status: response.status,
        ok: response.ok,
        botSuccess,
        botResponse,
      });

      // Si el bot respondió exitosamente y es envío de seguimiento, actualizar estado
      if (
        botSuccess &&
        body.datos?.numero_pedido &&
        body.tipo_actualizacion === "pedido_enviado"
      ) {
        try {
          if (supabase) {
            const { error: updateError } = await supabase
              .from("ordenes")
              .update({
                estado_envio: "Seguimiento Enviado",
                updated_at: new Date().toISOString(),
              })
              .eq("id", body.datos.numero_pedido)
              .eq("estado_envio", "Despachado"); // Solo si sigue en Despachado

            if (updateError) {
              console.error("Error al actualizar estado:", updateError);
            } else {
              console.log("Estado de envío actualizado a Seguimiento Enviado", {
                numero_pedido: body.datos.numero_pedido,
              });
            }
          }
        } catch (updateError) {
          console.error("Error al actualizar estado en Supabase:", updateError);
          // No romper el webhook por este fallo
        }
      }

      return new Response(
        JSON.stringify({
          success: botSuccess,
          status: response.status,
          bot_response: botResponse,
          payload_enviado: body, // Debug
        }),
        {
          status: botSuccess ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);

      const errorMessage =
        fetchError instanceof Error ? fetchError.message : "Unknown error";

      console.error("Error al enviar al bot", {
        errorMessage,
        errorName: fetchError instanceof Error ? fetchError.name : "unknown",
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          error_type:
            fetchError instanceof Error && fetchError.name === "AbortError"
              ? "timeout"
              : "connection_error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error general en Edge Function", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
