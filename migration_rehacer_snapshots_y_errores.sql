-- Snapshots de base/vector al marcar Rehacer + medidas/programa previos.
-- El RPC ahora devuelve (evento_id, sello_id) para que el cliente copie
-- los archivos a rehacer-snapshots/{evento_id}/… y actualice las URLs.
-- Ejecutar en Supabase SQL Editor (producción; pedir OK explícito).

ALTER TABLE public.sello_rehacer_eventos
  ADD COLUMN IF NOT EXISTS archivo_base_snapshot text,
  ADD COLUMN IF NOT EXISTS archivo_vector_snapshot text,
  ADD COLUMN IF NOT EXISTS archivo_base_mejorado_snapshot text,
  ADD COLUMN IF NOT EXISTS ancho_real_previo text,
  ADD COLUMN IF NOT EXISTS largo_real_previo text,
  ADD COLUMN IF NOT EXISTS ancho_fabricacion_mm_previo numeric,
  ADD COLUMN IF NOT EXISTS largo_fabricacion_mm_previo numeric,
  ADD COLUMN IF NOT EXISTS programa_id_previo uuid;

COMMENT ON COLUMN public.sello_rehacer_eventos.archivo_base_snapshot IS
  'Copia inmutable del archivo base al momento del Rehacer (path rehacer-snapshots/…).';
COMMENT ON COLUMN public.sello_rehacer_eventos.archivo_vector_snapshot IS
  'Copia inmutable del vector (o preview) al momento del Rehacer.';
COMMENT ON COLUMN public.sello_rehacer_eventos.archivo_base_mejorado_snapshot IS
  'Copia inmutable de la base retocada, si existía.';
COMMENT ON COLUMN public.sello_rehacer_eventos.programa_id_previo IS
  'Programa al que estaba asociado el sello cuando se marcó Rehacer.';

COMMENT ON TABLE public.sello_rehacer_eventos IS
  'Cada Rehacer: motivo, snapshot de estados/medidas/archivos y cobro adicional opcional.';

-- Cambiar el tipo de retorno exige DROP primero.
DROP FUNCTION IF EXISTS public.registrar_rehacer(uuid[], text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.registrar_rehacer(
  p_sello_ids uuid[],
  p_motivo text,
  p_descripcion text,
  p_cobro_monto numeric DEFAULT NULL,
  p_cobro_concepto text DEFAULT NULL
)
RETURNS TABLE (evento_id uuid, sello_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid := auth.uid();
  v_sello record;
  v_orden record;
  v_orden_ids uuid[];
  v_evento_id uuid;
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
    SELECT
      id,
      orden_id,
      estado_fabricacion,
      estado_venta,
      foto_sello,
      ancho_real,
      largo_real,
      ancho_fabricacion_mm,
      largo_fabricacion_mm,
      programa_id
    FROM sellos
    WHERE id = ANY(p_sello_ids)
  LOOP
    SELECT * INTO v_orden FROM ordenes WHERE id = v_sello.orden_id;

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
      v_orden.estado_envio, v_orden.seguimiento, v_orden.empresa_envio, v_orden.seguimiento_enviado_at,
      p_cobro_monto, p_cobro_concepto, v_created_by,
      v_sello.ancho_real, v_sello.largo_real,
      v_sello.ancho_fabricacion_mm, v_sello.largo_fabricacion_mm,
      v_sello.programa_id
    )
    RETURNING id INTO v_evento_id;

    evento_id := v_evento_id;
    sello_id := v_sello.id;
    RETURN NEXT;

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
  'Registra Rehacer (motivo + snapshot de estados/medidas), marca Prioridad y resetea fabricación/foto/envío. Devuelve evento_id por sello para copiar archivos.';

GRANT EXECUTE ON FUNCTION public.registrar_rehacer(uuid[], text, text, numeric, text)
  TO authenticated, service_role;
