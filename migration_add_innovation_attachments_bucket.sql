-- Bucket dedicado para adjuntos del modulo Innovacion & Desarrollo.
-- Ejecutar en Supabase SQL Editor (una vez).

insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do nothing;

-- Lectura publica de adjuntos (URLs publicas).
drop policy if exists "adjuntos_public_read" on storage.objects;
create policy "adjuntos_public_read"
on storage.objects for select
using (bucket_id = 'adjuntos');

-- Subida por usuarios autenticados al bucket adjuntos.
drop policy if exists "adjuntos_auth_insert" on storage.objects;
create policy "adjuntos_auth_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'adjuntos'
  and auth.uid() = owner
);

-- Actualizacion y borrado solo por owner autenticado.
drop policy if exists "adjuntos_owner_update" on storage.objects;
create policy "adjuntos_owner_update"
on storage.objects for update
to authenticated
using (bucket_id = 'adjuntos' and auth.uid() = owner)
with check (bucket_id = 'adjuntos' and auth.uid() = owner);

drop policy if exists "adjuntos_owner_delete" on storage.objects;
create policy "adjuntos_owner_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'adjuntos' and auth.uid() = owner);
