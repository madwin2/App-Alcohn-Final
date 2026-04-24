-- Nuevos tipos de ítems en la tabla sellos (retrocompatible)
ALTER TABLE sellos
ADD COLUMN IF NOT EXISTS item_type VARCHAR(32) NOT NULL DEFAULT 'SELLO',
ADD COLUMN IF NOT EXISTS item_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sellos
DROP CONSTRAINT IF EXISTS sellos_item_type_check;

ALTER TABLE sellos
ADD CONSTRAINT sellos_item_type_check
CHECK (item_type IN ('SELLO', 'ABECEDARIO', 'SOLDADOR', 'MANGO_GOLPE', 'BASE_REMACHADORA'));

CREATE INDEX IF NOT EXISTS idx_sellos_item_type ON sellos(item_type);

-- Backfill explícito para históricos
UPDATE sellos
SET item_type = 'SELLO'
WHERE item_type IS NULL;

-- Catálogo simple de productos para precios base y configuración
CREATE TABLE IF NOT EXISTS catalogo_items (
  code VARCHAR(32) PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  precio_base DECIMAL(10,2),
  precio_editable BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO catalogo_items (code, nombre, precio_base, precio_editable, activo)
VALUES
  ('SELLO', 'Sello', NULL, true, true),
  ('ABECEDARIO', 'Abecedario', NULL, true, true),
  ('SOLDADOR', 'Soldador Eléctrico', 75000, false, true),
  ('MANGO_GOLPE', 'Mango de Golpe', 25000, false, true),
  ('BASE_REMACHADORA', 'Base para Remachadora', 40000, false, true)
ON CONFLICT (code) DO UPDATE
SET
  nombre = EXCLUDED.nombre,
  precio_base = EXCLUDED.precio_base,
  precio_editable = EXCLUDED.precio_editable,
  activo = EXCLUDED.activo,
  updated_at = NOW();
