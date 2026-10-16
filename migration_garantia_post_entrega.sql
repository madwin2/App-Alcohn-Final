-- Rehacer post-entrega → orden nueva tipo Garantía (POL-086 / Q-PED-006)
-- ⚠️ Aplicar solo con permiso explícito (base = producción, compartida con tienda web).
--
-- Corte: estado_envio ∈ {Despachado, Seguimiento Enviado} → clona ítem + orden Garantía.
-- Pre-entrega: Rehacer in-place (comportamiento previo).

-- ---------------------------------------------------------------------------
-- 1. tipo_pedido: sumar Garantía
-- ---------------------------------------------------------------------------

ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_tipo_pedido_check;
ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_tipo_pedido_check
  CHECK (tipo_pedido IN ('Venta', 'Prueba', 'Regalo', 'Garantía'));

COMMENT ON COLUMN public.ordenes.tipo_pedido IS
  'Venta (default) | Prueba | Regalo | Garantía. No cambiar después del INSERT.';

-- ---------------------------------------------------------------------------
-- 2. Vínculos origen
-- ---------------------------------------------------------------------------

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS orden_origen_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_orden_origen_id
  ON public.ordenes (orden_origen_id)
  WHERE orden_origen_id IS NOT NULL;

COMMENT ON COLUMN public.ordenes.orden_origen_id IS
  'Pedido original cuando tipo_pedido = Garantía (rehacer post-entrega).';

ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS sello_origen_id uuid REFERENCES public.sellos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sellos_sello_origen_id
  ON public.sellos (sello_origen_id)
  WHERE sello_origen_id IS NOT NULL;

COMMENT ON COLUMN public.sellos.sello_origen_id IS
  'Ítem original del que se clonó este sello (pedido Garantía).';

ALTER TABLE public.sello_rehacer_eventos
  ADD COLUMN IF NOT EXISTS sello_nuevo_id uuid REFERENCES public.sellos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS orden_garantia_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sello_rehacer_eventos.sello_nuevo_id IS
  'Clon en orden Garantía (NULL si el Rehacer fue in-place).';
COMMENT ON COLUMN public.sello_rehacer_eventos.orden_garantia_id IS
  'Orden Garantía creada (NULL si in-place).';

