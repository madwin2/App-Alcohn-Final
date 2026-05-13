-- =============================================================================
-- Descuento automático de stock cuando un pedido pasa a "Seguimiento Enviado"
--
-- Contexto: el flujo real de marcar un envío como "Seguimiento Enviado" lo hace
-- la Edge Function `webhook-bot` directamente en la base, salteando todo el
-- código TS de `consumeStockForOrderWhenTrackingSent`. Esto provocaba que el
-- stock (por ejemplo, mangos / ítem MANGO) nunca se descontara en producción.
--
-- Esta migración crea un trigger en `ordenes` que dispara el mismo BOM que
-- ya tiene la app (ver src/lib/supabase/services/stock.service.ts), pero a
-- nivel DB. Así el descuento ocurre se haga el cambio de estado por donde sea
-- (Edge Function, app, SQL manual, etc.).
--
-- Idempotente: si ya hay `stock_movements` tipo 'OUT' para ese order_id, no
-- vuelve a descontar (protege contra doble descuento cuando el código TS de
-- Pedidos también corre antes que el trigger).
-- =============================================================================

-- 1) Función reutilizable: aplica el consumo BOM para un pedido puntual.
create or replace function public.consume_stock_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_existing int;
  v_user_id uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_sello record;
  v_item_type text;
  v_tipo text;
  v_config jsonb;
  v_req jsonb := '{}'::jsonb;
  v_simple_keys text[] := array[
    'CAJA_ABECEDARIO','SOPORTE_ABECEDARIO','MANGO_GOLPE','ALUMINIO_PARA_BASE',
    'BASE_REMACHADORA','TUERCA','VARILLA','PRISIONERO','MANGO','TUBO_80MM','TUBO_125MM'
  ];
  v_key text;
  v_required int;
  v_stock record;
  v_consumed int;
  v_needed int;
  v_avail_adapt int;
  v_avail_raw int;
  v_consume_adapt int;
  v_consume_raw int;
