-- =====================================================
-- WhatsApp: accesorio_listo + recordatorio_pago_pendiente
-- =====================================================
-- Correr a mano en el SQL Editor de Supabase (producción).
--
-- 1) Trigger: ítem accesorio → estado_fabricacion = 'Hecho'
--    → webhook 'accesorio_listo' (una sola vez por ítem).
--    Tipos: SOLDADOR (también llamado "calentador"), MANGO_GOLPE, BASE_REMACHADORA.
--    La foto la pone el bot; no se manda imagen desde acá.
--
-- 2) Cron jueves 11:00 AR (14:00 UTC): todas las órdenes en Deudor
--    → webhook 'recordatorio_pago_pendiente'.
--
-- Requiere: public.enviar_webhook_pedido(...), pg_cron, pg_net.

-- ---------- 1) accesorio_listo ----------

CREATE OR REPLACE FUNCTION public.trigger_accesorio_listo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente RECORD;
  v_nombre text;
BEGIN
  -- Solo transición hacia Hecho (no reenvía si ya estaba Hecho).
  IF NEW.estado_fabricacion IS DISTINCT FROM 'Hecho' THEN
    RETURN NEW;
  END IF;
  IF OLD.estado_fabricacion IS NOT DISTINCT FROM 'Hecho' THEN
    RETURN NEW;
  END IF;

  IF NEW.item_type NOT IN ('SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA') THEN
    RETURN NEW;
  END IF;

  -- Una sola vez por ítem (aunque vuelva a Hecho tras Rehacer).
  IF COALESCE(NEW.item_config->>'accesorio_listo_enviado_at', '') <> '' THEN
    RETURN NEW;
  END IF;

  SELECT
    c.nombre,
    c.apellido,
    c.telefono
  INTO v_cliente
  FROM public.ordenes o
  JOIN public.clientes c ON c.id = o.cliente_id
  WHERE o.id = NEW.orden_id;

  IF v_cliente.telefono IS NULL OR NULLIF(trim(v_cliente.telefono), '') IS NULL THEN
    RETURN NEW;
  END IF;

  v_nombre := trim(
    COALESCE(NULLIF(trim(v_cliente.nombre), ''), '') ||
    CASE
      WHEN NULLIF(trim(v_cliente.apellido), '') IS NOT NULL
        THEN ' ' || trim(v_cliente.apellido)
      ELSE ''
    END
  );
  IF v_nombre = '' THEN
    v_nombre := 'Cliente';
  END IF;

  PERFORM public.enviar_webhook_pedido(
    'accesorio_listo',
    trim(v_cliente.telefono),
    v_nombre,
    jsonb_build_object(
      'item_type', NEW.item_type,
      'orden_id', NEW.orden_id::text,
      'sello_id', NEW.id::text,
      'numero_pedido', NEW.orden_id::text
    ),
    NEW.orden_id,
    NEW.id
  );

  -- Marca anti-reenvío. Solo toca item_config → no re-dispara este trigger
  -- (está definido OF estado_fabricacion).
  UPDATE public.sellos
  SET item_config = COALESCE(item_config, '{}'::jsonb) || jsonb_build_object(
    'accesorio_listo_enviado_at', to_jsonb(now())
  )
  WHERE id = NEW.id
    AND COALESCE(item_config->>'accesorio_listo_enviado_at', '') = '';

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_accesorio_listo() IS
  'WhatsApp accesorio_listo al pasar un accesorio (SOLDADOR/MANGO_GOLPE/BASE_REMACHADORA) a Hecho; una vez por ítem.';

DROP TRIGGER IF EXISTS trigger_accesorio_listo ON public.sellos;
CREATE TRIGGER trigger_accesorio_listo
  AFTER UPDATE OF estado_fabricacion ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_accesorio_listo();

-- ---------- 2) recordatorio_pago_pendiente (jueves 11:00 AR) ----------

CREATE OR REPLACE FUNCTION public.procesar_recordatorios_pago_pendiente()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_nombre text;
  v_enviados int := 0;
  v_omitidos int := 0;
BEGIN
  FOR r IN
    SELECT
      o.id AS orden_id,
      c.nombre,
      c.apellido,
      c.telefono
    FROM public.ordenes o
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE o.estado_orden = 'Deudor'
      AND NULLIF(trim(c.telefono), '') IS NOT NULL
    ORDER BY o.updated_at ASC NULLS LAST, o.created_at ASC
  LOOP
    v_nombre := trim(
      COALESCE(NULLIF(trim(r.nombre), ''), '') ||
      CASE
        WHEN NULLIF(trim(r.apellido), '') IS NOT NULL
          THEN ' ' || trim(r.apellido)
        ELSE ''
      END
    );
    IF v_nombre = '' THEN
      v_nombre := 'Cliente';
    END IF;

    BEGIN
      PERFORM public.enviar_webhook_pedido(
        'recordatorio_pago_pendiente',
        trim(r.telefono),
        v_nombre,
        jsonb_build_object(
          'orden_id', r.orden_id::text,
          'numero_pedido', r.orden_id::text
        ),
        r.orden_id,
        NULL
      );
      v_enviados := v_enviados + 1;
    EXCEPTION WHEN OTHERS THEN
      v_omitidos := v_omitidos + 1;
      RAISE NOTICE 'recordatorio_pago_pendiente falló para orden %: %', r.orden_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'enviados', v_enviados,
    'omitidos', v_omitidos,
    'tipo', 'recordatorio_pago_pendiente',
    'at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.procesar_recordatorios_pago_pendiente() IS
  'Envía WhatsApp recordatorio_pago_pendiente a todas las órdenes en estado Deudor (cron jueves 11:00 AR).';

GRANT EXECUTE ON FUNCTION public.procesar_recordatorios_pago_pendiente() TO authenticated;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recordatorio-pago-pendiente') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'recordatorio-pago-pendiente';
  END IF;

  -- Jueves 11:00 Argentina (UTC−3, sin DST) = 14:00 UTC
  PERFORM cron.schedule(
    'recordatorio-pago-pendiente',
    '0 14 * * 4',
    $cron$SELECT public.procesar_recordatorios_pago_pendiente();$cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE
      'pg_cron no disponible (%). Programá manualmente jueves 14:00 UTC: SELECT public.procesar_recordatorios_pago_pendiente();',
      SQLERRM;
END;
$$;
