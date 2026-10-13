-- Corcho v2 (2026-10-09): comentarios, "no se edita con votos" y permisos solo para el equipo.
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere migration_equipo_corcho.sql y public.es_admin_equipo().
-- Reemplaza la sección "corcho" de migration_equipo_fix_rls.sql (que no se aplica tal cual).
-- Idempotente: se puede correr más de una vez.

-- ═══════════════════════════════════════════════════════════════════════════
-- Miembro activo del equipo (POL-057). Misma definición que fix_rls.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Ideas: solo el equipo; el autor edita/borra mientras es propuesta,
-- y edita solo si todavía nadie votó (POL-076).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ideas_corcho DROP CONSTRAINT IF EXISTS ideas_corcho_titulo_largo;
ALTER TABLE public.ideas_corcho
  ADD CONSTRAINT ideas_corcho_titulo_largo CHECK (length(titulo) <= 120);

CREATE OR REPLACE FUNCTION public.idea_corcho_tiene_votos(p_idea_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ideas_corcho_votos v WHERE v.idea_id = p_idea_id);
$$;

REVOKE ALL ON FUNCTION public.idea_corcho_tiene_votos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.idea_corcho_tiene_votos(uuid) TO authenticated;

DROP POLICY IF EXISTS ideas_select ON public.ideas_corcho;
CREATE POLICY ideas_select ON public.ideas_corcho
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

DROP POLICY IF EXISTS ideas_insert ON public.ideas_corcho;
CREATE POLICY ideas_insert ON public.ideas_corcho
  FOR INSERT TO authenticated
  WITH CHECK (
    public.es_miembro_equipo()
    AND autor_user_id = auth.uid()
    AND estado = 'propuesta'
  );

DROP POLICY IF EXISTS ideas_update ON public.ideas_corcho;
CREATE POLICY ideas_update ON public.ideas_corcho
  FOR UPDATE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (
        autor_user_id = auth.uid()
        AND estado = 'propuesta'
        AND NOT public.idea_corcho_tiene_votos(id)
      )
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Votos: solo el equipo, no la idea propia, no las descartadas (EQ-R34).
-- ═══════════════════════════════════════════════════════════════════════════

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
-- Comentarios (POL-077): opcionales, cualquiera del equipo; se borra el propio
-- (el admin puede borrar cualquiera). No se editan.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ideas_corcho_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.ideas_corcho(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (length(trim(texto)) > 0 AND length(texto) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ideas_corcho_comentarios IS
  'Comentarios en ideas del corcho (POL-077). No se editan; se borra el propio o el admin.';

CREATE INDEX IF NOT EXISTS idx_ideas_corcho_comentarios_idea
  ON public.ideas_corcho_comentarios (idea_id, created_at);

ALTER TABLE public.ideas_corcho_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comentarios_select ON public.ideas_corcho_comentarios;
CREATE POLICY comentarios_select ON public.ideas_corcho_comentarios
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

DROP POLICY IF EXISTS comentarios_insert ON public.ideas_corcho_comentarios;
CREATE POLICY comentarios_insert ON public.ideas_corcho_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (public.es_miembro_equipo() AND autor_user_id = auth.uid());

DROP POLICY IF EXISTS comentarios_delete ON public.ideas_corcho_comentarios;
CREATE POLICY comentarios_delete ON public.ideas_corcho_comentarios
  FOR DELETE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (autor_user_id = auth.uid() OR public.es_admin_equipo())
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ideas_corcho_comentarios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas_corcho_comentarios;
  END IF;
END $$;