begin
  if p_order_id is null then
    return;
  end if;

  -- Idempotencia: si ya hay movimientos OUT para este pedido, no descontar de nuevo.
  select count(*) into v_existing
  from public.stock_movements
  where order_id = p_order_id and movement_type = 'OUT';

  if v_existing > 0 then
    return;
  end if;

  v_label := substring(p_order_id::text from 1 for 8);

  -- BOM por sello (mismo criterio que requirementsForOrderItem en TS).
  for v_sello in
    select item_type, tipo, item_config
    from public.sellos
    where orden_id = p_order_id
  loop
    v_item_type := coalesce(v_sello.item_type, 'SELLO');
    v_tipo := coalesce(v_sello.tipo, '');
    v_config := coalesce(v_sello.item_config, '{}'::jsonb);

    if v_item_type = 'ABECEDARIO' or v_tipo = 'ABC' then
      v_req := jsonb_set(v_req, '{TUBO_125MM}', to_jsonb(coalesce((v_req->>'TUBO_125MM')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{MANGO}', to_jsonb(coalesce((v_req->>'MANGO')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{VARILLA}', to_jsonb(coalesce((v_req->>'VARILLA')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{PRISIONERO}', to_jsonb(coalesce((v_req->>'PRISIONERO')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{TUERCA}', to_jsonb(coalesce((v_req->>'TUERCA')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{SOPORTE_ABECEDARIO}', to_jsonb(coalesce((v_req->>'SOPORTE_ABECEDARIO')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{CAJA_ABECEDARIO}', to_jsonb(coalesce((v_req->>'CAJA_ABECEDARIO')::int, 0) + 1));
    elsif v_item_type = 'SOLDADOR' then
      if v_config->>'soldadorPower' = '200W' then
        v_req := jsonb_set(v_req, '{SOLDADOR_ADAPTADO_200W}', to_jsonb(coalesce((v_req->>'SOLDADOR_ADAPTADO_200W')::int, 0) + 1));
      else
        v_req := jsonb_set(v_req, '{SOLDADOR_ADAPTADO_100W}', to_jsonb(coalesce((v_req->>'SOLDADOR_ADAPTADO_100W')::int, 0) + 1));
      end if;
    elsif v_item_type = 'MANGO_GOLPE' then
      v_req := jsonb_set(v_req, '{MANGO_GOLPE}', to_jsonb(coalesce((v_req->>'MANGO_GOLPE')::int, 0) + 1));
    elsif v_item_type = 'BASE_REMACHADORA' then
      v_req := jsonb_set(v_req, '{BASE_REMACHADORA}', to_jsonb(coalesce((v_req->>'BASE_REMACHADORA')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{ALUMINIO_PARA_BASE}', to_jsonb(coalesce((v_req->>'ALUMINIO_PARA_BASE')::int, 0) + 1));
    else
      -- SELLO clásico
      v_req := jsonb_set(v_req, '{TUBO_80MM}', to_jsonb(coalesce((v_req->>'TUBO_80MM')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{PRISIONERO}', to_jsonb(coalesce((v_req->>'PRISIONERO')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{VARILLA}', to_jsonb(coalesce((v_req->>'VARILLA')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{MANGO}', to_jsonb(coalesce((v_req->>'MANGO')::int, 0) + 1));
      v_req := jsonb_set(v_req, '{TUERCA}', to_jsonb(coalesce((v_req->>'TUERCA')::int, 0) + 1));
    end if;
  end loop;

  -- Items simples: descontar lo disponible (clamp en 0).
  foreach v_key in array v_simple_keys loop
    v_required := coalesce((v_req->>v_key)::int, 0);
    if v_required <= 0 then
      continue;
    end if;

    select * into v_stock from public.stock_items where item_key = v_key for update;
    if not found then
      continue;
    end if;

    v_consumed := least(coalesce(v_stock.quantity, 0), v_required);
    if v_consumed > 0 then
      update public.stock_items
      set quantity = quantity - v_consumed
      where id = v_stock.id;

      insert into public.stock_movements
        (stock_item_id, movement_type, quantity, note, order_id, created_by)
      values
        (v_stock.id, 'OUT', v_consumed,
         'Consumo por envío (' || v_label || ') [auto]',
         p_order_id, v_user_id);
    end if;
  end loop;

  -- Soldador adaptado 100W: consumir adaptado primero, después raw.
  v_needed := coalesce((v_req->>'SOLDADOR_ADAPTADO_100W')::int, 0);
  if v_needed > 0 then
    select coalesce(quantity, 0) into v_avail_adapt
      from public.stock_items where item_key = 'SOLDADOR_ADAPTADO_100W' for update;
    select coalesce(quantity, 0) into v_avail_raw
      from public.stock_items where item_key = 'SOLDADOR_100W' for update;

    v_consume_adapt := least(coalesce(v_avail_adapt, 0), v_needed);
    v_consume_raw := least(coalesce(v_avail_raw, 0), v_needed - v_consume_adapt);

    if v_consume_adapt > 0 then
      update public.stock_items
      set quantity = quantity - v_consume_adapt
      where item_key = 'SOLDADOR_ADAPTADO_100W';

      insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
      select id, 'OUT', v_consume_adapt,
             'Consumo soldador adaptado por envío (' || v_label || ') [auto]',
             p_order_id, v_user_id
      from public.stock_items where item_key = 'SOLDADOR_ADAPTADO_100W';
    end if;

    if v_consume_raw > 0 then
      update public.stock_items
      set quantity = quantity - v_consume_raw
      where item_key = 'SOLDADOR_100W';

      insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
      select id, 'OUT', v_consume_raw,
             'Consumo para adaptar soldador y enviar (' || v_label || ') [auto]',
             p_order_id, v_user_id
      from public.stock_items where item_key = 'SOLDADOR_100W';
    end if;
  end if;

  -- Soldador adaptado 200W: misma lógica.
  v_needed := coalesce((v_req->>'SOLDADOR_ADAPTADO_200W')::int, 0);
  if v_needed > 0 then
    select coalesce(quantity, 0) into v_avail_adapt
      from public.stock_items where item_key = 'SOLDADOR_ADAPTADO_200W' for update;
    select coalesce(quantity, 0) into v_avail_raw
      from public.stock_items where item_key = 'SOLDADOR_200W' for update;

    v_consume_adapt := least(coalesce(v_avail_adapt, 0), v_needed);
    v_consume_raw := least(coalesce(v_avail_raw, 0), v_needed - v_consume_adapt);

    if v_consume_adapt > 0 then
      update public.stock_items
      set quantity = quantity - v_consume_adapt
      where item_key = 'SOLDADOR_ADAPTADO_200W';

      insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
      select id, 'OUT', v_consume_adapt,
             'Consumo soldador adaptado por envío (' || v_label || ') [auto]',
             p_order_id, v_user_id
      from public.stock_items where item_key = 'SOLDADOR_ADAPTADO_200W';
    end if;

    if v_consume_raw > 0 then
      update public.stock_items
      set quantity = quantity - v_consume_raw
      where item_key = 'SOLDADOR_200W';

      insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
      select id, 'OUT', v_consume_raw,
             'Consumo para adaptar soldador y enviar (' || v_label || ') [auto]',
             p_order_id, v_user_id
      from public.stock_items where item_key = 'SOLDADOR_200W';
    end if;
  end if;
end;
$$;

-- 2) Trigger en `ordenes`: dispara el consumo al pasar a "Seguimiento Enviado".
-- Si la función fallara (datos raros, etc.) no abortamos el UPDATE del estado.
create or replace function public.trg_consume_stock_on_envio()
returns trigger
language plpgsql
as $$
begin
  if NEW.estado_envio = 'Seguimiento Enviado'
     and (OLD.estado_envio is null
          or OLD.estado_envio is distinct from 'Seguimiento Enviado') then
    begin
      perform public.consume_stock_for_order(NEW.id);
    exception when others then
      raise warning 'Auto-consume stock falló para orden %: %', NEW.id, sqlerrm;
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trigger_consume_stock_on_envio on public.ordenes;
create trigger trigger_consume_stock_on_envio
  after update of estado_envio on public.ordenes
  for each row execute function public.trg_consume_stock_on_envio();

-- 3) Backfill: recorrer pedidos ya marcados como "Seguimiento Enviado"
-- que NO tienen movimientos OUT y aplicarles el descuento que faltó.
-- Idempotente: la función ya descarta los pedidos que sí tienen movimientos.
do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select o.id
    from public.ordenes o
    where o.estado_envio = 'Seguimiento Enviado'
      and not exists (
        select 1 from public.stock_movements m
        where m.order_id = o.id and m.movement_type = 'OUT'
      )
  loop
    perform public.consume_stock_for_order(r.id);
    v_count := v_count + 1;
  end loop;

  raise notice 'Backfill stock: % pedidos procesados', v_count;
end;
$$;
