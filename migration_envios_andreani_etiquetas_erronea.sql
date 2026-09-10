-- Etiquetas Andreani erróneas (duplicadas, mal generadas, no usadas).
-- Dejan de aparecer en Huérfanos; el PDF se conserva para asignarlas después.
-- Ejecutar en Supabase SQL Editor.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.envios_andreani_etiquetas'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%estado%'
  loop
    execute format('alter table public.envios_andreani_etiquetas drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.envios_andreani_etiquetas
  add constraint envios_andreani_etiquetas_estado_check
  check (estado in ('asignada', 'huerfano', 'erronea'));

comment on table public.envios_andreani_etiquetas is
  'Etiquetas Zebra bajadas de Andreani. asignada = match con orden; huerfano = sin match único; erronea = descartada a mano (PDF conservado).';

comment on column public.envios_andreani_etiquetas.estado is
  'asignada | huerfano | erronea';

-- ---------------------------------------------------------------------------
-- Marcar huérfano (o ya errónea) como errónea. No toca pedidos.
-- ---------------------------------------------------------------------------
drop function if exists public.marcar_etiqueta_andreani_erronea(uuid);

create or replace function public.marcar_etiqueta_andreani_erronea(
  p_etiqueta_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if p_etiqueta_id is null then
    return false;
  end if;

  select estado
    into v_estado
  from public.envios_andreani_etiquetas
  where id = p_etiqueta_id
  for update;

  if not found then
    raise exception 'Etiqueta inexistente';
  end if;

  if v_estado = 'asignada' then
    raise exception 'Liberá la etiqueta del pedido antes de marcarla como errónea';
  end if;

  if v_estado = 'erronea' then
    return true;
  end if;

  update public.envios_andreani_etiquetas
  set
    orden_id = null,
    estado = 'erronea',
    asignado_en = null,
    nota = coalesce(nullif(btrim(nota), ''), 'Marcada como errónea')
  where id = p_etiqueta_id;

  return true;
end;
$$;

comment on function public.marcar_etiqueta_andreani_erronea(uuid) is
  'Pasa una etiqueta huérfana a errónea. El PDF se conserva; deja de listarse en Huérfanos.';

grant execute on function public.marcar_etiqueta_andreani_erronea(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Devolver una errónea a huérfano (por si se marcó de más).
-- ---------------------------------------------------------------------------
drop function if exists public.restaurar_etiqueta_andreani_huerfano(uuid);

create or replace function public.restaurar_etiqueta_andreani_huerfano(
  p_etiqueta_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if p_etiqueta_id is null then
    return false;
  end if;

  select estado
    into v_estado
  from public.envios_andreani_etiquetas
  where id = p_etiqueta_id
  for update;

  if not found then
    raise exception 'Etiqueta inexistente';
  end if;

  if v_estado <> 'erronea' then
    raise exception 'Solo se pueden restaurar etiquetas erróneas';
  end if;

  update public.envios_andreani_etiquetas
  set
    estado = 'huerfano',
    orden_id = null,
    asignado_en = null,
    nota = 'Restaurada a huérfano'
  where id = p_etiqueta_id;

  return true;
end;
$$;

comment on function public.restaurar_etiqueta_andreani_huerfano(uuid) is
  'Devuelve una etiqueta errónea a huérfano para volver a asignarla desde esa lista.';

grant execute on function public.restaurar_etiqueta_andreani_huerfano(uuid) to authenticated, service_role;
