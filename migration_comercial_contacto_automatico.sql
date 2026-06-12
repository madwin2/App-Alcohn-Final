-- Contacto comercial automático: generador de muestras web → WhatsApp vía bot.
-- Espera 10 minutos tras mockup listo (sin compra) antes de enviar.
--
-- Requisitos previos en Supabase:
--   1. Función enviar_webhook_pedido(...) (ya usada por fotos / envíos).
--   2. Plantilla generador_muestras_contacto en el bot WhatsApp (servidor Hetzner).
--
-- Pasos:
--   1. Ejecutar este script en SQL Editor.
--   2. Verificar que pg_cron quedó programado (ver bloque final) o programar manualmente.
--   3. Probar: SELECT public.procesar_contactos_comerciales_pendientes();

-- Vista: incluir metadata_web para el panel Comercial.
-- Hay que DROP + CREATE: PostgreSQL no permite insertar columnas al medio con CREATE OR REPLACE VIEW.
DROP VIEW IF EXISTS public.v_web_mockups_sin_compra;

CREATE VIEW public.v_web_mockups_sin_compra AS
SELECT
  m.id AS mockup_id,
  m.created_at,
  m.estado,
  m.material,
  m.whatsapp,
  m.email,
  m.mockup_cuero_url,
  m.mockup_madera_url,
  m.medidas_cotizacion_json,
  c.id AS cliente_id,
  c.nombre,
  c.apellido,
  c.telefono,
  c.mail,
  m.metadata_web
FROM public.mockup_solicitudes m
LEFT JOIN public.clientes c ON c.id = m.cliente_id
WHERE m.origen = 'web'
  AND m.orden_id IS NULL
  AND m.estado IN ('completado', 'pendiente_aprobacion');

COMMENT ON VIEW public.v_web_mockups_sin_compra IS
  'Muestras web terminadas o en revisión sin orden — seguimiento WhatsApp.';

-- Al pasar a listo, programar envío en 10 minutos (solo web, primera vez).
CREATE OR REPLACE FUNCTION public.trg_schedule_contacto_comercial_mockup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origen = 'web'
     AND NEW.estado IN ('completado', 'pendiente_aprobacion')
     AND (
       TG_OP = 'INSERT'
       OR OLD.estado IS NULL
       OR OLD.estado NOT IN ('completado', 'pendiente_aprobacion')
     )
     AND (NEW.metadata_web->>'contacto_comercial_eligible_at') IS NULL
     AND (NEW.metadata_web->>'contacto_comercial_enviado_at') IS NULL
  THEN
    NEW.metadata_web := COALESCE(NEW.metadata_web, '{}'::jsonb)
      || jsonb_build_object(
        'contacto_comercial_eligible_at', to_jsonb(now() + interval '10 minutes')
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mockup_schedule_contacto_comercial ON public.mockup_solicitudes;

CREATE TRIGGER trg_mockup_schedule_contacto_comercial
  BEFORE INSERT OR UPDATE OF estado ON public.mockup_solicitudes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_schedule_contacto_comercial_mockup();

COMMENT ON FUNCTION public.trg_schedule_contacto_comercial_mockup() IS
  'Programa contacto comercial 10 min después de mockup web listo (sin compra).';

-- Procesa la cola: mockups elegibles sin orden → webhook-bot → bot WhatsApp.
CREATE OR REPLACE FUNCTION public.procesar_contactos_comerciales_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_nombre text;
  v_enviados int := 0;
BEGIN
  FOR r IN
    SELECT
      m.id,
      m.whatsapp,
      m.nombre_muestra,
      m.nombre_slug
    FROM public.mockup_solicitudes m
    WHERE m.origen = 'web'
      AND m.orden_id IS NULL
      AND m.estado IN ('completado', 'pendiente_aprobacion')
      AND NULLIF(trim(m.whatsapp), '') IS NOT NULL
      AND (m.metadata_web->>'contacto_comercial_enviado_at') IS NULL
      AND (m.metadata_web->>'contacto_comercial_eligible_at') IS NOT NULL
      AND (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.comercial_exclusiones e
        WHERE e.entity_type = 'mockup'
          AND e.entity_id = m.id
      )
    ORDER BY (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz ASC
    LIMIT 15
  LOOP
    v_nombre := COALESCE(
      NULLIF(trim(r.nombre_muestra), ''),
      NULLIF(trim(r.nombre_slug), ''),
      'Cliente'
    );

    PERFORM public.enviar_webhook_pedido(
      'generador_muestras_contacto',
      trim(r.whatsapp),
      v_nombre,
      jsonb_build_object('solicitud_mockup_id', r.id::text),
      NULL,
      NULL
    );

    UPDATE public.mockup_solicitudes
    SET metadata_web = COALESCE(metadata_web, '{}'::jsonb) || jsonb_build_object(
      'contacto_comercial_enviado_at', to_jsonb(now()),
      'contacto_comercial_tipo', 'generador_muestras_contacto'
    )
    WHERE id = r.id;

    v_enviados := v_enviados + 1;
  END LOOP;

  RETURN jsonb_build_object('enviados', v_enviados, 'at', now());
END;
$$;

COMMENT ON FUNCTION public.procesar_contactos_comerciales_pendientes() IS
  'Envía mensaje comercial (generador_muestras_contacto) a mockups web listos tras 10 min sin compra.';

-- Cron cada 2 minutos (requiere extensión pg_cron en Supabase).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comercial-contacto-pendientes') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'comercial-contacto-pendientes';
  END IF;

  PERFORM cron.schedule(
    'comercial-contacto-pendientes',
    '*/2 * * * *',
    $cron$SELECT public.procesar_contactos_comerciales_pendientes();$cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE
      'pg_cron no disponible (%). Programá manualmente cada 2 min: SELECT public.procesar_contactos_comerciales_pendientes();',
      SQLERRM;
END;
$$;
