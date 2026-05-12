-- Precios normalizados (tablas relacionales) + eliminación de legacy `precios_lista`
-- Ejecutar en Supabase SQL Editor después de haber aplicado (o no) migration_add_precios_lista.sql
-- Si tenías datos solo en JSON, exportalos antes si hace falta; este script borra precios_lista.

-- ---------------------------------------------------------------------------
-- Legacy
-- ---------------------------------------------------------------------------
drop policy if exists "precios_lista_delete_julian_own" on public.precios_lista;
drop policy if exists "precios_lista_update_julian_own" on public.precios_lista;
drop policy if exists "precios_lista_insert_julian_own" on public.precios_lista;
drop policy if exists "precios_lista_select_julian_own" on public.precios_lista;
drop trigger if exists trg_touch_precios_lista_updated_at on public.precios_lista;
drop function if exists public.touch_precios_lista_updated_at();
drop table if exists public.precios_lista;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.precios_config (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nota_presupuesto text,
  updated_at timestamptz not null default now()
);

create table if not exists public.precios_sello_grupo (
  user_id uuid not null references auth.users (id) on delete cascade,
  codigo text not null,
  titulo text not null,
  medidas_resumen text,
  precio_transferencia numeric(14, 2) not null default 0 check (precio_transferencia >= 0),
  orden smallint not null default 0,
  primary key (user_id, codigo),
  constraint precios_sello_grupo_codigo_chk
    check (codigo in ('chicos', 'medianos', 'grandes', 'xl'))
);

create table if not exists public.precios_sello_medida_grupo (
  user_id uuid not null references auth.users (id) on delete cascade,
  ancho numeric(12, 4) not null,
  largo numeric(12, 4) not null,
  grupo_codigo text not null,
  primary key (user_id, ancho, largo),
  constraint precios_sello_medida_grupo_grupo_fk
    foreign key (user_id, grupo_codigo)
    references public.precios_sello_grupo (user_id, codigo)
    on delete cascade,
  constraint precios_sello_medida_grupo_codigo_chk
    check (grupo_codigo in ('chicos', 'medianos', 'grandes', 'xl'))
);

create index if not exists idx_precios_medida_grupo_user
  on public.precios_sello_medida_grupo (user_id, ancho, largo);

create table if not exists public.precios_sello_medida_fija (
  user_id uuid not null references auth.users (id) on delete cascade,
  ancho numeric(12, 4) not null,
  largo numeric(12, 4) not null,
  etiqueta text,
  precio_transferencia numeric(14, 2) not null check (precio_transferencia >= 0),
  primary key (user_id, ancho, largo)
);

create index if not exists idx_precios_medida_fija_user
  on public.precios_sello_medida_fija (user_id, ancho, largo);

create table if not exists public.precios_accesorio (
  user_id uuid not null references auth.users (id) on delete cascade,
  codigo text not null,
  etiqueta text not null,
  precio_transferencia numeric(14, 2) not null default 0 check (precio_transferencia >= 0),
  primary key (user_id, codigo),
  constraint precios_accesorio_codigo_chk
    check (codigo in ('soldador', 'base_remachadora', 'mango_golpe'))
);

create table if not exists public.precios_abecedario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  categoria text not null,
  detalle text not null,
  precio_transferencia numeric(14, 2) not null default 0 check (precio_transferencia >= 0),
  orden smallint not null default 0,
  unique (user_id, orden)
);

create index if not exists idx_precios_abecedario_user on public.precios_abecedario (user_id);

create table if not exists public.precios_sello_redondo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rango text not null,
  precio_simple numeric(14, 2) not null default 0 check (precio_simple >= 0),
  precio_intermedio numeric(14, 2) not null default 0 check (precio_intermedio >= 0),
  precio_complejo numeric(14, 2) not null default 0 check (precio_complejo >= 0),
  orden smallint not null default 0,
  unique (user_id, orden)
);

create index if not exists idx_precios_redondo_user on public.precios_sello_redondo (user_id);

-- ---------------------------------------------------------------------------
-- updated_at config
-- ---------------------------------------------------------------------------
create or replace function public.touch_precios_config_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_precios_config_updated_at on public.precios_config;
create trigger trg_touch_precios_config_updated_at
  before update on public.precios_config
  for each row execute function public.touch_precios_config_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (misma cuenta que Economía / Gastos)
-- ---------------------------------------------------------------------------
alter table public.precios_config enable row level security;
alter table public.precios_sello_grupo enable row level security;
alter table public.precios_sello_medida_grupo enable row level security;
alter table public.precios_sello_medida_fija enable row level security;
alter table public.precios_accesorio enable row level security;
alter table public.precios_abecedario enable row level security;
alter table public.precios_sello_redondo enable row level security;

