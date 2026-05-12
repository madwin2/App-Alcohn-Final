-- Mockups: solicitudes con datos del cliente y URLs en Storage (bucket foto).
-- Ejecutar en Supabase SQL Editor (una vez).

create table if not exists public.mockup_solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre_muestra text,
  nombre_slug text not null,
  whatsapp text,
  material text not null check (material in ('cuero', 'madera', 'ambos')),
  omitir_analisis boolean not null default false,
  preparado_con_simplificar_ia boolean not null default false,
  estado text not null default 'procesando'
    check (estado in ('procesando', 'pendiente_aprobacion', 'completado', 'error')),
  archivo_base_url text,
  archivo_base_path text,
  validacion jsonb,
  imagen_optimizada_url text,
  imagen_optimizada_path text,
  mockup_cuero_url text,
  mockup_cuero_path text,
  mockup_madera_url text,
  mockup_madera_path text,
  intentos_optimizacion int not null default 0,
  mensaje_error text,
  creado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mockup_solicitudes_created_at
  on public.mockup_solicitudes (created_at desc);

create index if not exists idx_mockup_solicitudes_whatsapp
  on public.mockup_solicitudes (whatsapp);

alter table public.mockup_solicitudes enable row level security;

drop policy if exists "mockup_solicitudes_select_auth" on public.mockup_solicitudes;
drop policy if exists "mockup_solicitudes_insert_auth" on public.mockup_solicitudes;
drop policy if exists "mockup_solicitudes_update_auth" on public.mockup_solicitudes;

create policy "mockup_solicitudes_select_auth"
  on public.mockup_solicitudes for select
  to authenticated
  using (true);

create policy "mockup_solicitudes_insert_auth"
  on public.mockup_solicitudes for insert
  to authenticated
  with check (true);

create policy "mockup_solicitudes_update_auth"
  on public.mockup_solicitudes for update
  to authenticated
  using (true)
  with check (true);

create or replace function public.mockup_solicitudes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mockup_solicitudes_updated_at on public.mockup_solicitudes;
create trigger trg_mockup_solicitudes_updated_at
  before update on public.mockup_solicitudes
  for each row
  execute function public.mockup_solicitudes_touch_updated_at();

comment on table public.mockup_solicitudes is 'Solicitudes de mockup: análisis, optimización y archivos finales en Storage.';
