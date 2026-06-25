-- Estado propio del flujo de etiqueta MiCorreo.
-- No reemplaza `estado_envio`; lo complementa para no romper automatizaciones existentes.
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS etiqueta_estado TEXT
    CHECK (
      etiqueta_estado IS NULL
      OR etiqueta_estado IN ('pendiente', 'generando', 'generada', 'pagando', 'pagada', 'error')
    ),
  ADD COLUMN IF NOT EXISTS etiqueta_error_codigo TEXT,
  ADD COLUMN IF NOT EXISTS etiqueta_error_mensaje TEXT,
  ADD COLUMN IF NOT EXISTS etiqueta_generada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS etiqueta_pagada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS etiqueta_actualizada_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ordenes_etiqueta_estado
  ON public.ordenes (etiqueta_estado);

COMMENT ON COLUMN public.ordenes.etiqueta_estado IS
  'Estado interno del flujo MiCorreo: pendiente/generando/generada/pagando/pagada/error';
COMMENT ON COLUMN public.ordenes.etiqueta_error_codigo IS
  'Código normalizado del último error de etiqueta (ej. cp_localidad_invalido)';
COMMENT ON COLUMN public.ordenes.etiqueta_error_mensaje IS
  'Mensaje legible del último error de etiqueta/pago';
