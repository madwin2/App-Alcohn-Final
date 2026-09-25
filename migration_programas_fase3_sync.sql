-- ---------------------------------------------------------------------------
-- 1. Reporte de sincronización por programa
-- ---------------------------------------------------------------------------
ALTER TABLE programa
  ADD COLUMN IF NOT EXISTS sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_origen text
    CHECK (sync_origen IN ('GADGET', 'ARCHIVO_SUBIDO')),
  ADD COLUMN IF NOT EXISTS sync_payload jsonb,
  ADD COLUMN IF NOT EXISTS maquinado_minutos numeric(10,2),
  ADD COLUMN IF NOT EXISTS material_real_por_planchuela jsonb,
  ADD COLUMN IF NOT EXISTS preview_url text;

COMMENT ON COLUMN programa.sync_payload IS
  'Último reporte crudo recibido del gadget o parseado del .crv3d (auditoría)';
COMMENT ON COLUMN programa.material_real_por_planchuela IS
  'Largo realmente usado por ancho de planchuela, medido del archivo. El estimado se calcula en material.ts';
COMMENT ON COLUMN programa.preview_url IS
  'Miniatura 2D extraída del .crv3d (stream PreviewData/Preview2D_GIF)';

-- ---------------------------------------------------------------------------
-- 2. Token de sincronización por programa (auth del gadget)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programa_sync_token (
  programa_id uuid PRIMARY KEY REFERENCES programa(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programa_sync_token_token
  ON programa_sync_token (token);

ALTER TABLE programa_sync_token ENABLE ROW LEVEL SECURITY;
-- Sin policy para authenticated: solo la Edge Function (service role) lo lee.

-- ---------------------------------------------------------------------------
-- 3. Archivos de trayectorias subidos por el gadget
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programa_trayectorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES programa(id) ON DELETE CASCADE,
  version integer NOT NULL,
  nombre_archivo text NOT NULL,
  url text NOT NULL,
  bytes integer,
  subido_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programa_id, version, nombre_archivo)
);

CREATE INDEX IF NOT EXISTS idx_programa_trayectorias_programa
  ON programa_trayectorias (programa_id, version DESC);

ALTER TABLE programa_trayectorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programa_trayectorias_select_authenticated" ON programa_trayectorias;
CREATE POLICY "programa_trayectorias_select_authenticated"
  ON programa_trayectorias FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 4. Motivo por el que un sello salió de un programa
-- ---------------------------------------------------------------------------
ALTER TABLE sellos
  ADD COLUMN IF NOT EXISTS motivo_salida_programa text;

COMMENT ON COLUMN sellos.motivo_salida_programa IS
  'Por qué salió del último programa: SIN_MATERIAL | ERROR_IMPORT | DECISION_OPERARIO | NULL';

-- ---------------------------------------------------------------------------
-- 5. Tipos de evento nuevos
-- ---------------------------------------------------------------------------
ALTER TABLE programa_eventos DROP CONSTRAINT IF EXISTS programa_eventos_tipo_check;
ALTER TABLE programa_eventos
  ADD CONSTRAINT programa_eventos_tipo_check CHECK (
    tipo IN (
      'CREADO', 'BLOQUEADO', 'DESBLOQUEADO', 'VERIFICADO', 'DESVERIFICADO',
      'DESCARGADO', 'ESTADO_CAMBIADO', 'SELLO_AGREGADO', 'SELLO_QUITADO',
      'ASPIRE_SUBIDO',
      'SINCRONIZADO',            -- llegó un reporte (gadget o archivo)
      'SELLO_NO_IMPORTADO',      -- el gadget no pudo importarlo
      'SELLO_BORRADO_EN_MAQUINA',-- el operario lo sacó del Aspire
      'TRAYECTORIAS_SUBIDAS'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Buckets de Storage
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('programas-trayectorias', 'programas-trayectorias', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "programas_trayectorias_auth_read" ON storage.objects;
CREATE POLICY "programas_trayectorias_auth_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'programas-trayectorias');

INSERT INTO storage.buckets (id, name, public)
VALUES ('programas-preview', 'programas-preview', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "programas_preview_public_read" ON storage.objects;
CREATE POLICY "programas_preview_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'programas-preview');

DROP POLICY IF EXISTS "programas_preview_auth_write" ON storage.objects;
CREATE POLICY "programas_preview_auth_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'programas-preview')
  WITH CHECK (bucket_id = 'programas-preview');
