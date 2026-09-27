-- Signed upload desde el gadget Aspire (curl anónimo con token de createSignedUploadUrl).
-- Supabase exige policy INSERT en storage.objects aunque la URL esté firmada.
-- Sin esto el PUT a /object/upload/sign/... responde 400.

DROP POLICY IF EXISTS "programas_aspire_anon_insert" ON storage.objects;
CREATE POLICY "programas_aspire_anon_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'programas-aspire');

DROP POLICY IF EXISTS "programas_aspire_anon_update" ON storage.objects;
CREATE POLICY "programas_aspire_anon_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'programas-aspire')
  WITH CHECK (bucket_id = 'programas-aspire');

DROP POLICY IF EXISTS "programas_preview_anon_insert" ON storage.objects;
CREATE POLICY "programas_preview_anon_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'programas-preview');

DROP POLICY IF EXISTS "programas_preview_anon_update" ON storage.objects;
CREATE POLICY "programas_preview_anon_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'programas-preview')
  WITH CHECK (bucket_id = 'programas-preview');
