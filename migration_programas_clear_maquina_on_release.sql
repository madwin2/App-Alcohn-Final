-- Al salir de un programa (programa_id → NULL), limpiar máquina del sello.
-- Así, borrar un programa C/G/XL no deja la máquina colgada en Producción.
-- Ejecutar en Supabase SQL Editor (una vez).

CREATE OR REPLACE FUNCTION clear_maquina_when_sello_leaves_programa()
RETURNS trigger AS $$
BEGIN
  IF NEW.programa_id IS NULL AND OLD.programa_id IS NOT NULL THEN
    NEW.maquina := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clear_maquina_when_sello_leaves_programa ON sellos;
CREATE TRIGGER trigger_clear_maquina_when_sello_leaves_programa
  BEFORE UPDATE OF programa_id ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION clear_maquina_when_sello_leaves_programa();

-- Red de seguridad al borrar el programa (por si queda algún sello vinculado).
CREATE OR REPLACE FUNCTION clear_sellos_maquina_before_programa_delete()
RETURNS trigger AS $$
BEGIN
  UPDATE sellos
  SET
    maquina = NULL,
    updated_at = now()
  WHERE programa_id = OLD.id
    AND maquina IS NOT NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clear_sellos_maquina_before_programa_delete ON programa;
CREATE TRIGGER trigger_clear_sellos_maquina_before_programa_delete
  BEFORE DELETE ON programa
  FOR EACH ROW
  EXECUTE FUNCTION clear_sellos_maquina_before_programa_delete();

-- Datos huérfanos: sello libre con máquina todavía asignada
UPDATE sellos
SET maquina = NULL,
    updated_at = now()
WHERE programa_id IS NULL
  AND maquina IS NOT NULL;
