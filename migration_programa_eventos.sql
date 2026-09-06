-- Historial de auditoría de programas + máquina derivada (sellos libres sin máquina).
-- Ejecutar en Supabase SQL Editor (una vez).

CREATE TABLE IF NOT EXISTS programa_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id uuid NOT NULL REFERENCES programa(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  detalle jsonb,
  usuario_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programa_eventos_tipo_check CHECK (
    tipo IN (
      'CREADO',
      'BLOQUEADO',
      'DESBLOQUEADO',
      'VERIFICADO',
      'DESVERIFICADO',
      'DESCARGADO',
      'ESTADO_CAMBIADO',
      'SELLO_AGREGADO',
      'SELLO_QUITADO'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_programa_eventos_programa
  ON programa_eventos (programa_id, created_at DESC);

ALTER TABLE programa_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "programa_eventos_select_authenticated" ON programa_eventos;
CREATE POLICY "programa_eventos_select_authenticated"
  ON programa_eventos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "programa_eventos_write_authenticated" ON programa_eventos;
CREATE POLICY "programa_eventos_write_authenticated"
  ON programa_eventos FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Un sello libre no tiene máquina asignada: se deriva al entrar a un programa.
UPDATE sellos
SET maquina = NULL
WHERE programa_id IS NULL
  AND maquina IS NOT NULL;
