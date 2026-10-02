-- Tareas semanales / recurrentes del equipo (solo definición; completar/posponer = futuro Inicio).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere Etapa 1 aplicada: public.es_admin_equipo().

CREATE TABLE IF NOT EXISTS public.tareas_recurrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,       -- de quién es la tarea
  creado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),   -- él mismo o el admin
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  descripcion text,
  frecuencia text NOT NULL CHECK (frecuencia IN ('diaria','semanal','quincenal','mensual')),
  dias_semana smallint[],      -- 1=lunes … 5=viernes (semanal/quincenal; puede ser más de un día)
  dia_mes smallint CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 31),   -- mensual
  semana_inicio date,          -- quincenal: un lunes de referencia para saber qué semanas tocan
  activa boolean NOT NULL DEFAULT true,     -- pausada = false
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (frecuencia <> 'semanal'   OR (dias_semana IS NOT NULL AND cardinality(dias_semana) > 0)),
  CHECK (frecuencia <> 'quincenal' OR (dias_semana IS NOT NULL AND semana_inicio IS NOT NULL)),
  CHECK (frecuencia <> 'mensual'   OR dia_mes IS NOT NULL)
);

COMMENT ON TABLE public.tareas_recurrentes IS
  'Definición de tareas recurrentes del equipo (diaria/semanal/quincenal/mensual). Completar va en el Inicio (futuro).';

CREATE INDEX IF NOT EXISTS idx_tareas_recurrentes_user
  ON public.tareas_recurrentes (user_id, orden);

CREATE OR REPLACE FUNCTION public.set_updated_at_tareas_recurrentes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_tareas_recurrentes ON public.tareas_recurrentes;
CREATE TRIGGER trg_set_updated_at_tareas_recurrentes
  BEFORE UPDATE ON public.tareas_recurrentes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_tareas_recurrentes();

ALTER TABLE public.tareas_recurrentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tr_select ON public.tareas_recurrentes;
CREATE POLICY tr_select ON public.tareas_recurrentes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.es_admin_equipo());

DROP POLICY IF EXISTS tr_insert ON public.tareas_recurrentes;
CREATE POLICY tr_insert ON public.tareas_recurrentes FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid() AND (user_id = auth.uid() OR public.es_admin_equipo()));

-- Dueño de la tarea (user_id): edita, pausa y borra las suyas, las haya creado él o el admin.
DROP POLICY IF EXISTS tr_update ON public.tareas_recurrentes;
CREATE POLICY tr_update ON public.tareas_recurrentes FOR UPDATE TO authenticated
  USING (public.es_admin_equipo() OR user_id = auth.uid())
  WITH CHECK (public.es_admin_equipo() OR user_id = auth.uid());

DROP POLICY IF EXISTS tr_delete ON public.tareas_recurrentes;
CREATE POLICY tr_delete ON public.tareas_recurrentes FOR DELETE TO authenticated
  USING (public.es_admin_equipo() OR user_id = auth.uid());

-- Pausar/reactivar vía RPC (alternativa a UPDATE; mismo permiso: dueño o admin).
CREATE OR REPLACE FUNCTION public.pausar_tarea_recurrente(p_id uuid, p_activa boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.tareas_recurrentes
  WHERE id = p_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'tarea no encontrada';
  END IF;

  IF v_user_id <> auth.uid() AND NOT public.es_admin_equipo() THEN
    RAISE EXCEPTION 'sin permiso para pausar esta tarea';
  END IF;

  UPDATE public.tareas_recurrentes
  SET activa = p_activa, updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pausar_tarea_recurrente(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pausar_tarea_recurrente(uuid, boolean) TO authenticated;
