-- Confirmación automática de pedidos web pagados:
--   1. Normaliza sellos (valor = solo sello, seña = lo cobrado al cliente).
--   2. Dispara WhatsApp de confirmación (pedido_registrado).
--
-- Arquitectura (igual que meta-conversion):
--   Trigger en ordenes → enviar_confirmacion_web_order() → Edge Function confirm-web-order
--
-- Pasos después de ejecutar este script:
--   1. Desplegar Edge Function: supabase functions deploy confirm-web-order
--   2. Probar: SELECT public.enviar_confirmacion_web_order('uuid-de-orden-web-pagada');
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.web_pedido_confirm_log (
  orden_id uuid PRIMARY KEY REFERENCES public.ordenes(id) ON DELETE CASCADE,
  success boolean NOT NULL DEFAULT false,
  sellos_normalized boolean NOT NULL DEFAULT false,
  webhook_sent_at timestamptz,
  webhook_error text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.web_pedido_confirm_log IS
  'Registro idempotente de confirmación de pedidos web (sellos + WhatsApp pedido_registrado).';

CREATE INDEX IF NOT EXISTS idx_web_pedido_confirm_log_processed_at
  ON public.web_pedido_confirm_log (processed_at DESC);

ALTER TABLE public.web_pedido_confirm_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_pedido_confirm_log FROM anon, authenticated;

-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enviar_confirmacion_web_order(uuid);

CREATE OR REPLACE FUNCTION public.enviar_confirmacion_web_order(p_orden_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/confirm-web-order';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnYnlyZWpmY3FlYXJldnZ6ZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNzQwNDAsImV4cCI6MjA3NTk1MDA0MH0.H-JC5wb3b4xSKSXGY8Sgh4_qyapWJgUZORgvK7ogCAM';
  v_request_id bigint;
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.web_pedido_confirm_log
    WHERE orden_id = p_orden_id
      AND success = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object('orden_id', p_orden_id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    )
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.enviar_confirmacion_web_order(uuid) IS
  'Encola confirmación de pedido web (normalizar sellos + WhatsApp) vía confirm-web-order.';

-- INSERT: pedido web creado ya pagado (p. ej. callback Openpay en un solo paso)
CREATE OR REPLACE FUNCTION public.trg_confirm_web_order_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origen = 'Web' AND NEW.estado_pago_web = 'pagado' THEN
    PERFORM public.enviar_confirmacion_web_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_confirm_web_order_on_insert ON public.ordenes;
CREATE TRIGGER trigger_confirm_web_order_on_insert
  AFTER INSERT ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_confirm_web_order_on_insert();

-- UPDATE: pedido web cuando se confirma el pago
CREATE OR REPLACE FUNCTION public.trg_confirm_web_order_on_pago_confirmado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origen = 'Web'
     AND NEW.estado_pago_web = 'pagado'
     AND COALESCE(OLD.estado_pago_web, '') IS DISTINCT FROM 'pagado' THEN
    PERFORM public.enviar_confirmacion_web_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_confirm_web_order_on_pago_confirmado ON public.ordenes;
CREATE TRIGGER trigger_confirm_web_order_on_pago_confirmado
  AFTER UPDATE OF estado_pago_web ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_confirm_web_order_on_pago_confirmado();

-- Si la web crea sellos después de marcar pagado, reintentar confirmación.
CREATE OR REPLACE FUNCTION public.trg_confirm_web_order_on_sellos_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen text;
  v_estado_pago text;
BEGIN
  SELECT origen, estado_pago_web
  INTO v_origen, v_estado_pago
  FROM public.ordenes
  WHERE id = NEW.orden_id;

  IF v_origen = 'Web' AND v_estado_pago = 'pagado' THEN
    PERFORM public.enviar_confirmacion_web_order(NEW.orden_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_confirm_web_order_on_sellos_insert ON public.sellos;
CREATE TRIGGER trigger_confirm_web_order_on_sellos_insert
  AFTER INSERT ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_confirm_web_order_on_sellos_insert();

-- -----------------------------------------------------------------------------
-- Backfill opcional: pedidos web ya pagados con sellos mal cargados o sin WhatsApp.
-- Ejecutar manualmente después de desplegar confirm-web-order:
--
-- SELECT public.enviar_confirmacion_web_order(o.id)
-- FROM public.ordenes o
-- WHERE o.origen = 'Web'
--   AND o.estado_pago_web = 'pagado'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.web_pedido_confirm_log l
--     WHERE l.orden_id = o.id AND l.success = true
--   );
