-- Calendario del equipo: feriados y ausencias (vacaciones / cambios de día).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere Etapa 1 aplicada: public.es_admin_equipo() y perfiles_equipo.

-- Feriados nacionales (importados) y días propios de la empresa (cargados por el admin).
CREATE TABLE IF NOT EXISTS public.feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  nombre text NOT NULL,
  origen text NOT NULL CHECK (origen IN ('nacional','empresa')),
  tipo text,                          -- el que venga de la fuente: inamovible / trasladable / puente...
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fecha, origen, nombre)
);

COMMENT ON TABLE public.feriados IS
  'Feriados nacionales (importados) y días propios de la empresa. Calendario del equipo (/perfil).';

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feriados_select ON public.feriados;
CREATE POLICY feriados_select ON public.feriados
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS feriados_admin_write ON public.feriados;
CREATE POLICY feriados_admin_write ON public.feriados
  FOR ALL TO authenticated
  USING (public.es_admin_equipo()) WITH CHECK (public.es_admin_equipo());

-- Vacaciones y cambios de día. Se cargan directo, sin aprobación (D6).
CREATE TABLE IF NOT EXISTS public.ausencias_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('vacaciones','cambio_dia')),
  -- vacaciones: rango [fecha_desde, fecha_hasta]. cambio_dia: el día que falta (desde = hasta).
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  -- cambio_dia: el día en que lo recupera (sábado u otro día). Opcional: ver Q-EQ-002 / D19c.
  fecha_recupero date,
  nota text,                          -- opcional, NUNCA obligatoria (D6)
  creado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde),
  CHECK (tipo = 'vacaciones' OR fecha_hasta = fecha_desde),
  CHECK (tipo = 'cambio_dia' OR fecha_recupero IS NULL)
);

COMMENT ON TABLE public.ausencias_equipo IS
  'Vacaciones y cambios de día del equipo. Sin aprobación. Visible para todo el equipo (D4).';

CREATE INDEX IF NOT EXISTS idx_ausencias_equipo_fechas
  ON public.ausencias_equipo (fecha_desde, fecha_hasta);
CREATE INDEX IF NOT EXISTS idx_ausencias_equipo_user
  ON public.ausencias_equipo (user_id, fecha_desde);

CREATE OR REPLACE FUNCTION public.set_updated_at_ausencias_equipo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_ausencias_equipo ON public.ausencias_equipo;
CREATE TRIGGER trg_set_updated_at_ausencias_equipo
  BEFORE UPDATE ON public.ausencias_equipo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_ausencias_equipo();

ALTER TABLE public.ausencias_equipo ENABLE ROW LEVEL SECURITY;

-- Todo el equipo ve el calendario (D4).
DROP POLICY IF EXISTS ausencias_select ON public.ausencias_equipo;
CREATE POLICY ausencias_select ON public.ausencias_equipo
  FOR SELECT TO authenticated USING (true);

-- Cada uno carga las suyas; el admin puede cargar por cualquiera.
DROP POLICY IF EXISTS ausencias_insert ON public.ausencias_equipo;
CREATE POLICY ausencias_insert ON public.ausencias_equipo
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.es_admin_equipo());

-- Editar/borrar: las propias y futuras (S5); el admin, cualquiera.
DROP POLICY IF EXISTS ausencias_update ON public.ausencias_equipo;
CREATE POLICY ausencias_update ON public.ausencias_equipo
  FOR UPDATE TO authenticated
  USING (
    public.es_admin_equipo()
    OR (
      user_id = auth.uid()
      AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    )
  )
  WITH CHECK (public.es_admin_equipo() OR user_id = auth.uid());

DROP POLICY IF EXISTS ausencias_delete ON public.ausencias_equipo;
CREATE POLICY ausencias_delete ON public.ausencias_equipo
  FOR DELETE TO authenticated
  USING (
    public.es_admin_equipo()
    OR (
      user_id = auth.uid()
      AND fecha_desde > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    )
  );
