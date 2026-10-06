-- UX-06 / UX-09 · Marcar ocurrencias de tareas + columna `fecha` para un solo día.
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere migration_equipo_tareas_recurrentes.sql y migration_equipo_tareas_unicas.sql.

-- ═══════════════════════════════════════════════════════════════════════════
-- UX-09 · Columna propia para tareas de un solo día
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tareas_recurrentes
  ADD COLUMN IF NOT EXISTS fecha date;

UPDATE public.tareas_recurrentes
SET fecha = semana_inicio,
    semana_inicio = NULL
WHERE frecuencia = 'unica'
  AND fecha IS NULL
  AND semana_inicio IS NOT NULL;

ALTER TABLE public.tareas_recurrentes
  DROP CONSTRAINT IF EXISTS tareas_recurrentes_unica_fecha;

ALTER TABLE public.tareas_recurrentes
  ADD CONSTRAINT tareas_recurrentes_unica_fecha
  CHECK (frecuencia <> 'unica' OR fecha IS NOT NULL);

COMMENT ON COLUMN public.tareas_recurrentes.semana_inicio IS
  'Quincenal: lunes de referencia. (Las de un solo día usan `fecha`.)';

COMMENT ON COLUMN public.tareas_recurrentes.fecha IS
  'Única: fecha concreta del único día (YYYY-MM-DD). NULL en el resto de frecuencias.';

-- ═══════════════════════════════════════════════════════════════════════════
-- UX-06 · Registro por ocurrencia (sin fila = pendiente)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tareas_registro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas_recurrentes(id) ON DELETE CASCADE,
  fecha_programada date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('hecha', 'no_hecha', 'movida')),
  fecha_destino date,
  marcado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  marcado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarea_id, fecha_programada),
  CHECK (estado <> 'movida' OR fecha_destino IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tareas_registro_tarea_fecha
  ON public.tareas_registro (tarea_id, fecha_programada);

COMMENT ON TABLE public.tareas_registro IS
  'Marca por ocurrencia de tareas_recurrentes: hecha / no_hecha / movida (Q-EQ-018).';

ALTER TABLE public.tareas_registro ENABLE ROW LEVEL SECURITY;

-- SELECT: dueño de la tarea, admin, o quien la creó (Q-EQ-023)
DROP POLICY IF EXISTS treg_select ON public.tareas_registro;
CREATE POLICY treg_select ON public.tareas_registro
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tareas_recurrentes t
      WHERE t.id = tarea_id
        AND (
          t.user_id = auth.uid()
          OR t.creado_por = auth.uid()
          OR public.es_admin_equipo()
        )
    )
  );

-- INSERT/UPDATE/DELETE: dueño de la tarea o admin
DROP POLICY IF EXISTS treg_insert ON public.tareas_registro;
CREATE POLICY treg_insert ON public.tareas_registro
  FOR INSERT TO authenticated
  WITH CHECK (
    marcado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tareas_recurrentes t
      WHERE t.id = tarea_id
        AND (t.user_id = auth.uid() OR public.es_admin_equipo())
    )
  );

DROP POLICY IF EXISTS treg_update ON public.tareas_registro;
CREATE POLICY treg_update ON public.tareas_registro
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tareas_recurrentes t
      WHERE t.id = tarea_id
        AND (t.user_id = auth.uid() OR public.es_admin_equipo())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tareas_recurrentes t
      WHERE t.id = tarea_id
        AND (t.user_id = auth.uid() OR public.es_admin_equipo())
    )
  );

DROP POLICY IF EXISTS treg_delete ON public.tareas_registro;
CREATE POLICY treg_delete ON public.tareas_registro
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tareas_recurrentes t
      WHERE t.id = tarea_id
        AND (t.user_id = auth.uid() OR public.es_admin_equipo())
    )
  );
