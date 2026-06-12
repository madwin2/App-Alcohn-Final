-- Diagnóstico Meta Conversions API
-- Ejecutar en SQL Editor después de SELECT enviar_meta_conversion('...')

-- 1) ¿Llegó a ejecutarse pg_net? (respuesta HTTP de la Edge Function)
SELECT
  id,
  status_code,
  error_msg,
  left(content::text, 500) AS content_preview,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- 2) ¿La Edge Function registró algo en Meta?
SELECT *
FROM public.meta_conversion_log
ORDER BY sent_at DESC
LIMIT 10;

-- 3) Pedido de prueba sugerido (último pedido manual con teléfono)
-- SELECT id, valor_total, created_at, origen, estado_pago_web
-- FROM public.ordenes
-- WHERE origen IS DISTINCT FROM 'Web'
-- ORDER BY created_at DESC
-- LIMIT 5;
