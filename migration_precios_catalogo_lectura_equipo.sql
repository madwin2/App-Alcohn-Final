-- Lectura del catálogo de precios (filas del dueño) para cualquier usuario autenticado.
-- Insert/update/delete siguen solo en las políticas "julian own" de migration_precios_normalizado.sql
--
-- IMPORTANTE: no usar subquery a auth.users dentro de USING: el rol authenticated no puede leer
-- auth.users y PostgREST devuelve 403. Se usa función STABLE SECURITY DEFINER.

create or replace function public.precios_catalog_owner_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(coalesce(email, '')) = 'julian.475@hotmail.com'
  limit 1;
$$;

comment on function public.precios_catalog_owner_user_id() is
  'UUID del dueño del catálogo de precios; usada en RLS de lectura para el equipo.';

revoke all on function public.precios_catalog_owner_user_id() from public;
grant execute on function public.precios_catalog_owner_user_id() to authenticated;

-- precios_config
drop policy if exists "precios_config_select_catalogo_equipo" on public.precios_config;
create policy "precios_config_select_catalogo_equipo"
  on public.precios_config for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());

-- precios_sello_grupo
drop policy if exists "precios_sello_grupo_select_catalogo_equipo" on public.precios_sello_grupo;
create policy "precios_sello_grupo_select_catalogo_equipo"
  on public.precios_sello_grupo for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());

-- precios_sello_medida_grupo
drop policy if exists "precios_sello_medida_grupo_select_catalogo_equipo" on public.precios_sello_medida_grupo;
create policy "precios_sello_medida_grupo_select_catalogo_equipo"
  on public.precios_sello_medida_grupo for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());

-- precios_sello_medida_fija
drop policy if exists "precios_sello_medida_fija_select_catalogo_equipo" on public.precios_sello_medida_fija;
create policy "precios_sello_medida_fija_select_catalogo_equipo"
  on public.precios_sello_medida_fija for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());

-- precios_accesorio
drop policy if exists "precios_accesorio_select_catalogo_equipo" on public.precios_accesorio;
create policy "precios_accesorio_select_catalogo_equipo"
  on public.precios_accesorio for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());

-- precios_abecedario
drop policy if exists "precios_abecedario_select_catalogo_equipo" on public.precios_abecedario;
create policy "precios_abecedario_select_catalogo_equipo"
  on public.precios_abecedario for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());

-- precios_sello_redondo
drop policy if exists "precios_sello_redondo_select_catalogo_equipo" on public.precios_sello_redondo;
create policy "precios_sello_redondo_select_catalogo_equipo"
  on public.precios_sello_redondo for select to authenticated
  using (user_id = public.precios_catalog_owner_user_id());
