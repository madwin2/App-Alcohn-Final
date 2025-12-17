-- Migración: Agregar campo taken_by a la tabla ordenes
-- Este campo almacenará el ID del usuario que creó/subió el pedido

-- Agregar columna taken_by a la tabla ordenes
ALTER TABLE ordenes 
ADD COLUMN IF NOT EXISTS taken_by UUID REFERENCES auth.users(id);

-- Crear índice para mejorar las consultas de filtrado
CREATE INDEX IF NOT EXISTS idx_ordenes_taken_by ON ordenes(taken_by);

-- Comentario en la columna
COMMENT ON COLUMN ordenes.taken_by IS 'ID del usuario que creó/subió el pedido';