-- precios_config
drop policy if exists "precios_config_select" on public.precios_config;
drop policy if exists "precios_config_insert" on public.precios_config;
drop policy if exists "precios_config_update" on public.precios_config;
drop policy if exists "precios_config_delete" on public.precios_config;

create policy "precios_config_select" on public.precios_config for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_config_insert" on public.precios_config for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_config_update" on public.precios_config for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_config_delete" on public.precios_config for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');

-- precios_sello_grupo
drop policy if exists "precios_sello_grupo_select" on public.precios_sello_grupo;
drop policy if exists "precios_sello_grupo_insert" on public.precios_sello_grupo;
drop policy if exists "precios_sello_grupo_update" on public.precios_sello_grupo;
drop policy if exists "precios_sello_grupo_delete" on public.precios_sello_grupo;

create policy "precios_sello_grupo_select" on public.precios_sello_grupo for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_grupo_insert" on public.precios_sello_grupo for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_grupo_update" on public.precios_sello_grupo for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_grupo_delete" on public.precios_sello_grupo for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');

-- precios_sello_medida_grupo
drop policy if exists "precios_sello_medida_grupo_select" on public.precios_sello_medida_grupo;
drop policy if exists "precios_sello_medida_grupo_insert" on public.precios_sello_medida_grupo;
drop policy if exists "precios_sello_medida_grupo_update" on public.precios_sello_medida_grupo;
drop policy if exists "precios_sello_medida_grupo_delete" on public.precios_sello_medida_grupo;

create policy "precios_sello_medida_grupo_select" on public.precios_sello_medida_grupo for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_medida_grupo_insert" on public.precios_sello_medida_grupo for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_medida_grupo_update" on public.precios_sello_medida_grupo for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_medida_grupo_delete" on public.precios_sello_medida_grupo for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');

-- precios_sello_medida_fija
drop policy if exists "precios_sello_medida_fija_select" on public.precios_sello_medida_fija;
drop policy if exists "precios_sello_medida_fija_insert" on public.precios_sello_medida_fija;
drop policy if exists "precios_sello_medida_fija_update" on public.precios_sello_medida_fija;
drop policy if exists "precios_sello_medida_fija_delete" on public.precios_sello_medida_fija;

create policy "precios_sello_medida_fija_select" on public.precios_sello_medida_fija for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_medida_fija_insert" on public.precios_sello_medida_fija for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_medida_fija_update" on public.precios_sello_medida_fija for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_medida_fija_delete" on public.precios_sello_medida_fija for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');

-- precios_accesorio
drop policy if exists "precios_accesorio_select" on public.precios_accesorio;
drop policy if exists "precios_accesorio_insert" on public.precios_accesorio;
drop policy if exists "precios_accesorio_update" on public.precios_accesorio;
drop policy if exists "precios_accesorio_delete" on public.precios_accesorio;

create policy "precios_accesorio_select" on public.precios_accesorio for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_accesorio_insert" on public.precios_accesorio for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_accesorio_update" on public.precios_accesorio for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_accesorio_delete" on public.precios_accesorio for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');

-- precios_abecedario
drop policy if exists "precios_abecedario_select" on public.precios_abecedario;
drop policy if exists "precios_abecedario_insert" on public.precios_abecedario;
drop policy if exists "precios_abecedario_update" on public.precios_abecedario;
drop policy if exists "precios_abecedario_delete" on public.precios_abecedario;

create policy "precios_abecedario_select" on public.precios_abecedario for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_abecedario_insert" on public.precios_abecedario for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_abecedario_update" on public.precios_abecedario for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_abecedario_delete" on public.precios_abecedario for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');

-- precios_sello_redondo
drop policy if exists "precios_sello_redondo_select" on public.precios_sello_redondo;
drop policy if exists "precios_sello_redondo_insert" on public.precios_sello_redondo;
drop policy if exists "precios_sello_redondo_update" on public.precios_sello_redondo;
drop policy if exists "precios_sello_redondo_delete" on public.precios_sello_redondo;

create policy "precios_sello_redondo_select" on public.precios_sello_redondo for select to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_redondo_insert" on public.precios_sello_redondo for insert to authenticated
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_redondo_update" on public.precios_sello_redondo for update to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com')
  with check (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
create policy "precios_sello_redondo_delete" on public.precios_sello_redondo for delete to authenticated
  using (user_id = auth.uid() and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com');
