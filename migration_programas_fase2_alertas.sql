-- Migración Fase 2 Programas: marcar programa dirty cuando cambia un sello ya asignado
-- (vector, medidas, planchuela, máquina, fecha límite, prioridad).
-- Ejecutar en Supabase SQL Editor (una vez). No modifica migration_programas_modulo.sql.

CREATE OR REPLACE FUNCTION mark_programa_dirty_on_sello_relevant_update() RETURNS trigger AS $$
BEGIN
  IF OLD.programa_id IS NOT NULL
     AND NEW.programa_id IS NOT NULL
     AND OLD.programa_id = NEW.programa_id THEN
    UPDATE programa
    SET
      dirty = true,
      estado_programa = CASE
        WHEN estado_programa = 'LISTO' THEN 'BORRADOR'
        ELSE estado_programa
      END,
      updated_at = now()
    WHERE id = NEW.programa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mark_programa_dirty_on_sello_relevant_update ON sellos;
CREATE TRIGGER trigger_mark_programa_dirty_on_sello_relevant_update
  BEFORE UPDATE OF
    archivo_vector_preview, archivo_base, ancho_real, largo_real,
    tipo, tipo_planchuela, maquina, fecha_limite, es_prioritario
  ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION mark_programa_dirty_on_sello_relevant_update();

COMMENT ON FUNCTION mark_programa_dirty_on_sello_relevant_update() IS
  'Marca programa.dirty cuando cambian campos relevantes de un sello que sigue en el mismo programa';
