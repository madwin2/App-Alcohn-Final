-- Permite a usuarios autenticados de la app leer logos/mockups subidos desde la web.
-- Sin esto, las URLs firmadas expiran y la app no puede descargar desde logos-web / mockups-web.

drop policy if exists "logos_web_auth_read" on storage.objects;
create policy "logos_web_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'logos-web');

drop policy if exists "mockups_web_auth_read" on storage.objects;
create policy "mockups_web_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'mockups-web');
