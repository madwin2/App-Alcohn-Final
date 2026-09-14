-- Al pasar un sello a Rehacer, marcarlo automáticamente como Prioridad.
-- Cubra el RPC registrar_rehacer y cualquier otro update de estado_fabricacion.
-- Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.sellos_rehacer_auto_prioridad()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado_fabricacion = 'Rehacer'
     AND (TG_OP = 'INSERT' OR OLD.estado_fabricacion IS DISTINCT FROM 'Rehacer') THEN
    NEW.es_prioritario := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sellos_rehacer_auto_prioridad() IS
  'Si un sello entra a estado Rehacer, lo marca como prioritario.';

DROP TRIGGER IF EXISTS trigger_sellos_rehacer_auto_prioridad ON public.sellos;
CREATE TRIGGER trigger_sellos_rehacer_auto_prioridad
  BEFORE INSERT OR UPDATE OF estado_fabricacion ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.sellos_rehacer_auto_prioridad();

CREATE OR REPLACE FUNCTION public.registrar_rehacer(
  p_sello_ids uuid[],
  p_motivo text,
  p_descripcion text,
  p_cobro_monto numeric DEFAULT NULL,
  p_cobro_concepto text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid := auth.uid();
  v_sello record;
  v_orden record;
  v_orden_ids uuid[];
BEGIN
  IF p_sello_ids IS NULL OR array_length(p_sello_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay ítems para rehacer';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  IF p_motivo NOT IN (
    'ERROR_DETECTADO_EN_MAQUINA',
    'ERROR_MEDIDA_O_VECTOR',
    'RECLAMO_CLIENTE_PRE_ENTREGA',
    'DANIO_O_ERROR_EN_ENVIO',
    'RECLAMO_CLIENTE_POST_ENTREGA',
    'OTRO'
  ) THEN
    RAISE EXCEPTION 'Motivo inválido: %', p_motivo;
  END IF;

  FOR v_sello IN
    SELECT id, orden_id, estado_fabricacion, estado_venta, foto_sello
    FROM sellos WHERE id = ANY(p_sello_ids)
  LOOP
    SELECT * INTO v_orden FROM ordenes WHERE id = v_sello.orden_id;

    INSERT INTO sello_rehacer_eventos (
      sello_id, orden_id, motivo, descripcion,
      fabricacion_estado_previo, venta_estado_previo, foto_sello_previo,
      envio_estado_previo, envio_seguimiento_previo, envio_empresa_previo, envio_fecha_previo,
      cobro_adicional_monto, cobro_adicional_concepto, created_by
    ) VALUES (
      v_sello.id, v_sello.orden_id, p_motivo, p_descripcion,
      v_sello.estado_fabricacion, v_sello.estado_venta, v_sello.foto_sello,
      v_orden.estado_envio, v_orden.seguimiento, v_orden.empresa_envio, v_orden.seguimiento_enviado_at,
      p_cobro_monto, p_cobro_concepto, v_created_by
    );

    UPDATE sellos
    SET estado_fabricacion = 'Rehacer',
        es_prioritario = TRUE,
        estado_aspire = NULL,
        foto_sello = CASE WHEN estado_venta = 'Foto' THEN NULL ELSE foto_sello END,
        estado_venta = CASE WHEN estado_venta = 'Foto' THEN 'Señado' ELSE estado_venta END
    WHERE id = v_sello.id;
  END LOOP;

  v_orden_ids := ARRAY(SELECT DISTINCT orden_id FROM sellos WHERE id = ANY(p_sello_ids));

  UPDATE ordenes
  SET estado_envio = 'Sin envio',
      seguimiento = NULL,
      seguimiento_enviado_at = NULL
  WHERE id = ANY(v_orden_ids)
    AND estado_envio IS NOT NULL
    AND estado_envio <> 'Sin envio';

  UPDATE ordenes o
  SET estado_orden = sub.unico_estado
  FROM (
    SELECT orden_id, MIN(estado_venta) AS unico_estado, COUNT(DISTINCT estado_venta) AS distintos
    FROM sellos
    WHERE orden_id = ANY(v_orden_ids)
    GROUP BY orden_id
  ) sub
  WHERE o.id = sub.orden_id AND sub.distintos = 1;
END;
$$;

COMMENT ON FUNCTION public.registrar_rehacer(uuid[], text, text, numeric, text) IS
  'Registra Rehacer (motivo + snapshot), marca Prioridad y resetea fabricación/foto/envío.';
