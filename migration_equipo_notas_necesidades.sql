-- Anotaciones privadas y pedidos "Lo que necesito" (Mi perfil, Etapa 4).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere Etapa 1 aplicada: public.es_admin_equipo().

CREATE TABLE IF NOT EXISTS public.notas_personales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT '',
  contenido text NOT NULL DEFAULT '',     -- markdown
  fijada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notas_personales IS
  'Anotaciones privadas del integrante (D3: solo las ve quien las escribe; ni el admin).';

CREATE INDEX IF NOT EXISTS idx_notas_personales_user
  ON public.notas_personales (user_id, fijada DESC, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_notas_personales()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_notas_personales ON public.notas_personales;
CREATE TRIGGER trg_set_updated_at_notas_personales
  BEFORE UPDATE ON public.notas_personales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_notas_personales();

ALTER TABLE public.notas_personales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notas_personales_own ON public.notas_personales;
-- Privadas de verdad (D3): solo el dueño de la nota. El admin NO tiene política.
CREATE POLICY notas_personales_own ON public.notas_personales FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.necesidades_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (length(trim(texto)) > 0),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','resuelta')),
  respuesta_admin text,
  resuelta_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.necesidades_equipo IS
  'Pedidos puntuales del integrante (herramienta, insumo, etc.). Los ve la persona y el admin (S8).';

CREATE INDEX IF NOT EXISTS idx_necesidades_equipo_estado
  ON public.necesidades_equipo (estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_necesidades_equipo_user
  ON public.necesidades_equipo (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_necesidades_equipo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_necesidades_equipo ON public.necesidades_equipo;
CREATE TRIGGER trg_set_updated_at_necesidades_equipo
  BEFORE UPDATE ON public.necesidades_equipo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_necesidades_equipo();

ALTER TABLE public.necesidades_equipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nec_select ON public.necesidades_equipo;
CREATE POLICY nec_select ON public.necesidades_equipo FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin_equipo());

DROP POLICY IF EXISTS nec_insert ON public.necesidades_equipo;
CREATE POLICY nec_insert ON public.necesidades_equipo FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS nec_update ON public.necesidades_equipo;
CREATE POLICY nec_update ON public.necesidades_equipo FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR (user_id = auth.uid() AND estado = 'pendiente'))
  WITH CHECK (public.es_admin_equipo() OR (user_id = auth.uid() AND estado = 'pendiente'));

DROP POLICY IF EXISTS nec_delete ON public.necesidades_equipo;
CREATE POLICY nec_delete ON public.necesidades_equipo FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND estado = 'pendiente');
