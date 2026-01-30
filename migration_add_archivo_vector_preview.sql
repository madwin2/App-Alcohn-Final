-- Migración: Agregar columnas para vector (preview y estado de vectorización) en sellos
-- Necesarias para previsualizar y descargar el vector en la página de producción

-- Columna con la URL del preview (PNG/SVG) del archivo vector (EPS)
ALTER TABLE sellos 
ADD COLUMN IF NOT EXISTS archivo_vector_preview TEXT;

COMMENT ON COLUMN sellos.archivo_vector_preview IS 'URL del preview del archivo vector (generado desde EPS) para previsualización';

-- Estado de vectorización: BASE, VECTORIZADO, DESCARGADO, EN_PROCESO
ALTER TABLE sellos 
ADD COLUMN IF NOT EXISTS estado_vectorizacion VARCHAR(20) DEFAULT 'BASE';

COMMENT ON COLUMN sellos.estado_vectorizacion IS 'Estado del proceso de vectorización del sello';

-- Añadir CHECK si la columna se acaba de crear (opcional, evita valores inválidos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sellos_estado_vectorizacion_check'
  ) THEN
    ALTER TABLE sellos ADD CONSTRAINT sellos_estado_vectorizacion_check
    CHECK (estado_vectorizacion IN ('BASE', 'VECTORIZADO', 'DESCARGADO', 'EN_PROCESO'));
  END IF;
END $$;

-- Valor por defecto para filas existentes
UPDATE sellos 
SET estado_vectorizacion = 'BASE' 
WHERE estado_vectorizacion IS NULL;
