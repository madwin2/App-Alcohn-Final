-- Correcciones RLS / schema del módulo Equipo (EQ-R05, R11, R13, R15, R34).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere migraciones migration_equipo_*.sql ya aplicadas.

-- ═══════════════════════════════════════════════════════════════════════════
-- EQ-R13 · Solo integrantes activos usan lo del equipo
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.es_miembro_equipo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles_equipo p
    WHERE p.user_id = auth.uid()
      AND p.activo = true
  );
$$;

REVOKE ALL ON FUNCTION public.es_miembro_equipo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.es_miembro_equipo() TO authenticated;

COMMENT ON FUNCTION public.es_miembro_equipo() IS
  'True si el usuario logueado tiene perfil de equipo activo (EQ-R13 / POL-057).';

-- perfiles_equipo SELECT: miembro activo O la propia fila (desactivado ve su estado)
DROP POLICY IF EXISTS perfiles_equipo_select ON public.perfiles_equipo;
CREATE POLICY perfiles_equipo_select ON public.perfiles_equipo
  FOR SELECT TO authenticated
  USING (
    public.es_miembro_equipo()
    OR user_id = auth.uid()
  );

-- feriados SELECT
DROP POLICY IF EXISTS feriados_select ON public.feriados;
CREATE POLICY feriados_select ON public.feriados
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

-- ausencias
DROP POLICY IF EXISTS ausencias_select ON public.ausencias_equipo;
CREATE POLICY ausencias_select ON public.ausencias_equipo
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

-- EQ-R05: no admin solo inserta/actualiza con fecha_desde > hoy (AR)
DROP POLICY IF EXISTS ausencias_insert ON public.ausencias_equipo;
CREATE POLICY ausencias_insert ON public.ausencias_equipo
  FOR INSERT TO authenticated
  WITH CHECK (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (
        user_id = auth.uid()
        AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      )
    )
  );

DROP POLICY IF EXISTS ausencias_update ON public.ausencias_equipo;
CREATE POLICY ausencias_update ON public.ausencias_equipo
  FOR UPDATE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (
        user_id = auth.uid()
        AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      )
    )
  )
  WITH CHECK (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (
        user_id = auth.uid()
        AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      )
    )
  );

DROP POLICY IF EXISTS ausencias_delete ON public.ausencias_equipo;
CREATE POLICY ausencias_delete ON public.ausencias_equipo
  FOR DELETE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (
        user_id = auth.uid()
        AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      )
    )
  );

-- tareas recurrentes
DROP POLICY IF EXISTS tr_select ON public.tareas_recurrentes;
CREATE POLICY tr_select ON public.tareas_recurrentes
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

DROP POLICY IF EXISTS tr_insert ON public.tareas_recurrentes;
CREATE POLICY tr_insert ON public.tareas_recurrentes
  FOR INSERT TO authenticated
  WITH CHECK (public.es_miembro_equipo() AND (user_id = auth.uid() OR public.es_admin_equipo()));

DROP POLICY IF EXISTS tr_update ON public.tareas_recurrentes;
CREATE POLICY tr_update ON public.tareas_recurrentes
  FOR UPDATE TO authenticated
  USING (public.es_miembro_equipo() AND (user_id = auth.uid() OR public.es_admin_equipo()))
  WITH CHECK (public.es_miembro_equipo() AND (user_id = auth.uid() OR public.es_admin_equipo()));

DROP POLICY IF EXISTS tr_delete ON public.tareas_recurrentes;
CREATE POLICY tr_delete ON public.tareas_recurrentes
  FOR DELETE TO authenticated
  USING (public.es_miembro_equipo() AND (user_id = auth.uid() OR public.es_admin_equipo()));

-- notas personales
DROP POLICY IF EXISTS notas_personales_own ON public.notas_personales;
CREATE POLICY notas_personales_own ON public.notas_personales
  FOR ALL TO authenticated
  USING (public.es_miembro_equipo() AND user_id = auth.uid())
  WITH CHECK (public.es_miembro_equipo() AND user_id = auth.uid());

-- necesidades
DROP POLICY IF EXISTS nec_select ON public.necesidades_equipo;
CREATE POLICY nec_select ON public.necesidades_equipo
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo() AND (user_id = auth.uid() OR public.es_admin_equipo()));

DROP POLICY IF EXISTS nec_insert ON public.necesidades_equipo;
CREATE POLICY nec_insert ON public.necesidades_equipo
  FOR INSERT TO authenticated
  WITH CHECK (public.es_miembro_equipo() AND user_id = auth.uid());

