-- Links Andreani: se asignan al enviar la foto del sello (no al crear el pedido).
-- Pool usable: creados en las últimas 30 horas (margen vs caducidad ~48h de Andreani).
-- Si la orden ya tiene un link asignado vencido, se descarta y se toma uno fresco.
-- Ejecutar en Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Purga disponibles con más de 30h
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
    and creado_en < now() - interval '30 hours';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purgar_links_andreani_viejos() is
  'Elimina del pool los links disponibles creados hace más de 30 horas.';

-- ---------------------------------------------------------------------------
-- Asignar: solo links frescos (<30h); si el asignado está vencido, reemplazar
-- ---------------------------------------------------------------------------
create or replace function public.asignar_link_andreani(p_orden_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_existing_url text;
  v_existing_creado timestamptz;
  v_link_id uuid;
  v_url text;
begin
  if p_orden_id is null then
    return null;
  end if;

  -- Ya tiene link asignado
  select id, url, creado_en
  into v_existing_id, v_existing_url, v_existing_creado
  from public.envios_andreani_links
  where orden_id = p_orden_id
    and estado = 'asignado'
  limit 1;

  if v_existing_id is not null then
    -- Fresco → reutilizar
    if v_existing_creado >= now() - interval '30 hours' then
      return v_existing_url;
    end if;

    -- Vencido → descartar y continuar a tomar del pool
    update public.envios_andreani_links
    set estado = 'descartado'
    where id = v_existing_id;
  end if;

  -- Sacar del pool los disponibles vencidos (>30h)
  perform public.purgar_links_andreani_viejos();

  -- Tomar el disponible más antiguo entre los frescos (concurrencia segura)
  select id, url into v_link_id, v_url
  from public.envios_andreani_links
  where estado = 'disponible'
    and creado_en >= now() - interval '30 hours'
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
  'Asigna el link Andreani disponible más antiguo (<30h) a la orden. Si ya tiene uno fresco, lo reutiliza; si está vencido, lo descarta y toma otro. Null si el pool está vacío.';

-- ---------------------------------------------------------------------------
-- Liberar: al volver a pool, eliminar si ya tiene >30h
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
    delete from public.envios_andreani_links
    where orden_id = p_orden_id
      and estado = 'asignado';
  elsif p_descartar then
    update public.envios_andreani_links
    set estado = 'descartado'
    where orden_id = p_orden_id
      and estado = 'asignado';
  else
    -- Volver al pool. Si ya tiene >30h, se elimina.
    delete from public.envios_andreani_links
    where orden_id = p_orden_id
      and estado = 'asignado'
      and creado_en < now() - interval '30 hours';

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
  'Libera el link asignado: disponible (pool), descartado, o eliminar (borrar fila). Si vuelve a pool y tiene >30h, se elimina.';

grant execute on function public.purgar_links_andreani_viejos() to authenticated, service_role;
grant execute on function public.asignar_link_andreani(uuid) to authenticated, service_role;
grant execute on function public.liberar_link_andreani(uuid, boolean, boolean) to authenticated, service_role;

select public.purgar_links_andreani_viejos();
