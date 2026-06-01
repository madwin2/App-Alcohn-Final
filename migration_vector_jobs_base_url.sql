-- Guardar la URL del archivo base en el job (evita race con la actualización del sello).
ALTER TABLE public.vector_jobs
  ADD COLUMN IF NOT EXISTS base_url text;

COMMENT ON COLUMN public.vector_jobs.base_url IS
  'URL del archivo_base al encolar; el worker la usa si sellos.archivo_base aún no está persistido.';
