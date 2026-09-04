-- Liberar / eliminar etiquetas Andreani desde la UI de Envíos.
-- Ejecutar en Supabase SQL Editor (reemplaza las funciones anteriores).

-- ---------------------------------------------------------------------------
-- Storage: permitir borrar PDFs del bucket
-- ---------------------------------------------------------------------------
drop policy if exists "etiquetas_andreani_delete_authenticated" on storage.objects;
create policy "etiquetas_andreani_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'etiquetas-andreani');

-- ---------------------------------------------------------------------------
-- Liberar: deja la etiqueta como huérfana y aplica destino del pedido
-- p_pedido_accion: 'sin_envio' | 'seguimiento_enviado' | null (si no hay orden)
-- p_seguimiento: opcional (solo aplica con seguimiento_enviado; vacío = null)
-- ---------------------------------------------------------------------------
drop function if exists public.liberar_etiqueta_andreani(uuid);
drop function if exists public.liberar_etiqueta_andreani(uuid, text, text);

create or replace function public.liberar_etiqueta_andreani(
  p_etiqueta_id uuid,
  p_pedido_accion text default 'sin_envio',
  p_seguimiento text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden_id uuid;
  v_tracking text;
  v_accion text;
  v_seg text;
begin
  if p_etiqueta_id is null then
    return false;
  end if;

  select orden_id, tracking
    into v_orden_id, v_tracking
  from public.envios_andreani_etiquetas
  where id = p_etiqueta_id
  for update;

  if not found then
    raise exception 'Etiqueta inexistente';
  end if;

  update public.envios_andreani_etiquetas
  set
    orden_id = null,
    estado = 'huerfano',
    asignado_en = null,
    nota = 'Liberada manualmente'
  where id = p_etiqueta_id;

  if v_orden_id is not null then
    v_accion := coalesce(nullif(btrim(p_pedido_accion), ''), 'sin_envio');
    if v_accion not in ('sin_envio', 'seguimiento_enviado') then
      raise exception 'Acción de pedido inválida: %', v_accion;
    end if;

    v_seg := nullif(btrim(coalesce(p_seguimiento, '')), '');

    if v_accion = 'sin_envio' then
      update public.ordenes
      set
        seguimiento = null,
        estado_envio = 'Sin envio'
      where id = v_orden_id
        and (seguimiento is null or seguimiento = '' or seguimiento = v_tracking);
    else
      update public.ordenes
      set
        seguimiento = v_seg,
        estado_envio = 'Seguimiento Enviado'
      where id = v_orden_id
        and (seguimiento is null or seguimiento = '' or seguimiento = v_tracking);
    end if;
  end if;

  return true;
end;
$$;

comment on function public.liberar_etiqueta_andreani(uuid, text, text) is
  'Quita la etiqueta del pedido y la deja huérfana. Destino del pedido: sin_envio o seguimiento_enviado.';

grant execute on function public.liberar_etiqueta_andreani(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Eliminar: borra fila (PDF de storage lo limpia el cliente) + destino pedido
-- ---------------------------------------------------------------------------
drop function if exists public.eliminar_etiqueta_andreani(uuid);
drop function if exists public.eliminar_etiqueta_andreani(uuid, text, text);

create or replace function public.eliminar_etiqueta_andreani(
  p_etiqueta_id uuid,
  p_pedido_accion text default 'sin_envio',
  p_seguimiento text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden_id uuid;
  v_tracking text;
  v_pdf_path text;
  v_accion text;
  v_seg text;
begin
  if p_etiqueta_id is null then
    return null;
  end if;

  select orden_id, tracking, pdf_path
    into v_orden_id, v_tracking, v_pdf_path
  from public.envios_andreani_etiquetas
  where id = p_etiqueta_id
  for update;

  if not found then
    raise exception 'Etiqueta inexistente';
  end if;

  if v_orden_id is not null then
    v_accion := coalesce(nullif(btrim(p_pedido_accion), ''), 'sin_envio');
    if v_accion not in ('sin_envio', 'seguimiento_enviado') then
      raise exception 'Acción de pedido inválida: %', v_accion;
    end if;

    v_seg := nullif(btrim(coalesce(p_seguimiento, '')), '');

    if v_accion = 'sin_envio' then
      update public.ordenes
      set
        seguimiento = null,
        estado_envio = 'Sin envio'
      where id = v_orden_id
        and (seguimiento is null or seguimiento = '' or seguimiento = v_tracking);
    else
      update public.ordenes
      set
        seguimiento = v_seg,
        estado_envio = 'Seguimiento Enviado'
      where id = v_orden_id
        and (seguimiento is null or seguimiento = '' or seguimiento = v_tracking);
    end if;
  end if;

  delete from public.envios_andreani_etiquetas
  where id = p_etiqueta_id;

  return v_pdf_path;
end;
$$;

comment on function public.eliminar_etiqueta_andreani(uuid, text, text) is
  'Elimina la fila de etiqueta. Devuelve pdf_path. Destino del pedido: sin_envio o seguimiento_enviado.';

grant execute on function public.eliminar_etiqueta_andreani(uuid, text, text) to authenticated, service_role;