-- ---------------------------------------------------------------------------
-- 3. Integridad: Garantía no fuerza valor=0 (puede llevar cargo adicional)
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
  ELSIF v_tipo = 'Garantía' THEN
    NEW.senia := 0;
    NEW.es_regalo := false;
    -- valor = cargo adicional (0 si no corresponde cobrar)
  END IF;

  IF NEW.es_regalo THEN
    NEW.valor := 0;
    NEW.senia := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Totales: Garantía no suma envío al restante (Correo lo absorbe Alcohn;
--    Andreani lo paga el cliente afuera — BR-COS-006 / POL-086)
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

    IF COALESCE(v_tipo, 'Venta') IN ('Regalo', 'Garantía') THEN
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

        IF COALESCE(NEW.tipo_pedido, 'Venta') IN ('Regalo', 'Garantía') THEN
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
-- 5. RPC registrar_rehacer: rama Garantía post-entrega
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.registrar_rehacer(uuid[], text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.registrar_rehacer(
  p_sello_ids uuid[],
  p_motivo text,
  p_descripcion text,
  p_cobro_monto numeric DEFAULT NULL,
  p_cobro_concepto text DEFAULT NULL
)
RETURNS TABLE (
  evento_id uuid,
  sello_id uuid,
  sello_activo_id uuid,
  orden_garantia_id uuid,
  modo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid := auth.uid();
  v_sello record;
  v_orden record;
  v_orden_ids_inplace uuid[] := ARRAY[]::uuid[];
  v_evento_id uuid;
  v_sello_nuevo_id uuid;
  v_orden_garantia_id uuid;
  v_garantia_por_origen jsonb := '{}'::jsonb;
  v_cobro_asignado_por_origen jsonb := '{}'::jsonb;
  v_valor_clon numeric;
  v_es_post_entrega boolean;
BEGIN
  IF p_sello_ids IS NULL OR array_length(p_sello_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay ítems para rehacer';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  IF p_motivo NOT IN (
    'ERROR_DETECTADO_EN_MAQUINA',
    'ERROR_EN_LA_MEDIDA',
    'ERROR_EN_EL_VECTOR',
    'ERROR_EN_PROGRAMACION_ASPIRE',
    'RECLAMO_CLIENTE_PRE_ENTREGA',
    'DANIO_O_ERROR_EN_ENVIO',
    'RECLAMO_CLIENTE_POST_ENTREGA',
    'OTRO'
  ) THEN
    RAISE EXCEPTION 'Motivo inválido: %', p_motivo;
  END IF;

  FOR v_sello IN
    SELECT
      s.id,
      s.orden_id,
      s.estado_fabricacion,
      s.estado_venta,
      s.foto_sello,
      s.ancho_real,
      s.largo_real,
      s.ancho_fabricacion_mm,
      s.largo_fabricacion_mm,
      s.programa_id,
      s.tipo,
      s.diseno,
      s.nota,
      s.archivo_base,
      s.archivo_base_mejorado,
      s.archivo_base_mejorado_at,
      s.archivo_vector_preview,
      s.estado_vectorizacion,
      s.tipo_planchuela,
      s.item_type,
      s.item_config,
      s.fecha_limite,
      s.mockup_solicitud_id,
      o.estado_envio,
      o.seguimiento,
      o.empresa_envio,
      o.seguimiento_enviado_at,
      o.cliente_id,
      o.tipo_envio,
      o.taken_by
    FROM sellos s
    JOIN ordenes o ON o.id = s.orden_id
    WHERE s.id = ANY(p_sello_ids)
  LOOP
    v_es_post_entrega := COALESCE(v_sello.estado_envio, '') IN ('Despachado', 'Seguimiento Enviado');

    IF v_es_post_entrega THEN
      -- Una orden Garantía por pedido origen (agrupa varios ítems del mismo envío)
      IF v_garantia_por_origen ? v_sello.orden_id::text THEN
        v_orden_garantia_id := (v_garantia_por_origen ->> v_sello.orden_id::text)::uuid;
      ELSE
        INSERT INTO ordenes (
          cliente_id,
          tipo_pedido,
          orden_origen_id,
          estado_orden,
          estado_envio,
          empresa_envio,
          tipo_envio,
          taken_by,
          fecha
        ) VALUES (
          v_sello.cliente_id,
          'Garantía',
          v_sello.orden_id,
          'Señado',
          'Sin envio',
          v_sello.empresa_envio,
          v_sello.tipo_envio,
          v_sello.taken_by,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        )
        RETURNING id INTO v_orden_garantia_id;

        v_garantia_por_origen := v_garantia_por_origen
          || jsonb_build_object(v_sello.orden_id::text, v_orden_garantia_id);
        v_cobro_asignado_por_origen := v_cobro_asignado_por_origen
          || jsonb_build_object(v_sello.orden_id::text, false);
      END IF;

      -- El cargo adicional va al primer clon de esa orden Garantía
      IF p_cobro_monto IS NOT NULL
         AND p_cobro_monto > 0
         AND NOT COALESCE((v_cobro_asignado_por_origen ->> v_sello.orden_id::text)::boolean, false)
      THEN
        v_valor_clon := p_cobro_monto;
        v_cobro_asignado_por_origen := v_cobro_asignado_por_origen
          || jsonb_build_object(v_sello.orden_id::text, true);
      ELSE
        v_valor_clon := 0;
      END IF;

      INSERT INTO sellos (
        orden_id,
        sello_origen_id,
        tipo,
        diseno,
        nota,
        valor,
        senia,
        es_regalo,
        estado_fabricacion,
        es_prioritario,
        estado_venta,
        estado_aspire,
        programa_id,
        maquina,
        archivo_base,
        archivo_base_mejorado,
        archivo_base_mejorado_at,
        archivo_vector_preview,
        foto_sello,
        estado_vectorizacion,
        tipo_planchuela,
        item_type,
        item_config,
        ancho_real,
        largo_real,
        ancho_fabricacion_mm,
        largo_fabricacion_mm,
        fecha_limite,
        mockup_solicitud_id,
        fecha
      ) VALUES (
        v_orden_garantia_id,
        v_sello.id,
        v_sello.tipo,
        v_sello.diseno,
        v_sello.nota,
        v_valor_clon,
        0,
        false,
        'Rehacer',
        true,
        'Señado',
        NULL,
        NULL,
        NULL,
        v_sello.archivo_base,
        v_sello.archivo_base_mejorado,
        v_sello.archivo_base_mejorado_at,
        v_sello.archivo_vector_preview,
        NULL,
        v_sello.estado_vectorizacion,
        v_sello.tipo_planchuela,
        v_sello.item_type,
        v_sello.item_config,
        v_sello.ancho_real,
        v_sello.largo_real,
        v_sello.ancho_fabricacion_mm,
        v_sello.largo_fabricacion_mm,
        v_sello.fecha_limite,
        v_sello.mockup_solicitud_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      )
      RETURNING id INTO v_sello_nuevo_id;

      INSERT INTO sello_rehacer_eventos (
        sello_id, orden_id, motivo, descripcion,
        fabricacion_estado_previo, venta_estado_previo, foto_sello_previo,
        envio_estado_previo, envio_seguimiento_previo, envio_empresa_previo, envio_fecha_previo,
        cobro_adicional_monto, cobro_adicional_concepto, created_by,
        ancho_real_previo, largo_real_previo,
        ancho_fabricacion_mm_previo, largo_fabricacion_mm_previo,
        programa_id_previo,
        sello_nuevo_id, orden_garantia_id
      ) VALUES (
        v_sello.id, v_sello.orden_id, p_motivo, p_descripcion,
        v_sello.estado_fabricacion, v_sello.estado_venta, v_sello.foto_sello,
        v_sello.estado_envio, v_sello.seguimiento, v_sello.empresa_envio, v_sello.seguimiento_enviado_at,
        p_cobro_monto, p_cobro_concepto, v_created_by,
        v_sello.ancho_real, v_sello.largo_real,
        v_sello.ancho_fabricacion_mm, v_sello.largo_fabricacion_mm,
        v_sello.programa_id,
        v_sello_nuevo_id, v_orden_garantia_id
      )
      RETURNING id INTO v_evento_id;

      evento_id := v_evento_id;
      sello_id := v_sello.id;
      sello_activo_id := v_sello_nuevo_id;
      orden_garantia_id := v_orden_garantia_id;
      modo := 'garantia';
      RETURN NEXT;

    ELSE
      -- In-place (pre-entrega): mismo comportamiento de siempre
      INSERT INTO sello_rehacer_eventos (
        sello_id, orden_id, motivo, descripcion,
        fabricacion_estado_previo, venta_estado_previo, foto_sello_previo,
        envio_estado_previo, envio_seguimiento_previo, envio_empresa_previo, envio_fecha_previo,
        cobro_adicional_monto, cobro_adicional_concepto, created_by,
        ancho_real_previo, largo_real_previo,
        ancho_fabricacion_mm_previo, largo_fabricacion_mm_previo,
        programa_id_previo
      ) VALUES (
        v_sello.id, v_sello.orden_id, p_motivo, p_descripcion,
        v_sello.estado_fabricacion, v_sello.estado_venta, v_sello.foto_sello,
        v_sello.estado_envio, v_sello.seguimiento, v_sello.empresa_envio, v_sello.seguimiento_enviado_at,
        p_cobro_monto, p_cobro_concepto, v_created_by,
        v_sello.ancho_real, v_sello.largo_real,
        v_sello.ancho_fabricacion_mm, v_sello.largo_fabricacion_mm,
        v_sello.programa_id
      )
      RETURNING id INTO v_evento_id;

      UPDATE sellos
      SET estado_fabricacion = 'Rehacer',
          es_prioritario = TRUE,
          estado_aspire = NULL,
          foto_sello = CASE WHEN estado_venta = 'Foto' THEN NULL ELSE foto_sello END,
          estado_venta = CASE WHEN estado_venta = 'Foto' THEN 'Señado' ELSE estado_venta END
      WHERE id = v_sello.id;

      v_orden_ids_inplace := array_append(v_orden_ids_inplace, v_sello.orden_id);

      evento_id := v_evento_id;
      sello_id := v_sello.id;
      sello_activo_id := v_sello.id;
      orden_garantia_id := NULL;
      modo := 'inplace';
      RETURN NEXT;
    END IF;
  END LOOP;

  IF array_length(v_orden_ids_inplace, 1) IS NOT NULL THEN
    UPDATE ordenes
    SET estado_envio = 'Sin envio',
        seguimiento = NULL,
        seguimiento_enviado_at = NULL
    WHERE id = ANY(v_orden_ids_inplace)
      AND estado_envio IS NOT NULL
      AND estado_envio <> 'Sin envio'
      AND estado_envio NOT IN ('Despachado', 'Seguimiento Enviado');

    UPDATE ordenes o
    SET estado_orden = sub.unico_estado
    FROM (
      SELECT orden_id, MIN(estado_venta) AS unico_estado, COUNT(DISTINCT estado_venta) AS distintos
      FROM sellos
      WHERE orden_id = ANY(v_orden_ids_inplace)
      GROUP BY orden_id
    ) sub
    WHERE o.id = sub.orden_id AND sub.distintos = 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.registrar_rehacer(uuid[], text, text, numeric, text) IS
  'Rehacer: post-entrega (Despachado/Seguimiento Enviado) crea orden Garantía + clon; pre-entrega resetea in-place. Devuelve evento_id, sello original, sello activo y orden_garantia_id.';

GRANT EXECUTE ON FUNCTION public.registrar_rehacer(uuid[], text, text, numeric, text)
  TO authenticated, service_role;
