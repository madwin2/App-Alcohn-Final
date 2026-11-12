-- Asignar etiqueta Andreani a un pedido sin link asignado.
-- Caso: el pedido es por Andreani pero el link nunca se mandó (o se mandó por fuera).
-- Sin link, la orden tiene que ser empresa_envio = 'Andreani' y no estar
-- Despachado ni Seguimiento Enviado. El resto de las validaciones no cambia.

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
  v_empresa text;
  v_estado_envio text;
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

  select seguimiento, empresa_envio, estado_envio
  into v_seguimiento, v_empresa, v_estado_envio
  from public.ordenes
  where id = p_orden_id
  for update;

  if not found then
    raise exception 'Orden inexistente';
  end if;

  select id into v_link_id
  from public.envios_andreani_links
  where orden_id = p_orden_id
    and estado = 'asignado'
  limit 1;

  if v_link_id is null then
    if v_empresa is distinct from 'Andreani' then
      raise exception 'La orden no tiene link Andreani ni es un envío por Andreani';
    end if;
    if v_estado_envio in ('Despachado', 'Seguimiento Enviado') then
      raise exception 'La orden ya está despachada o con seguimiento enviado';
    end if;
  end if;

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
  'Asigna una etiqueta huérfana a una orden con link Andreani, o sin link si la orden es por Andreani y no está despachada. No cambia estado de venta.';

grant execute on function public.asignar_etiqueta_andreani(uuid, uuid) to authenticated, service_role;
