-- Indica que MiCorreo está subiendo la etiqueta (visible en todas las sesiones).
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS micorreo_subiendo_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS micorreo_subiendo_por UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_ordenes_micorreo_subiendo_at
  ON public.ordenes (micorreo_subiendo_at)
  WHERE micorreo_subiendo_at IS NOT NULL;

COMMENT ON COLUMN public.ordenes.micorreo_subiendo_at IS 'Marca de subida a MiCorreo en curso; NULL cuando terminó o falló';
COMMENT ON COLUMN public.ordenes.micorreo_subiendo_por IS 'Usuario que disparó la subida a MiCorreo';
