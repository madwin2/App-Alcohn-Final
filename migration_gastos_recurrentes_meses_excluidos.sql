-- Recurrentes: apagar una suscripción solo en un mes (2026-10-07).
-- `meses_excluidos` = meses (YYYY-MM) en que esa recurrente NO se cobró. La app la apaga/prende por mes
-- desde Gastos (borra o crea el registro de ese mes) y la generación diaria respeta la lista.
alter table public.gastos_recurrentes
  add column if not exists meses_excluidos text[] not null default '{}';

create or replace function public.generar_gastos_recurrentes(
  p_hoy date default ((now() at time zone 'America/Argentina/Buenos_Aires'))::date
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inicio_mes date := date_trunc('month', p_hoy)::date;
  v_fin_mes date := (date_trunc('month', p_hoy) + interval '1 month - 1 day')::date;
  v_mes text := to_char(p_hoy, 'YYYY-MM');
  v_count int;
begin
  insert into public.gastos_registros (fecha, proveedor, categoria, concepto, external_ref, moneda, monto, iva_aplica)
  select
    least(v_inicio_mes + (r.dia_del_mes - 1), v_fin_mes),
    'recurrente', r.categoria, r.nombre, r.id::text, r.moneda, r.monto, r.iva_aplica
  from public.gastos_recurrentes r
  where r.activo
    and not (v_mes = any(r.meses_excluidos))
    and least(v_inicio_mes + (r.dia_del_mes - 1), v_fin_mes) <= p_hoy
  on conflict (proveedor, fecha, external_ref, concepto) do update
    set categoria = excluded.categoria,
        moneda = excluded.moneda,
        monto = excluded.monto,
        iva_aplica = excluded.iva_aplica,
        synced_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
