-- Liberar / eliminar etiquetas Andreani desde la UI de Envíos.
-- Ejecutar en Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Storage: permitir borrar PDFs del bucket
-- ---------------------------------------------------------------------------
drop policy if exists "etiquetas_andreani_delete_authenticated" on storage.objects;
create policy "etiquetas_andreani_delete_authenticated"
  on storage.objects for delete to authenticated
  using (bucket_id = 'etiquetas-andreani');

-- ---------------------------------------------------------------------------
-- Liberar: deja la etiqueta como huérfana y limpia seguimiento del pedido
-- ---------------------------------------------------------------------------
create or replace function public.liberar_etiqueta_andreani(p_etiqueta_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden_id uuid;
  v_tracking text;
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
    update public.ordenes
    set
      seguimiento = null,
      estado_envio = 'Hacer Etiqueta'
    where id = v_orden_id
      and (seguimiento is null or seguimiento = '' or seguimiento = v_tracking);
  end if;

  return true;
end;
$$;

comment on function public.liberar_etiqueta_andreani(uuid) is
  'Quita la etiqueta del pedido y la deja huérfana. Conserva el PDF.';

grant execute on function public.liberar_etiqueta_andreani(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Eliminar: borra fila (el PDF de storage lo limpia el cliente) y limpia orden
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_etiqueta_andreani(p_etiqueta_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden_id uuid;
  v_tracking text;
  v_pdf_path text;
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
    update public.ordenes
    set
      seguimiento = null,
      estado_envio = 'Hacer Etiqueta'
    where id = v_orden_id
      and (seguimiento is null or seguimiento = '' or seguimiento = v_tracking);
  end if;

  delete from public.envios_andreani_etiquetas
  where id = p_etiqueta_id;

  return v_pdf_path;
end;
$$;

comment on function public.eliminar_etiqueta_andreani(uuid) is
  'Elimina la fila de etiqueta. Devuelve pdf_path para borrar en storage desde el cliente.';

grant execute on function public.eliminar_etiqueta_andreani(uuid) to authenticated, service_role;
