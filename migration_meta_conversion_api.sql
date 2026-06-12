-- Requiere extensión pg_net (Database → Extensions → pg_net → Enable)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================================================
-- Meta Conversions API: envío automático de eventos Purchase al crear/confirmar ventas
--
-- Arquitectura (igual que webhook-bot):
--   Trigger en ordenes → enviar_meta_conversion() → Edge Function meta-conversion → Meta Graph API
--
-- Pasos después de ejecutar este script:
--   1. Desplegar Edge Function: supabase functions deploy meta-conversion
--   2. En Supabase → Edge Functions → Secrets:
--        META_PIXEL_ID       = ID del píxel (Events Manager)
--        META_ACCESS_TOKEN   = token de la API (el mismo que API_META en .env)
--        META_TEST_EVENT_CODE = (opcional) para probar en Events Manager
--        META_CURRENCY       = ARS (default)
--   3. Probar: SELECT public.enviar_meta_conversion('uuid-de-una-orden-pagada');
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meta_conversion_log (
  orden_id uuid PRIMARY KEY REFERENCES public.ordenes(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL DEFAULT 'Purchase',
  event_time bigint NOT NULL,
  valor_total numeric(12, 2),
  currency text NOT NULL DEFAULT 'ARS',
  success boolean NOT NULL DEFAULT false,
  meta_response jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meta_conversion_log IS
  'Registro idempotente de eventos Purchase enviados a Meta Conversions API.';

CREATE INDEX IF NOT EXISTS idx_meta_conversion_log_sent_at
  ON public.meta_conversion_log (sent_at DESC);

ALTER TABLE public.meta_conversion_log ENABLE ROW LEVEL SECURITY;

-- Solo service role / triggers (sin políticas para usuarios autenticados)
REVOKE ALL ON public.meta_conversion_log FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Llama a la Edge Function meta-conversion vía pg_net
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enviar_meta_conversion(uuid);

CREATE OR REPLACE FUNCTION public.enviar_meta_conversion(p_orden_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/meta-conversion';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnYnlyZWpmY3FlYXJldnZ6ZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNzQwNDAsImV4cCI6MjA3NTk1MDA0MH0.H-JC5wb3b4xSKSXGY8Sgh4_qyapWJgUZORgvK7ogCAM';
  v_request_id bigint;
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotencia rápida en DB (la Edge Function también verifica)
  IF EXISTS (SELECT 1 FROM public.meta_conversion_log WHERE orden_id = p_orden_id) THEN
    RETURN NULL;
  END IF;

  -- pg_net: body debe ser jsonb (no text)
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

COMMENT ON FUNCTION public.enviar_meta_conversion(uuid) IS
  'Encola envío asíncrono de Purchase a Meta para una orden (pg_net → meta-conversion).';

-- -----------------------------------------------------------------------------
-- INSERT: pedidos manuales / app al crearse; web solo si ya vienen pagados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_meta_conversion_on_orden_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origen IS DISTINCT FROM 'Web' OR NEW.estado_pago_web = 'pagado' THEN
    PERFORM public.enviar_meta_conversion(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_meta_conversion_on_orden_insert ON public.ordenes;
CREATE TRIGGER trigger_meta_conversion_on_orden_insert
  AFTER INSERT ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_meta_conversion_on_orden_insert();

-- -----------------------------------------------------------------------------
-- UPDATE: pedidos web cuando se confirma el pago
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_meta_conversion_on_pago_confirmado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_pago_web = 'pagado'
     AND COALESCE(OLD.estado_pago_web, '') IS DISTINCT FROM 'pagado' THEN
    PERFORM public.enviar_meta_conversion(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_meta_conversion_on_pago_confirmado ON public.ordenes;
CREATE TRIGGER trigger_meta_conversion_on_pago_confirmado
  AFTER UPDATE OF estado_pago_web ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_meta_conversion_on_pago_confirmado();
