-- Agregar posiciones para que las sticky notes de compañeros se puedan mover libremente
ALTER TABLE tareas_dashboard
ADD COLUMN IF NOT EXISTS pos_x INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pos_y INTEGER DEFAULT 0;

-- Política: el asignado puede actualizar (ej. posición) sus propias tareas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tareas_dashboard' AND policyname = 'Asignado puede actualizar sus tareas'
  ) THEN
    CREATE POLICY "Asignado puede actualizar sus tareas"
      ON tareas_dashboard FOR UPDATE
      USING (auth.uid() = asignado_a_user_id);
  END IF;
END $$;
