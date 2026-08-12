-- Pool de links de pago Andreani (envíos donde el destinatario completa datos y abona).
-- Ver GUIA_CURSOR_ANDREANI_LINKS.md — Etapa 1.

create extension if not exists pgcrypto;

create table if not exists public.envios_andreani_links (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  estado text not null default 'disponible'
    check (estado in ('disponible', 'asignado', 'descartado')),
  orden_id uuid references public.ordenes(id) on delete set null,
  creado_en timestamptz not null default now(),
  asignado_en timestamptz,
  nota text
);

create index if not exists idx_envios_andreani_links_estado
  on public.envios_andreani_links (estado);

create index if not exists idx_envios_andreani_links_orden
  on public.envios_andreani_links (orden_id)
  where orden_id is not null;

-- Máximo un link asignado por orden
create unique index if not exists envios_andreani_un_asignado
  on public.envios_andreani_links (orden_id)
  where estado = 'asignado';

comment on table public.envios_andreani_links is
  'Pool de links Andreani (pago por destinatario). disponible → asignado a una orden; descartado = vencido/roto.';

alter table public.envios_andreani_links enable row level security;

drop policy if exists "envios_andreani_links_select_authenticated" on public.envios_andreani_links;
drop policy if exists "envios_andreani_links_insert_authenticated" on public.envios_andreani_links;
drop policy if exists "envios_andreani_links_update_authenticated" on public.envios_andreani_links;
drop policy if exists "envios_andreani_links_delete_authenticated" on public.envios_andreani_links;

create policy "envios_andreani_links_select_authenticated"
  on public.envios_andreani_links
  for select to authenticated
  using (true);

create policy "envios_andreani_links_insert_authenticated"
  on public.envios_andreani_links
  for insert to authenticated
  with check (true);

create policy "envios_andreani_links_update_authenticated"
  on public.envios_andreani_links
  for update to authenticated
  using (true)
  with check (true);

create policy "envios_andreani_links_delete_authenticated"
  on public.envios_andreani_links
  for delete to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- RPC: asignar link del pool a una orden
-- ---------------------------------------------------------------------------
create or replace function public.asignar_link_andreani(p_orden_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_url text;
  v_link_id uuid;
  v_url text;
begin
  if p_orden_id is null then
    return null;
  end if;

  -- Ya tiene link asignado → devolver ese
  select url into v_existing_url
  from public.envios_andreani_links
  where orden_id = p_orden_id
    and estado = 'asignado'
  limit 1;

  if v_existing_url is not null then
    return v_existing_url;
  end if;

  -- Tomar el disponible más antiguo (concurrencia segura)
  select id, url into v_link_id, v_url
  from public.envios_andreani_links
  where estado = 'disponible'
  order by creado_en asc
  for update skip locked
  limit 1;

  if v_link_id is null then
    return null;
  end if;

  update public.envios_andreani_links
  set
    estado = 'asignado',
    orden_id = p_orden_id,
    asignado_en = now()
  where id = v_link_id;

  return v_url;
end;
$$;

comment on function public.asignar_link_andreani(uuid) is
  'Asigna el link Andreani disponible más antiguo a la orden. Si ya tiene uno, lo reutiliza. Null si el pool está vacío.';

-- ---------------------------------------------------------------------------
-- RPC: liberar link de una orden (vuelve a disponible o se descarta)
-- ---------------------------------------------------------------------------
create or replace function public.liberar_link_andreani(
  p_orden_id uuid,
  p_descartar boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_orden_id is null then
    return false;
  end if;

  if p_descartar then
    update public.envios_andreani_links
    set estado = 'descartado'
    where orden_id = p_orden_id
      and estado = 'asignado';
  else
    update public.envios_andreani_links
    set
      estado = 'disponible',
      orden_id = null,
      asignado_en = null
    where orden_id = p_orden_id
      and estado = 'asignado';
  end if;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function public.liberar_link_andreani(uuid, boolean) is
  'Libera el link asignado de la orden: disponible (reutilizable) o descartado (vencido/roto).';

grant execute on function public.asignar_link_andreani(uuid) to authenticated, service_role;
grant execute on function public.liberar_link_andreani(uuid, boolean) to authenticated, service_role;
