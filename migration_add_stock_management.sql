-- Gestión de stock + asignación de alertas

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  item_name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  min_quantity integer not null default 0 check (min_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  movement_type text not null check (movement_type in ('IN', 'OUT', 'ADJUSTMENT')),
  quantity integer not null check (quantity > 0),
  note text null,
  order_id uuid null references public.ordenes(id) on delete set null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_alert_assignments (
  id uuid primary key default gen_random_uuid(),
  item_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_key, user_id)
);

create index if not exists idx_stock_items_item_key on public.stock_items(item_key);
create index if not exists idx_stock_movements_stock_item on public.stock_movements(stock_item_id, created_at desc);
create index if not exists idx_stock_alert_assignments_item_key on public.stock_alert_assignments(item_key);
create index if not exists idx_stock_alert_assignments_user_id on public.stock_alert_assignments(user_id);

create or replace function public.touch_stock_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_stock_items_updated_at on public.stock_items;
create trigger trg_touch_stock_items_updated_at
before update on public.stock_items
for each row execute function public.touch_stock_items_updated_at();

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_alert_assignments enable row level security;

drop policy if exists "stock_items_select_authenticated" on public.stock_items;
drop policy if exists "stock_items_update_authenticated" on public.stock_items;
drop policy if exists "stock_items_insert_authenticated" on public.stock_items;
drop policy if exists "stock_movements_select_authenticated" on public.stock_movements;
drop policy if exists "stock_movements_insert_authenticated" on public.stock_movements;
drop policy if exists "stock_alert_assignments_select_authenticated" on public.stock_alert_assignments;
drop policy if exists "stock_alert_assignments_insert_authenticated" on public.stock_alert_assignments;
drop policy if exists "stock_alert_assignments_delete_authenticated" on public.stock_alert_assignments;

create policy "stock_items_select_authenticated"
  on public.stock_items
  for select to authenticated
  using (true);

create policy "stock_items_update_authenticated"
  on public.stock_items
  for update to authenticated
  using (true)
  with check (true);

create policy "stock_items_insert_authenticated"
  on public.stock_items
  for insert to authenticated
  with check (true);

create policy "stock_movements_select_authenticated"
  on public.stock_movements
  for select to authenticated
  using (true);

create policy "stock_movements_insert_authenticated"
  on public.stock_movements
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "stock_alert_assignments_select_authenticated"
  on public.stock_alert_assignments
  for select to authenticated
  using (true);

create policy "stock_alert_assignments_insert_authenticated"
  on public.stock_alert_assignments
  for insert to authenticated
  with check (true);

create policy "stock_alert_assignments_delete_authenticated"
  on public.stock_alert_assignments
  for delete to authenticated
  using (true);

-- Seed inicial de ítems base
insert into public.stock_items (item_key, item_name)
values
  ('CAJA_ABECEDARIO', 'Caja de Abecedario'),
  ('SOPORTE_ABECEDARIO', 'Soporte de Abecedario'),
  ('MANGO_GOLPE', 'Mango de Golpe'),
  ('SOLDADOR_100W', 'Soldador 100W'),
  ('SOLDADOR_200W', 'Soldador 200W'),
  ('SOLDADOR_ADAPTADO_100W', 'Soldador Adaptado 100W'),
  ('SOLDADOR_ADAPTADO_200W', 'Soldador Adaptado 200W'),
  ('TUERCA', 'Tuercas'),
  ('VARILLA', 'Varillas'),
  ('PRISIONERO', 'Prisioneros'),
  ('MANGO', 'Mango'),
  ('TUBO_80MM', 'Tubos 80mm'),
  ('TUBO_125MM', 'Tubos 125mm')
on conflict (item_key) do nothing;
