-- Script para crear la función de migración y ejecutarla automáticamente
-- Ejecuta este script en Supabase SQL Editor UNA VEZ

-- Crear función para agregar la columna es_prioritario
CREATE OR REPLACE FUNCTION add_es_prioritario_column()
RETURNS void 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar si la columna ya existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sellos' 
    AND column_name = 'es_prioritario'
  ) THEN
    -- Agregar la columna
    ALTER TABLE sellos ADD COLUMN es_prioritario BOOLEAN NOT NULL DEFAULT FALSE;
    
    -- Agregar comentario
    COMMENT ON COLUMN sellos.es_prioritario IS 'Indica si el sello es prioritario (independiente del estado de fabricación)';
    
    -- Crear índice
    CREATE INDEX IF NOT EXISTS idx_sellos_es_prioritario ON sellos(es_prioritario);
    
    -- Migrar datos existentes
    UPDATE sellos 
    SET es_prioritario = TRUE,
        estado_fabricacion = 'Sin Hacer'
    WHERE estado_fabricacion = 'Prioridad';
    
    RAISE NOTICE 'Columna es_prioritario creada exitosamente';
  ELSE
    RAISE NOTICE 'La columna es_prioritario ya existe';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar la función inmediatamente
SELECT add_es_prioritario_column();

-- Dar permisos para que el cliente anónimo pueda llamar esta función
GRANT EXECUTE ON FUNCTION add_es_prioritario_column() TO anon;
GRANT EXECUTE ON FUNCTION add_es_prioritario_column() TO authenticated;


-- =====================================================
-- Migración: restante incluye costo de envío
-- =====================================================
-- Crea funciones y triggers para que ordenes.restante se calcule como:
-- (SUM(valor - senia) de sellos) + costo_envio (según empresa_envio y tipo_envio)

CREATE OR REPLACE FUNCTION apply_restante_envio_migration()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Función auxiliar para obtener costo de envío
  CREATE OR REPLACE FUNCTION get_shipping_cost(
      p_empresa_envio VARCHAR(50),
      p_tipo_envio VARCHAR(20)
  )
  RETURNS DECIMAL(10,2) AS $$
  DECLARE
      v_costo DECIMAL(10,2);
  BEGIN
      IF p_empresa_envio IS NULL OR p_empresa_envio = 'Retiro'
         OR p_tipo_envio IS NULL OR p_tipo_envio = 'Retiro' THEN
          RETURN 0;
      END IF;

      SELECT costo INTO v_costo
      FROM costos_de_envio
      WHERE empresa = p_empresa_envio
        AND servicio = p_tipo_envio
        AND activo = true
      ORDER BY activo_desde DESC
      LIMIT 1;

      RETURN COALESCE(v_costo, 0);
  END;
  $$ LANGUAGE plpgsql;

  -- Actualizar función de totales (trigger de sellos) para incluir envío
  CREATE OR REPLACE FUNCTION update_orden_totals()
  RETURNS TRIGGER AS $$
  DECLARE
      total_sellos INTEGER;
      total_senia DECIMAL(10,2);
      total_valor DECIMAL(10,2);
      total_restante DECIMAL(10,2);
      costo_envio DECIMAL(10,2);
      orden_id_val UUID;
  BEGIN
      orden_id_val := COALESCE(NEW.orden_id, OLD.orden_id);

      SELECT 
          COUNT(*),
          COALESCE(SUM(senia), 0),
          COALESCE(SUM(valor), 0),
          COALESCE(SUM(valor - senia), 0)
      INTO total_sellos, total_senia, total_valor, total_restante
      FROM sellos 
      WHERE orden_id = orden_id_val;

      SELECT get_shipping_cost(empresa_envio, tipo_envio)
      INTO costo_envio
      FROM ordenes
      WHERE id = orden_id_val;

      total_restante := total_restante + COALESCE(costo_envio, 0);

      UPDATE ordenes 
      SET 
          cantidad_sellos = total_sellos,
          senia_total = total_senia,
          valor_total = total_valor,
          restante = total_restante,
          updated_at = NOW()
      WHERE id = orden_id_val;

      RETURN COALESCE(NEW, OLD);
  END;
  $$ LANGUAGE plpgsql;

  -- Recalcular restante cuando cambia el envío (y también al insertar la orden)
  CREATE OR REPLACE FUNCTION update_orden_restante_on_shipping_change()
  RETURNS TRIGGER AS $$
  DECLARE
      total_restante DECIMAL(10,2);
      costo_envio DECIMAL(10,2);
  BEGIN
      -- total desde sellos (puede ser 0 en INSERT)
      SELECT COALESCE(SUM(valor - senia), 0)
      INTO total_restante
      FROM sellos
      WHERE orden_id = NEW.id;

      costo_envio := get_shipping_cost(NEW.empresa_envio, NEW.tipo_envio);
      NEW.restante := total_restante + COALESCE(costo_envio, 0);

      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trigger_update_orden_restante_on_shipping_change ON ordenes;
  CREATE TRIGGER trigger_update_orden_restante_on_shipping_change
      BEFORE INSERT OR UPDATE OF empresa_envio, tipo_envio ON ordenes
      FOR EACH ROW
      EXECUTE FUNCTION update_orden_restante_on_shipping_change();

  COMMENT ON COLUMN ordenes.restante IS 'Calculado automáticamente: valor_total - senia_total + costo_envio';
END;
$$ LANGUAGE plpgsql;

