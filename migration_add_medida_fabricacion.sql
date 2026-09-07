-- Migración: medida de fabricación confirmada por SVG (distinta de ancho_real/largo_real,
-- que es la medida PEDIDA). Ver ANALISIS_MEDIDA_REAL_SELLOS.md.
-- Ejecutar en Supabase SQL Editor (una vez).

ALTER TABLE sellos ADD COLUMN IF NOT EXISTS ancho_fabricacion_mm DECIMAL(6,2);
ALTER TABLE sellos ADD COLUMN IF NOT EXISTS largo_fabricacion_mm DECIMAL(6,2);

COMMENT ON COLUMN sellos.ancho_fabricacion_mm IS
  'Ancho real al que se corta el bronce, en MM (a diferencia de ancho_real que es la medida pedida, en CM). Se carga confirmando/editando la sugerencia del popup al subir el SVG. NULL = todavía no confirmado, se sigue usando ancho_real como fallback.';
COMMENT ON COLUMN sellos.largo_fabricacion_mm IS
  'Largo real al que se corta el bronce, en MM (a diferencia de largo_real que es la medida pedida, en CM). Se carga confirmando/editando la sugerencia del popup al subir el SVG. NULL = todavía no confirmado, se sigue usando largo_real como fallback.';

-- Extender el trigger de "programa dirty" (migration_programas_fase2_alertas.sql) para que
-- confirmar/editar la medida de fabricación de un sello ya programado marque el programa como
-- dirty, igual que ya pasa hoy con ancho_real/largo_real.
DROP TRIGGER IF EXISTS trigger_mark_programa_dirty_on_sello_relevant_update ON sellos;
CREATE TRIGGER trigger_mark_programa_dirty_on_sello_relevant_update
  BEFORE UPDATE OF
    archivo_vector_preview, archivo_base, ancho_real, largo_real,
    ancho_fabricacion_mm, largo_fabricacion_mm,
    tipo, tipo_planchuela, maquina, fecha_limite, es_prioritario
  ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION mark_programa_dirty_on_sello_relevant_update();
