-- Meta dinámica de ventas en sellos (equilibrio y objetivo de ganancia), publicada por Economía.
-- Solo cantidades de sellos: el equipo la ve en Inicio sin ver montos. (Aplicada 2026-10-06.)
create table if not exists public.metas_ventas (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  equilibrio_sellos numeric not null check (equilibrio_sellos >= 0),
  objetivo_sellos numeric not null check (objetivo_sellos >= 0),
  objetivo_pct numeric not null,
  actualizado_at timestamptz not null default now()
);

alter table public.metas_ventas enable row level security;

drop policy if exists metas_ventas_select on public.metas_ventas;
create policy metas_ventas_select on public.metas_ventas for select to authenticated using (true);

drop policy if exists metas_ventas_owner_write on public.metas_ventas;
create policy metas_ventas_owner_write on public.metas_ventas for all to authenticated
  using (auth.uid() = public.precios_catalog_owner_user_id())
  with check (auth.uid() = public.precios_catalog_owner_user_id());