-- Ejecutar inmediatamente
SELECT apply_restante_envio_migration();

-- Permitir RPC desde el cliente
GRANT EXECUTE ON FUNCTION apply_restante_envio_migration() TO anon;
GRANT EXECUTE ON FUNCTION apply_restante_envio_migration() TO authenticated;
GRANT EXECUTE ON FUNCTION get_shipping_cost(VARCHAR, VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION get_shipping_cost(VARCHAR, VARCHAR) TO authenticated;


-- =====================================================
-- Migración: payload consistente para webhook pedido_listo (foto subida)
-- =====================================================
-- Agrega al webhook: total_sellos, sellos_con_foto, es_ultimo_sello,
-- y datos de restante/costo de envío para que el bot decida correctamente.

CREATE OR REPLACE FUNCTION apply_webhook_pedido_listo_payload_migration()
RETURNS void
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Requiere que exista enviar_webhook_pedido(tipo, telefono, nombre, datos jsonb)
  -- y (opcional) get_shipping_cost(empresa, tipo) para costo_envio.

  CREATE OR REPLACE FUNCTION trigger_foto_sello_subida()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_orden_id UUID;
    v_cliente RECORD;
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
    v_tipo_mensaje_restante TEXT;
  BEGIN
    -- Solo procesar si se agregó una nueva foto (antes era NULL o vacío)
    IF NEW.foto_sello IS NOT NULL
       AND NEW.foto_sello != ''
       AND (OLD.foto_sello IS NULL OR OLD.foto_sello = '' OR OLD.foto_sello != NEW.foto_sello) THEN

      -- Obtener datos del cliente y orden (incluye restante total de la orden)
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

      -- Construir URL completa de la imagen
      IF NEW.foto_sello LIKE 'http%' THEN
        v_url_foto := NEW.foto_sello;
      ELSE
        IF NEW.foto_sello LIKE '%/storage/%' THEN
          v_url_foto := NEW.foto_sello;
        ELSE
          v_url_foto := 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/' || NEW.foto_sello;
        END IF;
      END IF;

      -- URL de seguimiento si existe
      IF v_orden.seguimiento IS NOT NULL AND v_orden.seguimiento != '' THEN
        IF v_orden.empresa_envio = 'Correo Argentino' THEN
          v_url_seguimiento := 'https://www.correoargentino.com.ar/formularios/ondnc';
        ELSIF v_orden.empresa_envio = 'Andreani' THEN
          v_url_seguimiento := 'https://www.andreani.com/#!/envios/' || v_orden.seguimiento;
        ELSIF v_orden.empresa_envio = 'Via Cargo' THEN
          v_url_seguimiento := 'https://www.viacargo.com.ar/seguimiento';
        ELSE
          v_url_seguimiento := NULL;
        END IF;
      END IF;

      -- Métricas multi-sellos (fuente de verdad)
      SELECT COUNT(*)
      INTO v_total_sellos
      FROM sellos
      WHERE orden_id = v_orden_id;

      SELECT COUNT(*)
      INTO v_sellos_con_foto
      FROM sellos
      WHERE orden_id = v_orden_id
        AND foto_sello IS NOT NULL
        AND foto_sello != '';

      v_es_ultimo_sello := (v_total_sellos > 0 AND v_sellos_con_foto >= v_total_sellos);

      -- Envío seleccionado
      v_tiene_envio := (v_orden.empresa_envio IS NOT NULL AND v_orden.empresa_envio != 'Retiro'
                        AND v_orden.tipo_envio IS NOT NULL AND v_orden.tipo_envio != 'Retiro');

      -- Restante del sello (ya calculado por trigger de sellos, pero por las dudas)
      v_restante_sello := COALESCE(NEW.restante, (COALESCE(NEW.valor, 0) - COALESCE(NEW.senia, 0)));

      -- Costo de envío (si existe la función, úsala; si no, 0)
      BEGIN
        v_costo_envio := COALESCE(get_shipping_cost(v_orden.empresa_envio, v_orden.tipo_envio), 0);
      EXCEPTION WHEN undefined_function THEN
        v_costo_envio := 0;
      END;

      -- Determinar tipo de mensaje y monto a mostrar
      IF v_es_ultimo_sello THEN
        v_tipo_mensaje_restante := 'total_orden';
        v_restante_a_pagar := COALESCE(v_orden.restante_orden, v_restante_sello);
      ELSIF v_tiene_envio THEN
        v_tipo_mensaje_restante := 'restante_con_envio';
        v_restante_a_pagar := v_restante_sello + COALESCE(v_costo_envio, 0);
      ELSE
        v_tipo_mensaje_restante := 'restante_sin_envio';
        v_restante_a_pagar := v_restante_sello;
      END IF;

      -- Enviar webhook
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

  DROP TRIGGER IF EXISTS trigger_foto_sello_subida ON sellos;
  CREATE TRIGGER trigger_foto_sello_subida
  AFTER UPDATE OF foto_sello ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_foto_sello_subida();
END;
$$ LANGUAGE plpgsql;

-- Ejecutar inmediatamente
SELECT apply_webhook_pedido_listo_payload_migration();

-- Permitir RPC desde el cliente (opcional)
GRANT EXECUTE ON FUNCTION apply_webhook_pedido_listo_payload_migration() TO anon;
GRANT EXECUTE ON FUNCTION apply_webhook_pedido_listo_payload_migration() TO authenticated;