DROP POLICY IF EXISTS nec_update ON public.necesidades_equipo;
CREATE POLICY nec_update ON public.necesidades_equipo
  FOR UPDATE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (user_id = auth.uid() AND estado = 'pendiente')
    )
  )
  WITH CHECK (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (user_id = auth.uid() AND estado = 'pendiente')
    )
  );

DROP POLICY IF EXISTS nec_delete ON public.necesidades_equipo;
CREATE POLICY nec_delete ON public.necesidades_equipo
  FOR DELETE TO authenticated
  USING (public.es_miembro_equipo() AND user_id = auth.uid() AND estado = 'pendiente');

-- objetivos
DROP POLICY IF EXISTS obj_select ON public.objetivos_personales;
CREATE POLICY obj_select ON public.objetivos_personales
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo() AND (user_id = auth.uid() OR public.es_admin_equipo()));

DROP POLICY IF EXISTS obj_write ON public.objetivos_personales;
CREATE POLICY obj_write ON public.objetivos_personales
  FOR ALL TO authenticated
  USING (public.es_miembro_equipo() AND user_id = auth.uid())
  WITH CHECK (public.es_miembro_equipo() AND user_id = auth.uid());

-- feedback SELECT
DROP POLICY IF EXISTS fb_select ON public.feedback_equipo;
CREATE POLICY fb_select ON public.feedback_equipo
  FOR SELECT TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (para_user_id = auth.uid() OR public.es_admin_equipo())
  );

-- corcho ideas
DROP POLICY IF EXISTS ideas_select ON public.ideas_corcho;
CREATE POLICY ideas_select ON public.ideas_corcho
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

DROP POLICY IF EXISTS ideas_insert ON public.ideas_corcho;
CREATE POLICY ideas_insert ON public.ideas_corcho
  FOR INSERT TO authenticated
  WITH CHECK (public.es_miembro_equipo() AND autor_user_id = auth.uid());

DROP POLICY IF EXISTS ideas_update ON public.ideas_corcho;
CREATE POLICY ideas_update ON public.ideas_corcho
  FOR UPDATE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (autor_user_id = auth.uid() AND estado = 'propuesta')
    )
  )
  WITH CHECK (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (autor_user_id = auth.uid() AND estado = 'propuesta')
    )
  );

DROP POLICY IF EXISTS ideas_delete ON public.ideas_corcho;
CREATE POLICY ideas_delete ON public.ideas_corcho
  FOR DELETE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (autor_user_id = auth.uid() AND estado = 'propuesta')
    )
  );

-- votos (EQ-R34: no votar descartadas)
DROP POLICY IF EXISTS votos_select ON public.ideas_corcho_votos;
CREATE POLICY votos_select ON public.ideas_corcho_votos
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

DROP POLICY IF EXISTS votos_write ON public.ideas_corcho_votos;
CREATE POLICY votos_write ON public.ideas_corcho_votos
  FOR ALL TO authenticated
  USING (public.es_miembro_equipo() AND user_id = auth.uid())
  WITH CHECK (
    public.es_miembro_equipo()
    AND user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.ideas_corcho i
      WHERE i.id = idea_id AND i.autor_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.ideas_corcho i
      WHERE i.id = idea_id AND i.estado <> 'descartada'
    )
  );

DROP POLICY IF EXISTS vistas_own ON public.ideas_corcho_vistas;
CREATE POLICY vistas_own ON public.ideas_corcho_vistas
  FOR ALL TO authenticated
  USING (public.es_miembro_equipo() AND user_id = auth.uid())
  WITH CHECK (public.es_miembro_equipo() AND user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- EQ-R11 · No dejar el equipo sin admin activo
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_perfiles_equipo_ultimo_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.es_admin = true AND OLD.activo = true)
       AND (NEW.es_admin = false OR NEW.activo = false)
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.perfiles_equipo p
        WHERE p.user_id <> OLD.user_id
          AND p.es_admin = true
          AND p.activo = true
      ) THEN
        RAISE EXCEPTION 'No se puede dejar el equipo sin un administrador activo';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perfiles_equipo_ultimo_admin ON public.perfiles_equipo;
CREATE TRIGGER trg_perfiles_equipo_ultimo_admin
  BEFORE UPDATE ON public.perfiles_equipo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_perfiles_equipo_ultimo_admin();

-- ═══════════════════════════════════════════════════════════════════════════
-- EQ-R15 · Feedback editado: columna editado_at
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.feedback_equipo
  ADD COLUMN IF NOT EXISTS editado_at timestamptz;

COMMENT ON COLUMN public.feedback_equipo.editado_at IS
  'Cuando el admin editó tipo/título/texto; al editar se limpia leido_at (EQ-R15).';
