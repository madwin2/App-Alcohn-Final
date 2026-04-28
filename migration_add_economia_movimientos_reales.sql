-- Movimientos para calcular ganancia real (Economía)
-- Compra de USD (ahorro) + inversiones

create table if not exists public.economia_movimientos_reales (
  id uuid primary key default gen_random_uuid(),
  movement_date date not null,
  movement_type text not null check (movement_type in ('USD_PURCHASE', 'INV_EMPRESA', 'INV_CYPREA')),
  amount_ars numeric(14,2) not null check (amount_ars >= 0),
  amount_usd numeric(14,4) null check (amount_usd is null or amount_usd >= 0),
  usd_rate numeric(14,4) null check (usd_rate is null or usd_rate >= 0),
  note text null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_economia_movimientos_reales_date
  on public.economia_movimientos_reales (movement_date desc, created_at desc);

create index if not exists idx_economia_movimientos_reales_created_by
  on public.economia_movimientos_reales (created_by);

create or replace function public.touch_economia_movimientos_reales_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_economia_movimientos_reales_updated_at
  on public.economia_movimientos_reales;

create trigger trg_touch_economia_movimientos_reales_updated_at
before update on public.economia_movimientos_reales
for each row execute function public.touch_economia_movimientos_reales_updated_at();

alter table public.economia_movimientos_reales enable row level security;

drop policy if exists "economia_movimientos_reales_select_own" on public.economia_movimientos_reales;
drop policy if exists "economia_movimientos_reales_insert_own" on public.economia_movimientos_reales;
drop policy if exists "economia_movimientos_reales_delete_own" on public.economia_movimientos_reales;

create policy "economia_movimientos_reales_select_own"
  on public.economia_movimientos_reales
  for select to authenticated
  using (created_by = auth.uid());

create policy "economia_movimientos_reales_insert_own"
  on public.economia_movimientos_reales
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "economia_movimientos_reales_delete_own"
  on public.economia_movimientos_reales
  for delete to authenticated
  using (created_by = auth.uid());
