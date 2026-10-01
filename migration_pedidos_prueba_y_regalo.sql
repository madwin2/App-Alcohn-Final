-- Pedidos de PRUEBA y REGALO
-- Ver PLAN_PEDIDOS_PRUEBA_Y_REGALO.md
-- ⚠️ Aplicar solo con permiso explícito (base = producción, compartida con tienda web).

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS tipo_pedido text NOT NULL DEFAULT 'Venta',
  ADD COLUMN IF NOT EXISTS motivo_prueba text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_tipo_pedido_check'
  ) THEN
    ALTER TABLE public.ordenes
      ADD CONSTRAINT ordenes_tipo_pedido_check
      CHECK (tipo_pedido IN ('Venta', 'Prueba', 'Regalo'));
  END IF;
END $$;

ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS es_regalo boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sellos_regalo_sin_cargo'
  ) THEN
    ALTER TABLE public.sellos
      ADD CONSTRAINT sellos_regalo_sin_cargo
      CHECK (NOT es_regalo OR (COALESCE(valor, 0) = 0 AND COALESCE(senia, 0) = 0));
  END IF;
END $$;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_pedido_no_venta
  ON public.ordenes (tipo_pedido) WHERE tipo_pedido <> 'Venta';

CREATE INDEX IF NOT EXISTS idx_clientes_es_interno
  ON public.clientes (es_interno) WHERE es_interno = true;

COMMENT ON COLUMN public.ordenes.tipo_pedido IS
  'Venta (default) | Prueba | Regalo. No cambiar después del INSERT.';
COMMENT ON COLUMN public.ordenes.motivo_prueba IS
  'Obligatorio cuando tipo_pedido = Prueba.';
COMMENT ON COLUMN public.sellos.es_regalo IS
  'Ítem sin cargo. En órdenes Regalo todos van true; en Venta puede haber mezcla.';
COMMENT ON COLUMN public.clientes.es_interno IS
  'Cliente interno (p. ej. pruebas). Excluido de Comercial/WhatsApp/listados.';

-- ---------------------------------------------------------------------------
-- 2. Cliente interno para pruebas
-- telefono es NOT NULL en producción → usamos '' (sin WhatsApp posible).
-- ---------------------------------------------------------------------------

INSERT INTO public.clientes (nombre, apellido, telefono, medio_contacto, es_interno)
SELECT 'Alcohn', 'Pruebas internas', '', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes
  WHERE es_interno = true
    AND nombre = 'Alcohn'
    AND apellido = 'Pruebas internas'
);

-- ---------------------------------------------------------------------------
-- 3. Integridad: valores en Prueba/Regalo + es_regalo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_sellos_tipo_pedido_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo text;
BEGIN
  SELECT o.tipo_pedido INTO v_tipo
  FROM public.ordenes o
  WHERE o.id = NEW.orden_id;

  IF v_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_tipo = 'Prueba' THEN
    NEW.valor := 0;
    NEW.senia := 0;
    NEW.es_regalo := false;
  ELSIF v_tipo = 'Regalo' THEN
    NEW.valor := 0;
    NEW.senia := 0;
    NEW.es_regalo := true;
  END IF;

  IF NEW.es_regalo THEN
    NEW.valor := 0;
    NEW.senia := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sellos_tipo_pedido_integrity ON public.sellos;
CREATE TRIGGER trigger_sellos_tipo_pedido_integrity
  BEFORE INSERT OR UPDATE OF valor, senia, es_regalo, orden_id ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sellos_tipo_pedido_integrity();

