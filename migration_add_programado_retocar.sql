-- Migración para agregar 'Retocar' y 'Programado' al CHECK constraint de estado_fabricacion
-- y crear trigger para detectar automáticamente 'Programado'

-- 0. Agregar columna estado_aspire si no existe
ALTER TABLE sellos 
ADD COLUMN IF NOT EXISTS estado_aspire VARCHAR(20) CHECK (estado_aspire IN ('Aspire G', 'Aspire G Check', 'Aspire C', 'Aspire C Check', 'Aspire XL'));

-- 1. Agregar 'Programado' al CHECK constraint de estado_fabricacion en sellos
ALTER TABLE sellos 
DROP CONSTRAINT IF EXISTS sellos_estado_fabricacion_check;

ALTER TABLE sellos
ADD CONSTRAINT sellos_estado_fabricacion_check 
CHECK (estado_fabricacion IN ('Sin Hacer', 'Haciendo', 'Hecho', 'Rehacer', 'Retocar', 'Prioridad', 'Verificar', 'Programado'));

-- 2. Agregar 'Programado' al CHECK constraint de estado_fabricacion en programa (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'programa_estado_fabricacion_check'
  ) THEN
    ALTER TABLE programa 
    DROP CONSTRAINT programa_estado_fabricacion_check;
    
    ALTER TABLE programa
    ADD CONSTRAINT programa_estado_fabricacion_check 
    CHECK (estado_fabricacion IN ('Sin Hacer', 'Haciendo', 'Hecho', 'Rehacer', 'Retocar', 'Prioridad', 'Verificar', 'Programado'));
  END IF;
END $$;

-- 3. Crear función para detectar automáticamente 'Programado'
CREATE OR REPLACE FUNCTION detect_programado_state()
RETURNS TRIGGER AS $$
DECLARE
  current_fabricacion VARCHAR(20);
BEGIN
  -- Solo procesar si estado_aspire tiene un valor
  IF NEW.estado_aspire IS NOT NULL AND NEW.estado_aspire != '' THEN
    -- Determinar el estado de fabricación actual
    -- En INSERT, OLD no existe, así que usar NEW o NULL
    -- En UPDATE, si estado_fabricacion fue cambiado explícitamente, usar NEW, sino usar OLD
    IF TG_OP = 'INSERT' THEN
      current_fabricacion := COALESCE(NEW.estado_fabricacion, 'Sin Hacer');
    ELSE
      -- UPDATE
      IF NEW.estado_fabricacion IS DISTINCT FROM OLD.estado_fabricacion THEN
        -- Fue cambiado explícitamente
        current_fabricacion := NEW.estado_fabricacion;
      ELSE
        -- No fue cambiado, usar el valor anterior
        current_fabricacion := COALESCE(OLD.estado_fabricacion, 'Sin Hacer');
      END IF;
    END IF;
    
    -- Si el estado actual es 'Sin Hacer' o 'Rehacer', establecer 'Programado'
    -- Solo si no se está estableciendo explícitamente otro estado diferente
    IF current_fabricacion IN ('Sin Hacer', 'Rehacer') THEN
      -- Solo establecer Programado si no se está cambiando explícitamente a otro estado
      IF TG_OP = 'INSERT' OR NEW.estado_fabricacion IS NULL OR NEW.estado_fabricacion = OLD.estado_fabricacion THEN
        NEW.estado_fabricacion := 'Programado';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Crear trigger que se ejecuta antes de INSERT o UPDATE
DROP TRIGGER IF EXISTS trigger_detect_programado ON sellos;
CREATE TRIGGER trigger_detect_programado
  BEFORE INSERT OR UPDATE OF estado_aspire, estado_fabricacion ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION detect_programado_state();

