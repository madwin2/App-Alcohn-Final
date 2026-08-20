-- Etiquetas Andreani descargadas del portal (Zebra 10x15).
-- Deduplicación por tracking. Huérfanos = envío pagado sin pedido con link asignado.

create table if not exists public.envios_andreani_etiquetas (
  id uuid primary key default gen_random_uuid(),
  tracking text not null,
  nro_operacion text,
  destinatario text,
  destino text,
  fecha_portal text,
  estado_portal text,
  orden_id uuid references public.ordenes(id) on delete set null,
  estado text not null default 'huerfano'
    check (estado in ('asignada', 'huerfano')),
  pdf_path text,
  nota text,
  creado_en timestamptz not null default now(),
  asignado_en timestamptz
);

create unique index if not exists envios_andreani_etiquetas_tracking_uidx
  on public.envios_andreani_etiquetas (tracking);

create unique index if not exists envios_andreani_etiquetas_operacion_uidx
  on public.envios_andreani_etiquetas (nro_operacion)
  where nro_operacion is not null and nro_operacion <> '';

create index if not exists envios_andreani_etiquetas_orden_idx
  on public.envios_andreani_etiquetas (orden_id)
  where orden_id is not null;

create index if not exists envios_andreani_etiquetas_estado_idx
  on public.envios_andreani_etiquetas (estado);

comment on table public.envios_andreani_etiquetas is
  'Etiquetas Zebra bajadas de Andreani. asignada = match con orden que tiene link; huerfano = sin match único.';

alter table public.envios_andreani_etiquetas enable row level security;

drop policy if exists "envios_andreani_etiquetas_select_authenticated" on public.envios_andreani_etiquetas;
drop policy if exists "envios_andreani_etiquetas_insert_authenticated" on public.envios_andreani_etiquetas;
drop policy if exists "envios_andreani_etiquetas_update_authenticated" on public.envios_andreani_etiquetas;
drop policy if exists "envios_andreani_etiquetas_delete_authenticated" on public.envios_andreani_etiquetas;

create policy "envios_andreani_etiquetas_select_authenticated"
  on public.envios_andreani_etiquetas
  for select to authenticated
  using (true);

create policy "envios_andreani_etiquetas_insert_authenticated"
  on public.envios_andreani_etiquetas
  for insert to authenticated
  with check (true);

create policy "envios_andreani_etiquetas_update_authenticated"
  on public.envios_andreani_etiquetas
  for update to authenticated
  using (true)
  with check (true);

create policy "envios_andreani_etiquetas_delete_authenticated"
  on public.envios_andreani_etiquetas
  for delete to authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'etiquetas-andreani',
  'etiquetas-andreani',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "etiquetas_andreani_select_authenticated" on storage.objects;
create policy "etiquetas_andreani_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'etiquetas-andreani');

drop policy if exists "etiquetas_andreani_insert_authenticated" on storage.objects;
create policy "etiquetas_andreani_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'etiquetas-andreani');

drop policy if exists "etiquetas_andreani_update_authenticated" on storage.objects;
create policy "etiquetas_andreani_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'etiquetas-andreani')
  with check (bucket_id = 'etiquetas-andreani');

-- ---------------------------------------------------------------------------
-- Asignar huérfano a una orden que ya tiene link Andreani y no tiene tracking
-- ---------------------------------------------------------------------------
create or replace function public.asignar_etiqueta_andreani(
  p_etiqueta_id uuid,
  p_orden_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracking text;
  v_link_id uuid;
  v_seguimiento text;
begin
  if p_etiqueta_id is null or p_orden_id is null then
    return false;
  end if;

  select tracking into v_tracking
  from public.envios_andreani_etiquetas
  where id = p_etiqueta_id
  for update;

  if v_tracking is null then
    raise exception 'Etiqueta inexistente';
  end if;

  select id into v_link_id
  from public.envios_andreani_links
  where orden_id = p_orden_id
    and estado = 'asignado'
  limit 1;

  if v_link_id is null then
    raise exception 'La orden no tiene un link Andreani asignado';
  end if;

  select seguimiento into v_seguimiento
  from public.ordenes
  where id = p_orden_id
  for update;

  if v_seguimiento is not null and btrim(v_seguimiento) <> '' and v_seguimiento <> v_tracking then
    raise exception 'La orden ya tiene otro número de seguimiento';
  end if;

  if exists (
    select 1
    from public.ordenes
    where id <> p_orden_id
      and seguimiento = v_tracking
  ) then
    raise exception 'Ese tracking ya está en otra orden';
  end if;

  update public.envios_andreani_etiquetas
  set
    orden_id = p_orden_id,
    estado = 'asignada',
    asignado_en = now(),
    nota = null
  where id = p_etiqueta_id;

  update public.ordenes
  set
    seguimiento = v_tracking,
    estado_envio = 'Etiqueta Lista',
    empresa_envio = coalesce(empresa_envio, 'Andreani')
  where id = p_orden_id;

  return true;
end;
$$;

comment on function public.asignar_etiqueta_andreani(uuid, uuid) is
  'Asigna una etiqueta huérfana a una orden con link Andreani. No cambia estado de venta.';

grant execute on function public.asignar_etiqueta_andreani(uuid, uuid) to authenticated, service_role;
