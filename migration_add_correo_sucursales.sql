-- Tabla padrón de sucursales Correo Argentino (MiCorreo)
-- Objetivo: resolver códigos de sucursal/provincia desde Supabase (sin redeploy).
--
-- Carga inicial sugerida:
-- 1) Abrir Supabase > Table Editor > correo_sucursales > Insert > Import data from CSV
-- 2) Subir el archivo: src/lib/data/sucursales_micorreo.csv
-- 3) Mapear columnas:
--    codigo, calle, numero, localidad, provincia, horarios
--
-- Actualizar desde un Excel MiCorreo más nuevo (mismas columnas típicas: CÓDIGO, CALLE, …):
--    python scripts/import_correo_sucursales_xlsx.py "ruta/archivo.xlsx" -o correo_sucursales_nuevo.csv
--    Luego TRUNCATE + import del CSV, o bien --upsert con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ver docstring del script).

create table if not exists public.correo_sucursales (
  id bigserial primary key,
  codigo text not null,
  calle text not null,
  numero text null,
  localidad text not null,
  provincia text not null,
  horarios text null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_correo_sucursales_codigo
  on public.correo_sucursales (codigo);

create index if not exists idx_correo_sucursales_prov_loc
  on public.correo_sucursales (provincia, localidad);

create index if not exists idx_correo_sucursales_calle_num
  on public.correo_sucursales (calle, numero);

create index if not exists idx_correo_sucursales_activa
  on public.correo_sucursales (activa);

-- Trigger para updated_at
create or replace function public.touch_correo_sucursales_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_correo_sucursales_updated_at on public.correo_sucursales;
create trigger trg_touch_correo_sucursales_updated_at
before update on public.correo_sucursales
for each row execute function public.touch_correo_sucursales_updated_at();

-- RLS básica: lectura para usuarios autenticados, escritura solo service role.
alter table public.correo_sucursales enable row level security;

drop policy if exists "correo_sucursales_select_authenticated" on public.correo_sucursales;
create policy "correo_sucursales_select_authenticated"
  on public.correo_sucursales
  for select
  to authenticated
  using (true);

drop policy if exists "correo_sucursales_select_anon" on public.correo_sucursales;
create policy "correo_sucursales_select_anon"
  on public.correo_sucursales
  for select
  to anon
  using (true);

