-- Mensaje de error devuelto por MiCorreo (tooltip en Error de Etiqueta).
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS error_etiqueta_mensaje text;

COMMENT ON COLUMN public.ordenes.error_etiqueta_mensaje IS
  'Detalle del último fallo al subir etiqueta a MiCorreo; NULL si no hay error o la etiqueta quedó lista.';
