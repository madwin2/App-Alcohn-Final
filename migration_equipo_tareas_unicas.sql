-- Tareas de un solo día (frecuencia `unica`) en tareas_recurrentes.
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- La fecha concreta se guarda en `semana_inicio` (mismo campo que el lunes de referencia quincenal).

ALTER TABLE public.tareas_recurrentes
  DROP CONSTRAINT IF EXISTS tareas_recurrentes_frecuencia_check;

ALTER TABLE public.tareas_recurrentes
  ADD CONSTRAINT tareas_recurrentes_frecuencia_check
  CHECK (frecuencia IN ('diaria', 'semanal', 'quincenal', 'mensual', 'unica'));

ALTER TABLE public.tareas_recurrentes
  DROP CONSTRAINT IF EXISTS tareas_recurrentes_unica_fecha;

ALTER TABLE public.tareas_recurrentes
  ADD CONSTRAINT tareas_recurrentes_unica_fecha
  CHECK (frecuencia <> 'unica' OR semana_inicio IS NOT NULL);

COMMENT ON COLUMN public.tareas_recurrentes.semana_inicio IS
  'Quincenal: lunes de referencia. Única: fecha concreta del único día (YYYY-MM-DD).';

COMMENT ON TABLE public.tareas_recurrentes IS
  'Definición de tareas del equipo: diaria/semanal/quincenal/mensual/unica (un solo día). Completar va en el Inicio (futuro).';
