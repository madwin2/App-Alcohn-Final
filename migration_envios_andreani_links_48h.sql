-- Links Andreani: solo asignar creados en las últimas 48h;
-- "Quitar link" elimina de la DB; borrar pedido sigue devolviendo al pool.
-- Ejecutar en Supabase SQL Editor sobre la DB ya migrada.

-- Quitar overload vieja (2 args) para no chocar con la nueva (3 args)
drop function if exists public.liberar_link_andreani(uuid, boolean);

-- ---------------------------------------------------------------------------
-- Purga disponibles con más de 48h
-- ---------------------------------------------------------------------------
create or replace function public.purgar_links_andreani_viejos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.envios_andreani_links
  where estado = 'disponible'
    and creado_en < now() - interval '48 hours';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purgar_links_andreani_viejos() is
  'Elimina del pool los links disponibles creados hace más de 48 horas.';

-- ---------------------------------------------------------------------------
-- Asignar: solo links frescos (<48h); purga viejos antes
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

  -- Sacar del pool los disponibles vencidos (>48h)
  perform public.purgar_links_andreani_viejos();

  -- Tomar el disponible más antiguo entre los frescos (concurrencia segura)
  select id, url into v_link_id, v_url
  from public.envios_andreani_links
  where estado = 'disponible'
    and creado_en >= now() - interval '48 hours'
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
  'Asigna el link Andreani disponible más antiguo (<48h) a la orden. Si ya tiene uno, lo reutiliza. Null si el pool está vacío.';

-- ---------------------------------------------------------------------------
-- Liberar: disponible / descartado / eliminar de la DB
-- ---------------------------------------------------------------------------
create or replace function public.liberar_link_andreani(
  p_orden_id uuid,
  p_descartar boolean default false,
  p_eliminar boolean default false
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

  if p_eliminar then
    -- Quitar link del pedido: borrar de la DB
    delete from public.envios_andreani_links
    where orden_id = p_orden_id
      and estado = 'asignado';
  elsif p_descartar then
    update public.envios_andreani_links
    set estado = 'descartado'
    where orden_id = p_orden_id
      and estado = 'asignado';
  else
    -- Volver al pool (ej. al borrar pedido). Si ya tiene >48h, se elimina.
    delete from public.envios_andreani_links
    where orden_id = p_orden_id
      and estado = 'asignado'
      and creado_en < now() - interval '48 hours';

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      return true;
    end if;

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

comment on function public.liberar_link_andreani(uuid, boolean, boolean) is
  'Libera el link asignado: disponible (pool), descartado, o eliminar (borrar fila). Si vuelve a pool y tiene >48h, se elimina.';

grant execute on function public.purgar_links_andreani_viejos() to authenticated, service_role;
grant execute on function public.asignar_link_andreani(uuid) to authenticated, service_role;
grant execute on function public.liberar_link_andreani(uuid, boolean, boolean) to authenticated, service_role;

-- Purga inmediata de lo que ya esté vencido en el pool
select public.purgar_links_andreani_viejos();
