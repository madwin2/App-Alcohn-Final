-- Migración: Agregar columna es_prioritario a la tabla sellos
-- Esta columna separa la prioridad del estado de fabricación

-- Agregar columna es_prioritario a la tabla sellos
ALTER TABLE sellos 
ADD COLUMN IF NOT EXISTS es_prioritario BOOLEAN NOT NULL DEFAULT FALSE;

-- Comentario para documentar el campo
COMMENT ON COLUMN sellos.es_prioritario IS 'Indica si el sello es prioritario (independiente del estado de fabricación)';

-- Crear índice para búsquedas rápidas de sellos prioritarios
CREATE INDEX IF NOT EXISTS idx_sellos_es_prioritario ON sellos(es_prioritario);

-- Migrar datos existentes: si estado_fabricacion es 'Prioridad', marcar es_prioritario como true
-- y cambiar estado_fabricacion a 'Sin Hacer' para separar los conceptos
UPDATE sellos 
SET es_prioritario = TRUE,
    estado_fabricacion = 'Sin Hacer'
WHERE estado_fabricacion = 'Prioridad';




