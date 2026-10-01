-- =============================================================================
-- Stock: consumo completo (permite negativo), BOM única en SQL, demanda pendiente
-- y RPCs atómicas.
-- Decisión 2026-10-01: ver docs/04-business-rules/stock.md (BR-STK-002/003/006).
-- Idempotente: create or replace / drop ... if exists.
-- =============================================================================

-- 1) Permitir cantidades negativas (negativo = faltante a cargar/contar).
alter table public.stock_items drop constraint if exists stock_items_quantity_check;

-- 2) BOM por ítem: única fuente de verdad (consumo y demanda).
create or replace function public.stock_bom_for_item(p_item_type text, p_tipo text, p_item_config jsonb)
returns table(item_key text, qty int)
language sql
immutable
set search_path = public
as $$
  select k, 1
  from unnest(
    case
      when coalesce(p_item_type, 'SELLO') = 'ABECEDARIO' or coalesce(p_tipo, '') = 'ABC'
        then array['TUBO_125MM','MANGO','VARILLA','PRISIONERO','TUERCA','SOPORTE_ABECEDARIO','CAJA_ABECEDARIO']
      when p_item_type = 'SOLDADOR'
        then case when coalesce(p_item_config, '{}'::jsonb)->>'soldadorPower' = '200W'
                  then array['SOLDADOR_ADAPTADO_200W'] else array['SOLDADOR_ADAPTADO_100W'] end
      when p_item_type = 'MANGO_GOLPE' then array['MANGO_GOLPE']
      when p_item_type = 'BASE_REMACHADORA' then array['BASE_REMACHADORA','ALUMINIO_PARA_BASE']
      else array['TUBO_80MM','PRISIONERO','VARILLA','MANGO','TUERCA']
    end
  ) as k;
$$;

-- 3) Helper interno: descuenta y registra OUT (atómico).
create or replace function public._stock_apply_out(
  p_item_key text, p_qty int, p_note text, p_order_id uuid, p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_qty is null or p_qty <= 0 then return; end if;
  update public.stock_items set quantity = quantity - p_qty
   where item_key = p_item_key
  returning id into v_id;
  if v_id is null then return; end if;
  insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
  values (v_id, 'OUT', p_qty, p_note, p_order_id, p_user);
end;
$$;
revoke all on function public._stock_apply_out(text, int, text, uuid, uuid) from public, anon, authenticated;

-- 4) Consumo por orden: SIEMPRE registra la BOM completa (puede dejar negativo).
create or replace function public.consume_stock_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_user_id uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  r record;
  v_raw_key text;
  v_avail_adapt int;
  v_avail_raw int;
  v_from_adapt int;
  v_from_raw int;
begin
  if p_order_id is null then return; end if;

  -- Serializa llamadas concurrentes para la misma orden.
  perform pg_advisory_xact_lock(hashtext('consume_stock_for_order:' || p_order_id::text));

  -- Idempotencia: una sola vez por orden.
  if exists (
    select 1 from public.stock_movements
     where order_id = p_order_id and movement_type = 'OUT'
  ) then
    return;
  end if;

  v_label := substring(p_order_id::text from 1 for 8);

  for r in
    select b.item_key, sum(b.qty)::int as qty
      from public.sellos s
      cross join lateral public.stock_bom_for_item(s.item_type, s.tipo, s.item_config) b
     where s.orden_id = p_order_id
     group by b.item_key
  loop
    if r.item_key in ('SOLDADOR_ADAPTADO_100W', 'SOLDADOR_ADAPTADO_200W') then
      -- Primero adaptados disponibles, después crudos disponibles (se adaptan),
      -- y lo que no alcanza queda como negativo en el ADAPTADO.
      v_raw_key := replace(r.item_key, '_ADAPTADO', '');
      select greatest(quantity, 0) into v_avail_adapt from public.stock_items where item_key = r.item_key for update;
      select greatest(quantity, 0) into v_avail_raw   from public.stock_items where item_key = v_raw_key  for update;
      v_from_adapt := least(coalesce(v_avail_adapt, 0), r.qty);
      v_from_raw   := least(coalesce(v_avail_raw, 0), r.qty - v_from_adapt);
      perform public._stock_apply_out(
        r.item_key, r.qty - v_from_raw,
        'Consumo soldador adaptado por envío (' || v_label || ') [auto]', p_order_id, v_user_id);
      perform public._stock_apply_out(
        v_raw_key, v_from_raw,
        'Consumo para adaptar soldador y enviar (' || v_label || ') [auto]', p_order_id, v_user_id);
    else
      perform public._stock_apply_out(
        r.item_key, r.qty,
        'Consumo por envío (' || v_label || ') [auto]', p_order_id, v_user_id);
    end if;
  end loop;
end;
$$;
-- El trigger trg_consume_stock_on_envio / trigger_consume_stock_on_envio NO se toca.

-- 5) Demanda pendiente (BR-STK-003 actualizada).
create or replace function public.get_pending_stock_demand()
returns table(item_key text, qty bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.item_key, sum(b.qty)::bigint
    from public.sellos s
    join public.ordenes o on o.id = s.orden_id
    cross join lateral public.stock_bom_for_item(s.item_type, s.tipo, s.item_config) b
   where (o.estado_envio is null or o.estado_envio <> 'Seguimiento Enviado')
     -- Q-STK-003: más de 2 meses ya se entregó, salvo deudores.
     and (o.created_at >= now() - interval '60 days' or s.estado_venta = 'Deudor')
     -- Si la orden ya tuvo descuento (p. ej. volvió atrás por Rehacer), sus insumos ya se restaron.
     and not exists (
       select 1 from public.stock_movements m
        where m.order_id = o.id and m.movement_type = 'OUT'
     )
   group by b.item_key;
$$;
grant execute on function public.get_pending_stock_demand() to authenticated;

-- 6) Conteo físico (reemplaza el "Guardar" manual): deja la cantidad contada y registra ADJUSTMENT.
create or replace function public.adjust_stock_count(p_item_key text, p_new_quantity int, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_delta int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'El conteo no puede ser negativo';
  end if;
  select id, quantity into v_row from public.stock_items where item_key = p_item_key for update;
  if not found then raise exception 'Ítem de stock inexistente: %', p_item_key; end if;
  v_delta := p_new_quantity - v_row.quantity;
  if v_delta = 0 then return p_new_quantity; end if;
  update public.stock_items set quantity = p_new_quantity where id = v_row.id;
  insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
  values (
    v_row.id, 'ADJUSTMENT', abs(v_delta),
    format('Conteo físico: %s → %s (%s%s)', v_row.quantity, p_new_quantity,
           case when v_delta > 0 then '+' else '-' end, abs(v_delta))
      || coalesce(' · ' || nullif(trim(p_note), ''), ''),
    null, auth.uid()
  );
  return p_new_quantity;
end;
$$;
grant execute on function public.adjust_stock_count(text, int, text) to authenticated;

-- 7) Ingreso de stock atómico (tarea de reposición y futuros ingresos).
create or replace function public.add_stock_inbound(p_item_key text, p_quantity int, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_new int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Ingresá una cantidad mayor a 0.'; end if;
  update public.stock_items set quantity = quantity + p_quantity
   where item_key = p_item_key
  returning id, quantity into v_id, v_new;
  if v_id is null then raise exception 'Ítem de stock inexistente: %', p_item_key; end if;
  insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
  values (v_id, 'IN', p_quantity, coalesce(nullif(trim(p_note), ''), 'Ingreso de stock'), null, auth.uid());
  return v_new;
end;
$$;
grant execute on function public.add_stock_inbound(text, int, text) to authenticated;
