-- Registro de ediciones de vectores (PLAN_CORRECCION_AUTONOMA_VECTORES §4, ADR-028).
-- Por cada vector que se guarda desde Revisión, Asignar SVG o el chequeo de
-- fresa: el original, lo que propuso la corrección automática y lo que quedó,
-- qué se hizo a mano y el chequeo de fresa de cada versión. Lo escribe la app
-- sola; sirve para medir cuánto acierta la automática y aprender de las
-- ediciones. Los SVG van al bucket `vector`, carpeta `ediciones/`.
-- Ejecutar en Supabase SQL Editor (una vez).

CREATE TABLE IF NOT EXISTS public.vector_ediciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_email text,
  sello_id uuid REFERENCES public.sellos(id) ON DELETE SET NULL,
  orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  origen text NOT NULL CHECK (origen IN ('revision', 'asignar', 'pedidos', 'produccion', 'programas')),
  -- original: se guardó como salió · auto: la corrección automática ·
  -- manual: editado a mano (sobre el original o sobre la automática)
  eleccion text NOT NULL CHECK (eleccion IN ('original', 'auto', 'manual')),
  -- aceptada / rechazada / editada / sin_propuesta (ver edicionesMetricas.ts)
  resultado text NOT NULL CHECK (resultado IN ('aceptada', 'rechazada', 'editada', 'sin_propuesta')),
  -- letras_pegadas, ojos, mixto, sin_problemas, 3mm, alimento (ver edicionesMetricas.ts)
  tipo_caso text NOT NULL,
  svg_original_path text,
  svg_auto_path text,
  svg_final_path text,
  -- operaciones de la versión guardada (automáticas y registro del editor)
  operaciones jsonb,
  chequeo_original jsonb,
  chequeo_auto jsonb,
  chequeo_final jsonb,
  ancho_mm numeric,
  alto_mm numeric,
  tipo_sello text,
  alimento boolean NOT NULL DEFAULT false,
  version_algoritmo integer,
  segundos_edicion integer
);

CREATE INDEX IF NOT EXISTS idx_vector_ediciones_created ON public.vector_ediciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vector_ediciones_sello ON public.vector_ediciones (sello_id);

ALTER TABLE public.vector_ediciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vector_ediciones_select_authenticated" ON public.vector_ediciones;
CREATE POLICY "vector_ediciones_select_authenticated"
  ON public.vector_ediciones FOR SELECT TO authenticated
  USING (true);

-- Solo se agregan filas: el registro no se edita ni se borra desde la app.
DROP POLICY IF EXISTS "vector_ediciones_insert_authenticated" ON public.vector_ediciones;
CREATE POLICY "vector_ediciones_insert_authenticated"
  ON public.vector_ediciones FOR INSERT TO authenticated
  WITH CHECK (true);
