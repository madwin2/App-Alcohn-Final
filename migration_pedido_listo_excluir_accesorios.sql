-- =====================================================
-- pedido_listo: no contar accesorios en es_ultimo_sello
-- =====================================================
-- Correr a mano en el SQL Editor de Supabase (producci├│n).
--
-- Accesorios (SOLDADOR / MANGO_GOLPE / BASE_REMACHADORA) se avisan con
-- accesorio_listo y no llevan foto_sello. Al subir la foto del ├║ltimo sello
-- de la orden, es_ultimo_sello debe ser true aunque quede un accesorio sin foto.
--
-- Tambi├®n desplegar edge: supabase functions deploy webhook-bot

CREATE OR REPLACE FUNCTION public.trigger_foto_sello_subida()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_orden_id UUID;
  v_orden RECORD;
  v_url_foto TEXT;
  v_url_seguimiento TEXT;
  v_total_sellos INTEGER;
  v_sellos_con_foto INTEGER;
  v_es_ultimo_sello BOOLEAN;
  v_tiene_envio BOOLEAN;
  v_costo_envio DECIMAL(10,2);
  v_restante_sello DECIMAL(10,2);
  v_restante_a_pagar DECIMAL(10,2);
  v_restante_total_orden_calculado DECIMAL(10,2);
  v_tipo_mensaje_restante TEXT;
BEGIN
  IF NEW.foto_sello IS NOT NULL
     AND NEW.foto_sello != ''
     AND (OLD.foto_sello IS NULL OR OLD.foto_sello = '' OR OLD.foto_sello != NEW.foto_sello) THEN

    SELECT
      o.id as orden_id,
      o.seguimiento,
      o.empresa_envio,
      o.tipo_envio,
      o.restante as restante_orden,
      o.updated_at,
      c.nombre,
      c.apellido,
      c.telefono,
      s.diseno
    INTO v_orden
    FROM sellos s
    JOIN ordenes o ON o.id = s.orden_id
    JOIN clientes c ON c.id = o.cliente_id
    WHERE s.id = NEW.id;

    v_orden_id := v_orden.orden_id;

    IF NEW.foto_sello LIKE 'http%' THEN
      v_url_foto := NEW.foto_sello;
    ELSE
      IF NEW.foto_sello LIKE '%/storage/%' THEN
        v_url_foto := NEW.foto_sello;
      ELSE
        v_url_foto := 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/' || NEW.foto_sello;
      END IF;
    END IF;

    IF v_orden.seguimiento IS NOT NULL AND v_orden.seguimiento != '' THEN
      IF v_orden.empresa_envio = 'Correo Argentino' THEN
        v_url_seguimiento := 'https://www.correoargentino.com.ar/formularios/e-commerce';
      ELSIF v_orden.empresa_envio = 'Andreani' THEN
        v_url_seguimiento := 'https://www.andreani.com/?tab=seguir-envio';
      ELSIF v_orden.empresa_envio = 'Via Cargo' THEN
        v_url_seguimiento := 'https://www.viacargo.com.ar/seguimiento';
      ELSE
        v_url_seguimiento := NULL;
      END IF;
    END IF;

    SELECT COUNT(*)
    INTO v_total_sellos
    FROM sellos
    WHERE orden_id = v_orden_id
      AND COALESCE(NULLIF(UPPER(TRIM(item_type::text)), ''), 'SELLO') NOT IN (
        'SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA'
      );

    SELECT COUNT(*)
    INTO v_sellos_con_foto
    FROM sellos
    WHERE orden_id = v_orden_id
      AND foto_sello IS NOT NULL
      AND foto_sello != ''
      AND COALESCE(NULLIF(UPPER(TRIM(item_type::text)), ''), 'SELLO') NOT IN (
        'SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA'
      );

    v_es_ultimo_sello := (v_total_sellos > 0 AND v_sellos_con_foto >= v_total_sellos);

    v_tiene_envio := (v_orden.empresa_envio IS NOT NULL AND v_orden.empresa_envio != 'Retiro'
                      AND v_orden.tipo_envio IS NOT NULL AND v_orden.tipo_envio != 'Retiro');

    v_restante_sello := COALESCE(NEW.restante, (COALESCE(NEW.valor, 0) - COALESCE(NEW.senia, 0)));

    SELECT COALESCE(SUM(COALESCE(s.valor, 0) - COALESCE(s.senia, 0)), 0)
    INTO v_restante_total_orden_calculado
    FROM sellos s
    WHERE s.orden_id = v_orden_id;

    BEGIN
      v_costo_envio := COALESCE(get_shipping_cost(v_orden.empresa_envio, v_orden.tipo_envio), 0);
    EXCEPTION WHEN undefined_function THEN
      v_costo_envio := 0;
    END;

    IF v_es_ultimo_sello THEN
      v_tipo_mensaje_restante := 'total_orden';
      v_restante_a_pagar := v_restante_total_orden_calculado + COALESCE(v_costo_envio, 0);
    ELSIF v_tiene_envio THEN
      v_tipo_mensaje_restante := 'restante_con_envio';
      v_restante_a_pagar := v_restante_sello + COALESCE(v_costo_envio, 0);
    ELSE
      v_tipo_mensaje_restante := 'restante_sin_envio';
      v_restante_a_pagar := v_restante_sello;
    END IF;

    IF v_orden.telefono IS NOT NULL AND v_orden.nombre IS NOT NULL THEN
      PERFORM enviar_webhook_pedido(
        'pedido_listo',
        v_orden.telefono,
        v_orden.nombre || ' ' || COALESCE(v_orden.apellido, ''),
        jsonb_build_object(
          'numero_pedido', v_orden_id::text,
          'numero_seguimiento', COALESCE(v_orden.seguimiento, ''),
          'url_seguimiento', COALESCE(v_url_seguimiento, ''),
          'imagen_url', v_url_foto,
          'diseno_nombre', COALESCE(v_orden.diseno, 'Sello'),
          'restante_a_pagar', v_restante_a_pagar,
          'restante_sello', v_restante_sello,
          'costo_envio', COALESCE(v_costo_envio, 0),
          'tipo_mensaje_restante', v_tipo_mensaje_restante,
          'es_ultimo_sello', v_es_ultimo_sello,
          'total_sellos', COALESCE(v_total_sellos, 0),
          'sellos_con_foto', COALESCE(v_sellos_con_foto, 0),
          'tiene_envio_seleccionado', v_tiene_envio
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_foto_sello_subida() IS
  'WhatsApp pedido_listo al subir foto_sello. es_ultimo_sello solo cuenta SELLO/ABECEDARIO (no accesorios).';
