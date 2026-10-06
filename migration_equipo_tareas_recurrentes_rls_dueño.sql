-- Solo si ya aplicaste migration_equipo_tareas_recurrentes.sql con la RLS vieja (S7).
-- ⚠️ NO aplicar sin permiso explícito del dueño.
-- Corrige: el dueño de la tarea (user_id) puede UPDATE/DELETE aunque creado_por sea el admin.

DROP POLICY IF EXISTS tr_update ON public.tareas_recurrentes;
CREATE POLICY tr_update ON public.tareas_recurrentes FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR user_id = auth.uid())
  WITH CHECK (public.es_admin_equipo() OR user_id = auth.uid());

DROP POLICY IF EXISTS tr_delete ON public.tareas_recurrentes;
CREATE POLICY tr_delete ON public.tareas_recurrentes FOR DELETE TO authenticated
  USING (public.es_admin_equipo() OR user_id = auth.uid());
