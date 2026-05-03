-- Gastos mensuales (fijos + extras por mes) + legado de costo fijo único → Supabase por usuario
-- Ejecutar en Supabase SQL Editor (una vez)

create table if not exists public.economia_gastos_mensuales (
  user_id uuid primary key references auth.users (id) on delete cascade,
  months jsonb not null default '{}'::jsonb,
  legacy_fixed_scalar numeric(14,2) not null default 0 check (legacy_fixed_scalar >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_economia_gastos_mensuales_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_economia_gastos_mensuales_updated_at on public.economia_gastos_mensuales;
create trigger trg_touch_economia_gastos_mensuales_updated_at
  before update on public.economia_gastos_mensuales
  for each row execute function public.touch_economia_gastos_mensuales_updated_at();

alter table public.economia_gastos_mensuales enable row level security;

drop policy if exists "economia_gastos_mensuales_select_own" on public.economia_gastos_mensuales;
drop policy if exists "economia_gastos_mensuales_insert_own" on public.economia_gastos_mensuales;
drop policy if exists "economia_gastos_mensuales_update_own" on public.economia_gastos_mensuales;

create policy "economia_gastos_mensuales_select_own"
  on public.economia_gastos_mensuales
  for select to authenticated
  using (user_id = auth.uid());

create policy "economia_gastos_mensuales_insert_own"
  on public.economia_gastos_mensuales
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "economia_gastos_mensuales_update_own"
  on public.economia_gastos_mensuales
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
