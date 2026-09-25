-- Fix: programa_sync_token RLS was enabled without policies; the frontend creates tokens
-- when generating the ZIP package (authenticated user).

DROP POLICY IF EXISTS "programa_sync_token_select_authenticated" ON programa_sync_token;
CREATE POLICY "programa_sync_token_select_authenticated"
  ON programa_sync_token FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "programa_sync_token_insert_authenticated" ON programa_sync_token;
CREATE POLICY "programa_sync_token_insert_authenticated"
  ON programa_sync_token FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "programa_sync_token_update_authenticated" ON programa_sync_token;
CREATE POLICY "programa_sync_token_update_authenticated"
  ON programa_sync_token FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE programa_sync_token IS
  'Token por programa para que el gadget reporte sincronización (creado al descargar el ZIP).';
