-- =====================================================
-- Worker de vectorización (cola + estados)
-- =====================================================

-- Estado extra para mostrar fallos definitivos del worker.
ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS error_vectorizacion_mensaje text;

-- Asegurar columna estado_vectorizacion.
ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS estado_vectorizacion text DEFAULT 'BASE';

-- Reemplazar constraint por una versión con ERROR.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.sellos'::regclass
      AND conname ILIKE '%estado_vectorizacion%'
  LOOP
    EXECUTE format('ALTER TABLE public.sellos DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.sellos
  ADD CONSTRAINT sellos_estado_vectorizacion_check
  CHECK (estado_vectorizacion IN ('BASE', 'EN_PROCESO', 'VECTORIZADO', 'DESCARGADO', 'ERROR'));

COMMENT ON COLUMN public.sellos.error_vectorizacion_mensaje IS
  'Detalle del último fallo de vectorización automática. NULL cuando no hay error activo.';

-- Cola de trabajos para el worker.
CREATE TABLE IF NOT EXISTS public.vector_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sello_id uuid NOT NULL REFERENCES public.sellos(id) ON DELETE CASCADE,
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'PENDING' CHECK (estado IN ('PENDING', 'PROCESSING', 'DONE', 'ERROR')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  locked_at timestamptz NULL,
  run_after timestamptz NULL,
  last_error text NULL,
  worker_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_vector_jobs_estado_run_after
  ON public.vector_jobs (estado, run_after, created_at);

CREATE INDEX IF NOT EXISTS idx_vector_jobs_sello_id
  ON public.vector_jobs (sello_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at_vector_jobs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at_vector_jobs ON public.vector_jobs;
CREATE TRIGGER trg_touch_updated_at_vector_jobs
BEFORE UPDATE ON public.vector_jobs
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at_vector_jobs();

