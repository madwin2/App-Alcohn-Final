-- Aspire verificado por programa: archivo .crv3d chequeado + estado verificado/bloqueado.
-- Ejecutar en Supabase SQL Editor (una vez).

ALTER TABLE programa
  ADD COLUMN IF NOT EXISTS archivo_aspire_url text,
  ADD COLUMN IF NOT EXISTS archivo_aspire_nombre text,
  ADD COLUMN IF NOT EXISTS archivo_aspire_subido_at timestamptz;

COMMENT ON COLUMN programa.archivo_aspire_url IS
  'URL del .crv3d Aspire ya chequeado/verificado subido al programa';
COMMENT ON COLUMN programa.archivo_aspire_nombre IS
  'Nombre original del archivo Aspire verificado';
COMMENT ON COLUMN programa.archivo_aspire_subido_at IS
  'Cuándo se subió el Aspire verificado';

-- Permitir evento de auditoría
ALTER TABLE programa_eventos DROP CONSTRAINT IF EXISTS programa_eventos_tipo_check;
ALTER TABLE programa_eventos
  ADD CONSTRAINT programa_eventos_tipo_check CHECK (
    tipo IN (
      'CREADO',
      'BLOQUEADO',
      'DESBLOQUEADO',
      'VERIFICADO',
      'DESVERIFICADO',
      'DESCARGADO',
      'ESTADO_CAMBIADO',
      'SELLO_AGREGADO',
      'SELLO_QUITADO',
      'ASPIRE_SUBIDO'
    )
  );

-- Bucket Storage para Aspire verificados
INSERT INTO storage.buckets (id, name, public)
VALUES ('programas-aspire', 'programas-aspire', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "programas_aspire_public_read" ON storage.objects;
CREATE POLICY "programas_aspire_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'programas-aspire');

DROP POLICY IF EXISTS "programas_aspire_auth_write" ON storage.objects;
CREATE POLICY "programas_aspire_auth_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'programas-aspire')
  WITH CHECK (bucket_id = 'programas-aspire');
