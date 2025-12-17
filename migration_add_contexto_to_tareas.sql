-- Agregar campo contexto a la tabla tareas para distinguir entre tareas de pedidos y producción
ALTER TABLE tareas 
ADD COLUMN IF NOT EXISTS contexto VARCHAR(20) DEFAULT 'PEDIDOS' CHECK (contexto IN ('PEDIDOS', 'PRODUCCION'));

-- Crear índice para mejorar las consultas filtradas por contexto
CREATE INDEX IF NOT EXISTS idx_tareas_contexto ON tareas(contexto);

-- Comentario explicativo
COMMENT ON COLUMN tareas.contexto IS 'Contexto de la tarea: PEDIDOS para tareas creadas en la página de pedidos, PRODUCCION para tareas creadas en la página de producción';






