-- Crecimiento (objetivos / quiero aprender) y Feedback del admin (Mi perfil, Etapa 5).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere Etapa 1 aplicada: public.es_admin_equipo().

CREATE TABLE IF NOT EXISTS public.objetivos_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('objetivo','aprender')),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','logrado','abandonado')),
  fecha_objetivo date,
  logrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.objetivos_personales IS
  'Objetivos personales y “quiero aprender” (S9: ve la persona y el admin; solo la persona edita).';

CREATE INDEX IF NOT EXISTS idx_objetivos_personales_user
  ON public.objetivos_personales (user_id, tipo, estado, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_objetivos_personales()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_objetivos_personales ON public.objetivos_personales;
CREATE TRIGGER trg_set_updated_at_objetivos_personales
  BEFORE UPDATE ON public.objetivos_personales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_objetivos_personales();

ALTER TABLE public.objetivos_personales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obj_select ON public.objetivos_personales;
CREATE POLICY obj_select ON public.objetivos_personales FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin_equipo());

DROP POLICY IF EXISTS obj_write ON public.objetivos_personales;
-- Solo la persona escribe (S9). FOR ALL acá = INSERT/UPDATE/DELETE (+ SELECT propia).
CREATE POLICY obj_write ON public.objetivos_personales FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.feedback_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  para_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  tipo text NOT NULL CHECK (tipo IN ('felicitacion','mejora','correccion')),
  titulo text,
  texto text NOT NULL CHECK (length(trim(texto)) > 0),   -- markdown
  leido_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feedback_equipo IS
  'Feedback del admin al integrante (S10: escribe solo admin; ven admin y destinatario; sin hilo de respuestas).';

CREATE INDEX IF NOT EXISTS idx_feedback_equipo_para
  ON public.feedback_equipo (para_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_feedback_equipo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_feedback_equipo ON public.feedback_equipo;
CREATE TRIGGER trg_set_updated_at_feedback_equipo
  BEFORE UPDATE ON public.feedback_equipo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_feedback_equipo();

ALTER TABLE public.feedback_equipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fb_select ON public.feedback_equipo;
CREATE POLICY fb_select ON public.feedback_equipo FOR SELECT TO authenticated
  USING (para_user_id = auth.uid() OR public.es_admin_equipo());

DROP POLICY IF EXISTS fb_admin_write ON public.feedback_equipo;
CREATE POLICY fb_admin_write ON public.feedback_equipo FOR ALL TO authenticated
  USING (public.es_admin_equipo())
  WITH CHECK (public.es_admin_equipo() AND autor_user_id = auth.uid());

-- Destinatario marca leído sin poder editar el texto (S10).
CREATE OR REPLACE FUNCTION public.marcar_feedback_leido(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_para uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  SELECT para_user_id INTO v_para
  FROM public.feedback_equipo
  WHERE id = p_id;

  IF v_para IS NULL THEN
    RAISE EXCEPTION 'feedback no encontrado';
  END IF;

  IF v_para <> auth.uid() THEN
    RAISE EXCEPTION 'sin permiso para marcar este feedback';
  END IF;

  UPDATE public.feedback_equipo
  SET leido_at = COALESCE(leido_at, now()), updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_feedback_leido(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_feedback_leido(uuid) TO authenticated;
