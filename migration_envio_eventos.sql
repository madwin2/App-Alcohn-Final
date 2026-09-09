-- Log de eventos de envío que no son cambios de estado (impresión/descarga/CSV).
-- Complementa estado_historial y envio_datos_cargado_*.

CREATE TABLE IF NOT EXISTS public.envio_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL CHECK (tipo_evento IN (
    'csv_generado',
    'etiqueta_descargada',
    'etiqueta_reimpresa'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  meta jsonb
);

CREATE INDEX IF NOT EXISTS envio_eventos_orden_id_idx ON public.envio_eventos (orden_id);
CREATE INDEX IF NOT EXISTS envio_eventos_created_at_idx ON public.envio_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS envio_eventos_tipo_idx ON public.envio_eventos (tipo_evento);

ALTER TABLE public.envio_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "envio_eventos_select_authenticated" ON public.envio_eventos;
CREATE POLICY "envio_eventos_select_authenticated"
  ON public.envio_eventos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "envio_eventos_insert_authenticated" ON public.envio_eventos;
CREATE POLICY "envio_eventos_insert_authenticated"
  ON public.envio_eventos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.envio_eventos TO authenticated;
REVOKE UPDATE, DELETE ON public.envio_eventos FROM authenticated;
REVOKE ALL ON public.envio_eventos FROM anon;
