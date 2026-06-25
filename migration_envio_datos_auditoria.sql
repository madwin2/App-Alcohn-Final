-- Auditoría de carga/edición de datos de envío por orden
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS envio_datos_cargado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS envio_datos_cargado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS envio_datos_editado BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ordenes_envio_datos_cargado_por
  ON public.ordenes (envio_datos_cargado_por);

COMMENT ON COLUMN public.ordenes.envio_datos_cargado_por IS 'Usuario que cargó por primera vez los datos de envío';
COMMENT ON COLUMN public.ordenes.envio_datos_cargado_at IS 'Fecha/hora de la primera carga de datos de envío';
COMMENT ON COLUMN public.ordenes.envio_datos_editado IS 'True si los datos de envío fueron editados después de la carga inicial';
