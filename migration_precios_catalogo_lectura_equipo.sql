-- Lectura del catálogo de precios (filas del usuario lista) para cualquier usuario autenticado.
-- Así pedidos / mockups pueden cotizar sin sesión de julian. Insert/update/delete siguen restringidos al dueño.

-- precios_config
drop policy if exists "precios_config_select_catalogo_equipo" on public.precios_config;
create policy "precios_config_select_catalogo_equipo"
  on public.precios_config for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );

-- precios_sello_grupo
drop policy if exists "precios_sello_grupo_select_catalogo_equipo" on public.precios_sello_grupo;
create policy "precios_sello_grupo_select_catalogo_equipo"
  on public.precios_sello_grupo for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );

-- precios_sello_medida_grupo
drop policy if exists "precios_sello_medida_grupo_select_catalogo_equipo" on public.precios_sello_medida_grupo;
create policy "precios_sello_medida_grupo_select_catalogo_equipo"
  on public.precios_sello_medida_grupo for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );

-- precios_sello_medida_fija
drop policy if exists "precios_sello_medida_fija_select_catalogo_equipo" on public.precios_sello_medida_fija;
create policy "precios_sello_medida_fija_select_catalogo_equipo"
  on public.precios_sello_medida_fija for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );

-- precios_accesorio
drop policy if exists "precios_accesorio_select_catalogo_equipo" on public.precios_accesorio;
create policy "precios_accesorio_select_catalogo_equipo"
  on public.precios_accesorio for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );

-- precios_abecedario
drop policy if exists "precios_abecedario_select_catalogo_equipo" on public.precios_abecedario;
create policy "precios_abecedario_select_catalogo_equipo"
  on public.precios_abecedario for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );

-- precios_sello_redondo
drop policy if exists "precios_sello_redondo_select_catalogo_equipo" on public.precios_sello_redondo;
create policy "precios_sello_redondo_select_catalogo_equipo"
  on public.precios_sello_redondo for select to authenticated
  using (
    user_id = (select u.id from auth.users u where lower(coalesce(u.email, '')) = 'julian.475@hotmail.com' limit 1)
  );
