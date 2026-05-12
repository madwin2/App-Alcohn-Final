-- Lista de precios interna (JSON) por usuario, solo accesible para julian.475@hotmail.com
-- Ejecutar en Supabase SQL Editor (una vez)

create table if not exists public.precios_lista (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_precios_lista_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_precios_lista_updated_at on public.precios_lista;
create trigger trg_touch_precios_lista_updated_at
  before update on public.precios_lista
  for each row execute function public.touch_precios_lista_updated_at();

alter table public.precios_lista enable row level security;

drop policy if exists "precios_lista_select_julian_own" on public.precios_lista;
drop policy if exists "precios_lista_insert_julian_own" on public.precios_lista;
drop policy if exists "precios_lista_update_julian_own" on public.precios_lista;
drop policy if exists "precios_lista_delete_julian_own" on public.precios_lista;

-- Solo el dueño de la fila y con el mail autorizado (misma cuenta que Economía / Gastos)
create policy "precios_lista_select_julian_own"
  on public.precios_lista
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com'
  );

create policy "precios_lista_insert_julian_own"
  on public.precios_lista
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com'
  );

create policy "precios_lista_update_julian_own"
  on public.precios_lista
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com'
  )
  with check (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com'
  );

create policy "precios_lista_delete_julian_own"
  on public.precios_lista
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'julian.475@hotmail.com'
  );
