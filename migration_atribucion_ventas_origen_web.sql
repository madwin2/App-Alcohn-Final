-- Atribución de ventas originadas en la web (auditoría web 2026-10-31, hallazgo M4).
-- ⚠️ NO aplicar sin permiso explícito del dueño.
--
-- Problema: quien hace una muestra en el generador de la web y después compra por
-- WhatsApp queda como un pedido de WhatsApp más. Jun–oct 2026: ~25 % de los pedidos
-- por WhatsApp venían de alguien con muestra web en los 60 días previos, y la web
-- parecía vender la mitad de lo que vende.
--
-- Qué hace: solo VISTAS de lectura. No agrega columnas, no modifica pedidos ni
-- mockups y no dispara triggers, WhatsApp ni eventos a Meta.
--
-- Regla de atribución (por pedido de venta):
--   - Pedido del checkout web pagado → canal 'web_checkout'.
--   - Pedido de WhatsApp/app → 'whatsapp_desde_muestra_web' si el cliente hizo una
--     muestra web (completado o pendiente_aprobacion) en los 60 días anteriores al
--     pedido, por cliente_id o por los últimos 10 dígitos del teléfono.
--   - Si el pedido ya tiene mockup_solicitud_id, se usa ese.
--   - Resto → 'whatsapp'.
-- Pruebas, regalos y garantías no cuentan (tipo_pedido distinto de Venta).

CREATE OR REPLACE VIEW public.v_comercial_ventas_origen_web
WITH (security_invoker = true) AS
WITH ventas AS (
  SELECT
    o.id AS orden_id,
    o.created_at,
    o.cliente_id,
    o.valor_total,
    o.origen,
    o.mockup_solicitud_id,
    right(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), 10) AS tel10
  FROM public.ordenes o
  LEFT JOIN public.clientes c ON c.id = o.cliente_id
  WHERE coalesce(o.tipo_pedido, 'Venta') = 'Venta'
    AND (o.origen IS DISTINCT FROM 'Web' OR o.estado_pago_web = 'pagado')
)
SELECT
  v.orden_id,
  v.created_at,
  v.cliente_id,
  v.valor_total,
  CASE
    WHEN v.origen = 'Web' THEN 'web_checkout'
    WHEN m.mockup_id IS NOT NULL THEN 'whatsapp_desde_muestra_web'
    ELSE 'whatsapp'
  END AS canal,
  m.mockup_id AS mockup_web_id,
  m.mockup_created_at,
  CASE
    WHEN m.mockup_created_at IS NOT NULL
      THEN round(extract(epoch FROM v.created_at - m.mockup_created_at) / 86400.0, 1)
  END AS dias_desde_muestra
FROM ventas v
LEFT JOIN LATERAL (
  SELECT ms.id AS mockup_id, ms.created_at AS mockup_created_at
  FROM public.mockup_solicitudes ms
  WHERE ms.origen = 'web'
    AND (
      ms.id = v.mockup_solicitud_id
      OR (
        v.mockup_solicitud_id IS NULL
        AND ms.estado IN ('completado', 'pendiente_aprobacion')
        AND ms.created_at BETWEEN v.created_at - interval '60 days' AND v.created_at
        AND (
          ms.cliente_id = v.cliente_id
          OR (
            length(v.tel10) = 10
            AND right(regexp_replace(coalesce(ms.whatsapp, ''), '\D', '', 'g'), 10) = v.tel10
          )
        )
      )
    )
  ORDER BY (ms.id = v.mockup_solicitud_id) DESC, ms.created_at DESC
  LIMIT 1
) m ON true;

COMMENT ON VIEW public.v_comercial_ventas_origen_web IS
  'Canal de cada venta: web_checkout, whatsapp_desde_muestra_web (muestra web en los 60 días previos) o whatsapp. Solo lectura.';

-- Resumen mensual para Comercial Web / Inicio.
CREATE OR REPLACE VIEW public.v_comercial_ventas_origen_web_mensual
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS mes,
  count(*) FILTER (WHERE canal = 'web_checkout') AS ventas_web_checkout,
  count(*) FILTER (WHERE canal = 'whatsapp_desde_muestra_web') AS ventas_whatsapp_desde_muestra_web,
  count(*) FILTER (WHERE canal = 'whatsapp') AS ventas_whatsapp_resto,
  count(*) FILTER (WHERE canal <> 'whatsapp') AS ventas_originadas_web,
  round(sum(valor_total) FILTER (WHERE canal <> 'whatsapp')) AS facturacion_originada_web,
  round(sum(valor_total)) AS facturacion_total
FROM public.v_comercial_ventas_origen_web
GROUP BY 1;

COMMENT ON VIEW public.v_comercial_ventas_origen_web_mensual IS
  'Ventas y facturación originadas en la web por mes (checkout + WhatsApp con muestra web previa).';

-- Solo para usuarios de la app. security_invoker hace que se apliquen las RLS de
-- ordenes, clientes y mockup_solicitudes de quien consulta.
REVOKE ALL ON public.v_comercial_ventas_origen_web FROM anon, public;
REVOKE ALL ON public.v_comercial_ventas_origen_web_mensual FROM anon, public;
GRANT SELECT ON public.v_comercial_ventas_origen_web TO authenticated;
GRANT SELECT ON public.v_comercial_ventas_origen_web_mensual TO authenticated;

-- Consulta de control (resultado 2026-11-02, antes de aplicar):
--   SELECT * FROM public.v_comercial_ventas_origen_web_mensual ORDER BY mes DESC;
--   oct-2026: 20 checkout + 28 WhatsApp desde muestra web ≈ $4,9 M originados en la web.
