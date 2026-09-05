-- Migración: módulo Programas (ciclo de vida, bloqueo, material, sync nombre)
-- Ejecutar en Supabase SQL Editor (una vez).

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en programa
-- ---------------------------------------------------------------------------
ALTER TABLE programa
  ADD COLUMN IF NOT EXISTS bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueado_at timestamptz,
  ADD COLUMN IF NOT EXISTS bloqueado_por uuid,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS archivo_zip_url text,
  ADD COLUMN IF NOT EXISTS archivo_zip_generado_at timestamptz,
  ADD COLUMN IF NOT EXISTS dirty boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado_programa varchar(20) NOT NULL DEFAULT 'BORRADOR';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programa_estado_programa_check'
  ) THEN
    ALTER TABLE programa
      ADD CONSTRAINT programa_estado_programa_check
      CHECK (estado_programa IN ('BORRADOR', 'LISTO', 'BLOQUEADO', 'EN_FABRICACION', 'FINALIZADO'));
  END IF;
END $$;

COMMENT ON COLUMN programa.bloqueado IS 'Candado manual / post-descarga: no agregar/quitar sellos ni borrar sin desbloquear';
COMMENT ON COLUMN programa.dirty IS 'true = hubo cambios desde el último ZIP generado';
COMMENT ON COLUMN programa.estado_programa IS 'Ciclo de vida del programa (BORRADOR/LISTO/BLOQUEADO/EN_FABRICACION/FINALIZADO)';

-- ---------------------------------------------------------------------------
-- 2. Columnas nuevas en sellos
-- ---------------------------------------------------------------------------
ALTER TABLE sellos
  ADD COLUMN IF NOT EXISTS estado_fabricacion_previo varchar(20),
  ADD COLUMN IF NOT EXISTS programa_nombre text,
  ADD COLUMN IF NOT EXISTS es_prioritario boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sellos.estado_fabricacion_previo IS
  'Snapshot de estado_fabricacion al agregar el sello a un programa; se ofrece al quitarlo';
COMMENT ON COLUMN sellos.programa_nombre IS
  'Cache de lectura del nombre del programa (sincronizado por trigger vía programa_id)';

-- ---------------------------------------------------------------------------
-- 3. Archivos base Aspire por máquina (C/G/XL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programa_archivos_base (
  maquina varchar(4) PRIMARY KEY CHECK (maquina IN ('C', 'G', 'XL')),
  archivo_base_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE programa_archivos_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programa_archivos_base_select_authenticated" ON programa_archivos_base;
CREATE POLICY "programa_archivos_base_select_authenticated"
  ON programa_archivos_base FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "programa_archivos_base_write_authenticated" ON programa_archivos_base;
CREATE POLICY "programa_archivos_base_write_authenticated"
  ON programa_archivos_base FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Límites de largo de planchuela en fabricacion_parametros (última fila)
-- ---------------------------------------------------------------------------
UPDATE fabricacion_parametros
SET params = COALESCE(params, '{}'::jsonb)
  || jsonb_build_object(
    'largoMaximoPlanchuelaMm_C', 400,
    'largoMaximoPlanchuelaMm_G', 250,
    'largoMaximoPlanchuelaMm_XL', 250
  )
WHERE id = (
  SELECT id FROM fabricacion_parametros
  ORDER BY effective_from DESC
  LIMIT 1
);

-- ---------------------------------------------------------------------------
-- 5. Trigger: sync programa_nombre desde programa_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_programa_nombre() RETURNS trigger AS $$
BEGIN
  IF NEW.programa_id IS NULL THEN
    NEW.programa_nombre := NULL;
  ELSE
    SELECT nombre INTO NEW.programa_nombre FROM programa WHERE id = NEW.programa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_programa_nombre ON sellos;
CREATE TRIGGER trigger_sync_programa_nombre
  BEFORE INSERT OR UPDATE OF programa_id ON sellos
  FOR EACH ROW EXECUTE FUNCTION sync_programa_nombre();

-- Si se renombra un programa, actualizar cache en sellos
CREATE OR REPLACE FUNCTION sync_programa_nombre_on_rename() RETURNS trigger AS $$
BEGIN
  IF NEW.nombre IS DISTINCT FROM OLD.nombre THEN
    UPDATE sellos
    SET programa_nombre = NEW.nombre
    WHERE programa_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_programa_nombre_on_rename ON programa;
CREATE TRIGGER trigger_sync_programa_nombre_on_rename
  AFTER UPDATE OF nombre ON programa
  FOR EACH ROW EXECUTE FUNCTION sync_programa_nombre_on_rename();

-- ---------------------------------------------------------------------------
-- 6. Al borrar un sello asignado: marcar programa dirty / alerta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_programa_dirty_on_sello_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.programa_id IS NOT NULL THEN
    UPDATE programa
    SET
      dirty = true,
      estado_programa = CASE
        WHEN estado_programa = 'LISTO' THEN 'BORRADOR'
        ELSE estado_programa
      END,
      updated_at = now()
    WHERE id = OLD.programa_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mark_programa_dirty_on_sello_delete ON sellos;
CREATE TRIGGER trigger_mark_programa_dirty_on_sello_delete
  BEFORE DELETE ON sellos
  FOR EACH ROW EXECUTE FUNCTION mark_programa_dirty_on_sello_delete();

-- ---------------------------------------------------------------------------
-- 7. Bucket Storage para ZIPs de programas
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('programas-zip', 'programas-zip', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "programas_zip_public_read" ON storage.objects;
CREATE POLICY "programas_zip_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'programas-zip');

DROP POLICY IF EXISTS "programas_zip_auth_insert" ON storage.objects;
CREATE POLICY "programas_zip_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'programas-zip');

DROP POLICY IF EXISTS "programas_zip_auth_update" ON storage.objects;
CREATE POLICY "programas_zip_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'programas-zip')
  WITH CHECK (bucket_id = 'programas-zip');

DROP POLICY IF EXISTS "programas_zip_auth_delete" ON storage.objects;
CREATE POLICY "programas_zip_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'programas-zip');

-- Bucket para .crv3d base (opcional; también se puede usar URL externa en programa_archivos_base)
INSERT INTO storage.buckets (id, name, public)
VALUES ('programas-base', 'programas-base', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "programas_base_public_read" ON storage.objects;
CREATE POLICY "programas_base_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'programas-base');

DROP POLICY IF EXISTS "programas_base_auth_write" ON storage.objects;
CREATE POLICY "programas_base_auth_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'programas-base')
  WITH CHECK (bucket_id = 'programas-base');
