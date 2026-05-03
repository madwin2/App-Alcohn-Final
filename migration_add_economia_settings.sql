-- Configuración de Economía (dólar referencia + flujo/caja) por usuario autenticado
-- Ejecutar en Supabase SQL Editor (una vez)

create table if not exists public.economia_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  usd_reference numeric(14,4) not null default 1200 check (usd_reference > 0),
  caja_efectivo numeric(14,2) not null default 0 check (caja_efectivo >= 0),
  caja_mercadopago numeric(14,2) not null default 0 check (caja_mercadopago >= 0),
  caja_santander_catalina numeric(14,2) not null default 0 check (caja_santander_catalina >= 0),
  caja_santander_julian numeric(14,2) not null default 0 check (caja_santander_julian >= 0),
  caja_bbva numeric(14,2) not null default 0 check (caja_bbva >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_economia_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_economia_settings_updated_at on public.economia_settings;
create trigger trg_touch_economia_settings_updated_at
  before update on public.economia_settings
  for each row execute function public.touch_economia_settings_updated_at();

alter table public.economia_settings enable row level security;

drop policy if exists "economia_settings_select_own" on public.economia_settings;
drop policy if exists "economia_settings_insert_own" on public.economia_settings;
drop policy if exists "economia_settings_update_own" on public.economia_settings;

create policy "economia_settings_select_own"
  on public.economia_settings
  for select to authenticated
  using (user_id = auth.uid());

create policy "economia_settings_insert_own"
  on public.economia_settings
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "economia_settings_update_own"
  on public.economia_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