-- D8: tipo_pedido y es_regalo no se pueden cambiar después del INSERT
CREATE OR REPLACE FUNCTION public.trg_ordenes_tipo_pedido_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tipo_pedido IS DISTINCT FROM NEW.tipo_pedido THEN
    RAISE EXCEPTION 'tipo_pedido no se puede modificar después de creado (D8)';
  END IF;
  IF OLD.motivo_prueba IS DISTINCT FROM NEW.motivo_prueba
     AND OLD.tipo_pedido = 'Prueba' THEN
    -- Permitir completar motivo si estaba vacío; bloquear cambio si ya había
    IF NULLIF(trim(COALESCE(OLD.motivo_prueba, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'motivo_prueba no se puede modificar después de creado (D8)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ordenes_tipo_pedido_immutable ON public.ordenes;
CREATE TRIGGER trigger_ordenes_tipo_pedido_immutable
  BEFORE UPDATE OF tipo_pedido, motivo_prueba ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ordenes_tipo_pedido_immutable();

CREATE OR REPLACE FUNCTION public.trg_sellos_es_regalo_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.es_regalo IS DISTINCT FROM NEW.es_regalo THEN
    RAISE EXCEPTION 'es_regalo no se puede modificar después de creado (D8)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sellos_es_regalo_immutable ON public.sellos;
CREATE TRIGGER trigger_sellos_es_regalo_immutable
  BEFORE UPDATE OF es_regalo ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sellos_es_regalo_immutable();

-- ---------------------------------------------------------------------------
-- 4. Restante: en Regalo no sumar costo de envío (D4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_orden_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    total_sellos INTEGER;
    total_senia DECIMAL(10,2);
    total_valor DECIMAL(10,2);
    total_restante DECIMAL(10,2);
    costo_envio DECIMAL(10,2);
    orden_id_val UUID;
    v_tipo text;
    v_empresa text;
    v_servicio text;
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

    SELECT tipo_pedido, empresa_envio, tipo_envio
    INTO v_tipo, v_empresa, v_servicio
    FROM ordenes
    WHERE id = orden_id_val;

    IF COALESCE(v_tipo, 'Venta') = 'Regalo' THEN
      costo_envio := 0;
    ELSE
      costo_envio := get_shipping_cost(v_empresa, v_servicio);
    END IF;

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
$$;

CREATE OR REPLACE FUNCTION public.update_orden_restante_on_shipping_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    total_restante DECIMAL(10,2);
    costo_envio DECIMAL(10,2);
BEGIN
    IF (OLD.empresa_envio IS DISTINCT FROM NEW.empresa_envio) OR
       (OLD.tipo_envio IS DISTINCT FROM NEW.tipo_envio) THEN

        SELECT COALESCE(SUM(valor - senia), 0)
        INTO total_restante
        FROM sellos
        WHERE orden_id = NEW.id;

        IF COALESCE(NEW.tipo_pedido, 'Venta') = 'Regalo' THEN
          costo_envio := 0;
        ELSE
          costo_envio := get_shipping_cost(NEW.empresa_envio, NEW.tipo_envio);
        END IF;

        NEW.restante := total_restante + COALESCE(costo_envio, 0);
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Meta: no Purchase si no es Venta
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_meta_conversion_on_orden_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.tipo_pedido, 'Venta') <> 'Venta' THEN
    RETURN NEW;
  END IF;
  IF NEW.origen IS DISTINCT FROM 'Web' OR NEW.estado_pago_web = 'pagado' THEN
    PERFORM public.enviar_meta_conversion(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Deudores: solo Venta; "todos en Foto" ignora ítems regalo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marcar_ordenes_deudores_por_foto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_cliente text;
  v_pedido text;
  v_titulo text;
BEGIN
  DROP TABLE IF EXISTS tt_ordenes_a_deudor_por_foto;

  CREATE TEMPORARY TABLE tt_ordenes_a_deudor_por_foto AS
  SELECT o.id
  FROM ordenes o
  WHERE COALESCE(o.tipo_pedido, 'Venta') = 'Venta'
    AND (o.estado_orden IS NULL OR o.estado_orden IN ('Señado', 'Hecho', 'Foto'))
    AND EXISTS (
      SELECT 1 FROM sellos s
      WHERE s.orden_id = o.id AND COALESCE(s.es_regalo, false) = false
    )
    AND NOT EXISTS (
      SELECT 1
      FROM sellos s
      WHERE s.orden_id = o.id
        AND COALESCE(s.es_regalo, false) = false
        AND s.estado_venta IS DISTINCT FROM 'Foto'
    )
    AND (
      SELECT MAX(
        COALESCE(
          (
            SELECT eh.changed_at
            FROM estado_historial eh
            WHERE eh.sello_id = s.id
              AND eh.campo = 'estado_venta'
              AND eh.estado_nuevo = 'Foto'
            ORDER BY eh.changed_at DESC
            LIMIT 1
          ),
          s.updated_at
        )
      )
      FROM sellos s
      WHERE s.orden_id = o.id
        AND COALESCE(s.es_regalo, false) = false
    ) <= NOW() - INTERVAL '10 days';

  UPDATE sellos s
  SET estado_venta = 'Deudor',
      updated_at   = NOW()
  WHERE s.orden_id IN (SELECT id FROM tt_ordenes_a_deudor_por_foto)
    AND s.estado_venta = 'Foto';

  UPDATE ordenes o
  SET estado_orden = 'Deudor',
      updated_at   = NOW()
  WHERE o.id IN (SELECT id FROM tt_ordenes_a_deudor_por_foto);

  FOR r IN
    SELECT
      o.id AS orden_id,
      TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '')) AS cliente
    FROM tt_ordenes_a_deudor_por_foto t
    JOIN public.ordenes o ON o.id = t.id
    JOIN public.clientes c ON c.id = o.cliente_id
  LOOP
    v_cliente := NULLIF(btrim(r.cliente), '');
    IF v_cliente IS NULL THEN
      v_cliente := 'Cliente';
    END IF;
    v_pedido := left(r.orden_id::text, 8);
    v_titulo := v_cliente || ' — pedido #' || v_pedido ||
      ' pasó a Deudor (10+ días con la foto enviada sin transferir)';
    PERFORM public.emitir_notificacion(
      'v4_deudor',
      'ventas',
      NULL, NULL,
      v_titulo, NULL,
      'orden', r.orden_id::text, '/pedidos',
      'urgent',
      'v4:deudor:' || r.orden_id::text,
      jsonb_build_object('clienteNombre', v_cliente, 'ordenId', r.orden_id),
      NULL
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Recordatorios de pago: solo Venta
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.procesar_recordatorios_pago_pendiente()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      AND COALESCE(o.tipo_pedido, 'Venta') = 'Venta'
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

-- ---------------------------------------------------------------------------
-- 8. Comercial / recompra: solo órdenes Venta; excluir clientes internos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_comercial_clientes_seguimiento_elegibles AS
WITH ordenes_por_cliente AS (
  SELECT
    o_1.cliente_id,
    count(*) AS total_ordenes,
    (array_agg(o_1.id ORDER BY o_1.created_at DESC))[1] AS orden_id,
    max(o_1.created_at) AS orden_fecha
  FROM ordenes o_1
  WHERE COALESCE(o_1.tipo_pedido, 'Venta') = 'Venta'
  GROUP BY o_1.cliente_id
)
SELECT
  c.id AS cliente_id,
  opc.orden_id,
  opc.orden_fecha,
  c.nombre,
  c.apellido,
  c.telefono,
  c.mail,
  c.medio_contacto,
  o.estado_orden,
  o.estado_envio,
  o.seguimiento,
  o.valor_total
FROM ordenes_por_cliente opc
JOIN clientes c ON c.id = opc.cliente_id
JOIN ordenes o ON o.id = opc.orden_id
WHERE opc.total_ordenes = 1
  AND COALESCE(c.es_interno, false) = false
  AND o.estado_orden::text = 'Transferido'::text
  AND o.estado_envio::text = 'Seguimiento Enviado'::text
  AND opc.orden_fecha <= (now() - '2 mons'::interval)
  AND NULLIF(TRIM(BOTH FROM c.telefono), ''::text) IS NOT NULL
  AND NOT (EXISTS (
    SELECT 1 FROM comercial_cliente_seguimientos s
    WHERE s.cliente_id = c.id AND s.tipo = 'seguimiento_cliente_recompra'::text
  ))
  AND NOT (EXISTS (
    SELECT 1 FROM comercial_exclusiones e
    WHERE (e.entity_type = 'cliente'::text AND e.entity_id = c.id)
       OR (e.entity_type = 'orden'::text AND e.entity_id = o.id)
  ));

-- ---------------------------------------------------------------------------
-- 9. Vencimientos l2: excluir Prueba (nunca se despacha)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.emitir_notificaciones_vencimientos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_dias int;
  v_titulo text;
  v_cuerpo text;
  v_cliente text;
  v_diseno text;
  v_pedido text;
BEGIN
  FOR r IN
    SELECT
      s.id AS sello_id,
      s.orden_id,
      s.fecha_limite,
      COALESCE(NULLIF(btrim(s.diseno), ''), 'Sello') AS diseno,
      TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '')) AS cliente
    FROM public.sellos s
    JOIN public.ordenes o ON o.id = s.orden_id
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE s.fecha_limite IS NOT NULL
      AND COALESCE(s.estado_fabricacion, '') IS DISTINCT FROM 'Hecho'
  LOOP
    v_dias := (r.fecha_limite::date - CURRENT_DATE);
    v_cliente := NULLIF(btrim(r.cliente), '');
    IF v_cliente IS NULL THEN
      v_cliente := 'Cliente';
    END IF;
    v_diseno := r.diseno;
    v_pedido := left(r.orden_id::text, 8);

    IF v_dias < 0 THEN
      v_titulo := v_cliente || ' — ' || v_diseno || ' venció hace ' || abs(v_dias)::text ||
        CASE WHEN abs(v_dias) = 1 THEN ' día' ELSE ' días' END;
      v_cuerpo := 'Pedido #' || v_pedido || ' · fecha límite vencida';
      PERFORM public.emitir_notificacion(
        'p4_vencimiento_vencido',
        'produccion',
        NULL, NULL,
        v_titulo, v_cuerpo,
        'sello', r.sello_id::text, '/produccion',
        'urgent',
        'p4:overdue:' || r.sello_id::text,
        jsonb_build_object(
          'clienteNombre', v_cliente,
          'diseno', v_diseno,
          'ordenId', r.orden_id,
          'dias', v_dias
        ),
        NULL
      );
    ELSIF v_dias <= 3 THEN
      v_titulo := v_cliente || ' — ' || v_diseno ||
        CASE
          WHEN v_dias = 0 THEN ' vence hoy'
          WHEN v_dias = 1 THEN ' vence en 1 día'
          ELSE ' vence en ' || v_dias::text || ' días'
        END;
      v_cuerpo := 'Pedido #' || v_pedido;
      PERFORM public.emitir_notificacion(
        'p4_vencimiento_proximo',
        'produccion',
        NULL, NULL,
        v_titulo, v_cuerpo,
        'sello', r.sello_id::text, '/produccion',
        'warning',
        'p4:upcoming:' || r.sello_id::text,
        jsonb_build_object(
          'clienteNombre', v_cliente,
          'diseno', v_diseno,
          'ordenId', r.orden_id,
          'dias', v_dias
        ),
        NULL
      );
    END IF;
  END LOOP;

  FOR r IN
    SELECT
      o.id AS orden_id,
      MIN(s.fecha_limite)::date AS fecha_limite,
      TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '')) AS cliente
    FROM public.ordenes o
    JOIN public.sellos s ON s.orden_id = o.id
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE s.fecha_limite IS NOT NULL
      AND COALESCE(o.tipo_pedido, 'Venta') <> 'Prueba'
      AND COALESCE(o.estado_envio, '') NOT IN ('Despachado', 'Seguimiento Enviado')
    GROUP BY o.id, c.nombre, c.apellido
  LOOP
    v_dias := (r.fecha_limite - CURRENT_DATE);
    v_cliente := NULLIF(btrim(r.cliente), '');
    IF v_cliente IS NULL THEN
      v_cliente := 'Cliente';
    END IF;
    v_pedido := left(r.orden_id::text, 8);

    IF v_dias < 0 THEN
      v_titulo := v_cliente || ' — pedido #' || v_pedido ||
        ' debería haberse despachado hace ' || abs(v_dias)::text ||
        CASE WHEN abs(v_dias) = 1 THEN ' día' ELSE ' días' END || ' y todavía no salió';
      PERFORM public.emitir_notificacion(
        'l2_despacho_vencido',
        'logistica',
        NULL, NULL,
        v_titulo, NULL,
        'orden', r.orden_id::text, '/envios',
        'urgent',
        'l2:overdue:' || r.orden_id::text,
        jsonb_build_object('clienteNombre', v_cliente, 'ordenId', r.orden_id, 'dias', v_dias),
        NULL
      );
    ELSIF v_dias <= 3 THEN
      v_titulo := v_cliente || ' — pedido #' || v_pedido ||
        CASE
          WHEN v_dias = 0 THEN ' debería despacharse hoy y todavía no salió'
          WHEN v_dias = 1 THEN ' debería despacharse en 1 día y todavía no salió'
          ELSE ' debería despacharse en ' || v_dias::text || ' días y todavía no salió'
        END;
      PERFORM public.emitir_notificacion(
        'l2_despacho_proximo',
        'logistica',
        NULL, NULL,
        v_titulo, NULL,
        'orden', r.orden_id::text, '/envios',
        'warning',
        'l2:upcoming:' || r.orden_id::text,
        jsonb_build_object('clienteNombre', v_cliente, 'ordenId', r.orden_id, 'dias', v_dias),
        NULL
      );
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Stock: excluir pruebas cerradas de demanda; consumir al cerrar Prueba (D1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pending_stock_demand()
RETURNS TABLE(item_key text, qty bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.item_key, sum(b.qty)::bigint
    FROM public.sellos s
    JOIN public.ordenes o ON o.id = s.orden_id
    CROSS JOIN LATERAL public.stock_bom_for_item(s.item_type, s.tipo, s.item_config) b
   WHERE (o.estado_envio IS NULL OR o.estado_envio <> 'Seguimiento Enviado')
     AND (o.created_at >= now() - interval '60 days' OR s.estado_venta = 'Deudor')
     -- Pruebas cerradas (todos Hecho) ya consumieron stock
     AND NOT (
       COALESCE(o.tipo_pedido, 'Venta') = 'Prueba'
       AND NOT EXISTS (
         SELECT 1 FROM public.sellos s2
         WHERE s2.orden_id = o.id
           AND COALESCE(s2.estado_fabricacion, '') IS DISTINCT FROM 'Hecho'
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.order_id = o.id AND m.movement_type = 'OUT'
     )
   GROUP BY b.item_key;
$$;

CREATE OR REPLACE FUNCTION public.trg_consume_stock_on_prueba_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo text;
  v_pendientes int;
BEGIN
  IF NEW.estado_fabricacion IS DISTINCT FROM 'Hecho' THEN
    RETURN NEW;
  END IF;
  IF OLD.estado_fabricacion IS NOT DISTINCT FROM 'Hecho' THEN
    RETURN NEW;
  END IF;

  SELECT o.tipo_pedido INTO v_tipo
  FROM public.ordenes o
  WHERE o.id = NEW.orden_id;

  IF COALESCE(v_tipo, 'Venta') <> 'Prueba' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.sellos s
  WHERE s.orden_id = NEW.orden_id
    AND COALESCE(s.estado_fabricacion, '') IS DISTINCT FROM 'Hecho';

  IF v_pendientes = 0 THEN
    PERFORM public.consume_stock_for_order(NEW.orden_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_consume_stock_on_prueba_cerrada ON public.sellos;
CREATE TRIGGER trigger_consume_stock_on_prueba_cerrada
  AFTER UPDATE OF estado_fabricacion ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_consume_stock_on_prueba_cerrada();
