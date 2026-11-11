-- =====================================================
-- Accesorio listo → también marca venta 'Foto'
-- =====================================================
-- Correr a mano en el SQL Editor de Supabase (producción).
--
-- Problema: al marcar un accesorio (SOLDADOR / MANGO_GOLPE /
-- BASE_REMACHADORA) como Hecho, el trigger manda WhatsApp
-- `accesorio_listo` (el bot adjunta la foto) pero dejaba
-- estado_venta en Señado → el ítem seguía en la cola
-- "Enviar foto" del Inicio.
--
-- Fix: en el mismo UPDATE del flag anti-reenvío, si la venta
-- está Señado/null, pasar a 'Foto'. No pisa Transferido/Deudor.
-- Sincroniza ordenes.estado_orden si todos los ítems coinciden
-- (mismo criterio que registrar_rehacer / BR-PED-003).
--
-- Incluye backfill de accesorios que ya tenían el mensaje
-- enviado y seguían en Señado.
--
-- Requiere: public.trigger_accesorio_listo ya desplegado
-- (migration_whatsapp_accesorio_y_recordatorio_pago.sql).

CREATE OR REPLACE FUNCTION public.trigger_accesorio_listo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente RECORD;
  v_nombre text;
  v_unico_estado text;
  v_distintos int;
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

  -- Marca anti-reenvío + pasa venta a Foto (si seguía Señado/null).
  -- Solo toca item_config / estado_venta → no re-dispara este trigger
  -- (está definido OF estado_fabricacion). No setea foto_sello para
  -- no disparar pedido_listo (doble WhatsApp).
  UPDATE public.sellos
  SET
    item_config = COALESCE(item_config, '{}'::jsonb) || jsonb_build_object(
      'accesorio_listo_enviado_at', to_jsonb(now())
    ),
    estado_venta = CASE
      WHEN estado_venta IS NULL OR estado_venta = 'Señado' THEN 'Foto'
      ELSE estado_venta
    END
  WHERE id = NEW.id
    AND COALESCE(item_config->>'accesorio_listo_enviado_at', '') = '';

  -- Si todos los ítems de la orden quedan con el mismo estado_venta,
  -- reflejarlo en ordenes.estado_orden (BR-PED-003).
  SELECT MIN(estado_venta), COUNT(DISTINCT estado_venta)
  INTO v_unico_estado, v_distintos
  FROM public.sellos
  WHERE orden_id = NEW.orden_id;

  IF v_distintos = 1 AND v_unico_estado IS NOT NULL THEN
    UPDATE public.ordenes
    SET estado_orden = v_unico_estado
    WHERE id = NEW.orden_id
      AND estado_orden IS DISTINCT FROM v_unico_estado;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_accesorio_listo() IS
  'WhatsApp accesorio_listo al pasar un accesorio (SOLDADOR/MANGO_GOLPE/BASE_REMACHADORA) a Hecho; una vez por ítem. También pasa estado_venta a Foto si estaba Señado/null.';

-- ---------- Backfill: ya enviados, aún en Señado ----------

UPDATE public.sellos
SET estado_venta = 'Foto'
WHERE item_type IN ('SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA')
  AND COALESCE(item_config->>'accesorio_listo_enviado_at', '') <> ''
  AND (estado_venta IS NULL OR estado_venta = 'Señado');

UPDATE public.ordenes o
SET estado_orden = sub.unico_estado
FROM (
  SELECT
    s.orden_id,
    MIN(s.estado_venta) AS unico_estado,
    COUNT(DISTINCT s.estado_venta) AS distintos
  FROM public.sellos s
  WHERE s.orden_id IN (
    SELECT DISTINCT orden_id
    FROM public.sellos
    WHERE item_type IN ('SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA')
      AND COALESCE(item_config->>'accesorio_listo_enviado_at', '') <> ''
  )
  GROUP BY s.orden_id
) sub
WHERE o.id = sub.orden_id
  AND sub.distintos = 1
  AND sub.unico_estado IS NOT NULL
  AND o.estado_orden IS DISTINCT FROM sub.unico_estado;
