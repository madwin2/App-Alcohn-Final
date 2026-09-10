-- Flujo Rehacer: evento por ítem (motivo, snapshot de estados, cobro adicional)
-- + RPC atómico que resetea fabricación / foto / envío.
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.sello_rehacer_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sello_id uuid NOT NULL REFERENCES public.sellos(id) ON DELETE CASCADE,
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN (
    'ERROR_DETECTADO_EN_MAQUINA',
    'ERROR_MEDIDA_O_VECTOR',
    'RECLAMO_CLIENTE_PRE_ENTREGA',
    'DANIO_O_ERROR_EN_ENVIO',
    'RECLAMO_CLIENTE_POST_ENTREGA',
    'OTRO'
  )),
  descripcion text,

  fabricacion_estado_previo text,
  venta_estado_previo text,
  foto_sello_previo text,
  envio_estado_previo text,
  envio_seguimiento_previo text,
  envio_empresa_previo text,
  envio_fecha_previo timestamptz,

  cobro_adicional_monto numeric,
  cobro_adicional_concepto text,
  cobro_adicional_cobrado boolean NOT NULL DEFAULT false,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sello_rehacer_sello_id ON public.sello_rehacer_eventos (sello_id);
CREATE INDEX IF NOT EXISTS idx_sello_rehacer_orden_id ON public.sello_rehacer_eventos (orden_id);
CREATE INDEX IF NOT EXISTS idx_sello_rehacer_created_at ON public.sello_rehacer_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sello_rehacer_cobro_pendiente
  ON public.sello_rehacer_eventos (orden_id)
  WHERE cobro_adicional_monto IS NOT NULL AND cobro_adicional_cobrado = false;

COMMENT ON TABLE public.sello_rehacer_eventos IS
  'Cada vez que se marca Rehacer: motivo, snapshot de venta/envío y cobro adicional opcional.';

ALTER TABLE public.sello_rehacer_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sello_rehacer_select_authenticated" ON public.sello_rehacer_eventos;
CREATE POLICY "sello_rehacer_select_authenticated"
  ON public.sello_rehacer_eventos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sello_rehacer_update_authenticated" ON public.sello_rehacer_eventos;
CREATE POLICY "sello_rehacer_update_authenticated"
  ON public.sello_rehacer_eventos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON public.sello_rehacer_eventos TO authenticated;
REVOKE INSERT, DELETE ON public.sello_rehacer_eventos FROM authenticated;
REVOKE ALL ON public.sello_rehacer_eventos FROM anon;

-- ---------------------------------------------------------------------------
-- RPC: inserta eventos + resetea ítems y envío del pedido en una transacción
-- ---------------------------------------------------------------------------
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
  'Registra Rehacer (motivo + snapshot) y resetea fabricación/foto/envío según el estado previo.';

GRANT EXECUTE ON FUNCTION public.registrar_rehacer(uuid[], text, text, numeric, text)
  TO authenticated, service_role;
