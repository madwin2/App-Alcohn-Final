-- Archivo base retocado a mano (Vectorización). Nunca pisa archivo_base.
ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS archivo_base_mejorado text,
  ADD COLUMN IF NOT EXISTS archivo_base_mejorado_at timestamptz;

COMMENT ON COLUMN public.sellos.archivo_base_mejorado IS
  'Archivo base retocado a mano que reemplaza al original para vectorizar y previsualizar. '
  'archivo_base nunca se pisa: queda como respaldo del archivo que mandó el cliente.';
