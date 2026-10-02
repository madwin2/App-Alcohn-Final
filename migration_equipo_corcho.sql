-- Corcho de ideas compartido (Mi perfil / /corcho, Etapa 6).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere Etapa 1 aplicada: public.es_admin_equipo().

CREATE TABLE IF NOT EXISTS public.ideas_corcho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion text,
  estado text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta','aprobada','descartada')),
  estado_cambiado_por uuid REFERENCES auth.users(id),
  estado_cambiado_at timestamptz,
  comentario_estado text,            -- opcional: por qué se aprobó o descartó
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ideas_corcho IS
  'Ideas del corcho compartido (D13–D15, S11–S12). Estados: propuesta / aprobada / descartada.';

CREATE INDEX IF NOT EXISTS idx_ideas_corcho_estado_created
  ON public.ideas_corcho (estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ideas_corcho_autor
  ON public.ideas_corcho (autor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_ideas_corcho()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_ideas_corcho ON public.ideas_corcho;
CREATE TRIGGER trg_set_updated_at_ideas_corcho
  BEFORE UPDATE ON public.ideas_corcho
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_ideas_corcho();

ALTER TABLE public.ideas_corcho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ideas_select ON public.ideas_corcho;
CREATE POLICY ideas_select ON public.ideas_corcho FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ideas_insert ON public.ideas_corcho;
CREATE POLICY ideas_insert ON public.ideas_corcho FOR INSERT TO authenticated
  WITH CHECK (autor_user_id = auth.uid() AND estado = 'propuesta');

DROP POLICY IF EXISTS ideas_update ON public.ideas_corcho;
-- Autor: edita solo mientras es 'propuesta'. Admin: todo (incluido el estado). S11.
CREATE POLICY ideas_update ON public.ideas_corcho FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR (autor_user_id = auth.uid() AND estado = 'propuesta'))
  WITH CHECK (public.es_admin_equipo() OR (autor_user_id = auth.uid() AND estado = 'propuesta'));

DROP POLICY IF EXISTS ideas_delete ON public.ideas_corcho;
CREATE POLICY ideas_delete ON public.ideas_corcho FOR DELETE TO authenticated
  USING (public.es_admin_equipo() OR (autor_user_id = auth.uid() AND estado = 'propuesta'));

-- Votos 👍 / 👎: uno por persona por idea; se puede cambiar o sacar.
CREATE TABLE IF NOT EXISTS public.ideas_corcho_votos (
  idea_id uuid NOT NULL REFERENCES public.ideas_corcho(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  valor smallint NOT NULL CHECK (valor IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);

COMMENT ON TABLE public.ideas_corcho_votos IS
  'Votos del corcho (1 = 👍, -1 = 👎). No se vota la idea propia (S11).';

CREATE INDEX IF NOT EXISTS idx_ideas_corcho_votos_idea
  ON public.ideas_corcho_votos (idea_id);

ALTER TABLE public.ideas_corcho_votos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS votos_select ON public.ideas_corcho_votos;
CREATE POLICY votos_select ON public.ideas_corcho_votos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS votos_write ON public.ideas_corcho_votos;
CREATE POLICY votos_write ON public.ideas_corcho_votos FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.ideas_corcho i
      WHERE i.id = idea_id AND i.autor_user_id = auth.uid()
    ));

-- Para el cartel "Nueva": qué ideas ya vio cada persona (D14).
CREATE TABLE IF NOT EXISTS public.ideas_corcho_vistas (
  idea_id uuid NOT NULL REFERENCES public.ideas_corcho(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  visto_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, user_id)
);

COMMENT ON TABLE public.ideas_corcho_vistas IS
  'Ideas del corcho ya vistas por cada persona (cartel Nueva, D14).';

ALTER TABLE public.ideas_corcho_vistas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vistas_own ON public.ideas_corcho_vistas;
CREATE POLICY vistas_own ON public.ideas_corcho_vistas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Realtime: votos e ideas nuevas sin recargar (como migration_programas_realtime.sql).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ideas_corcho'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas_corcho;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ideas_corcho_votos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas_corcho_votos;
  END IF;
END $$;
