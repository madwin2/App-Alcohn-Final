-- Control de gastos y publicidad — Etapa 1 (PLAN_CONTROL_GASTOS.md)
-- Gastos devengados por día (Meta Ads, Google Ads, OpenAI, recurrentes), pagos de USD por mes,
-- cotización del dólar blue y configuración. Solo la cuenta dueña lee/escribe (mismo criterio que precios).
-- Las edge functions `gastos-sync` y `gastos-ingest-google` escriben con service role.

-- ---------------------------------------------------------------------------
-- Configuración (una fila)
-- ---------------------------------------------------------------------------
create table if not exists public.control_gastos_config (
  id boolean primary key default true check (id),
  objetivo_rentabilidad numeric not null default 0.25,
  iva_pct numeric not null default 0.21,
  otros_impuestos_usd_pct numeric not null default 0.02,
  -- Primer día con gastos automáticos. El resumen de septiembre 2026 cerró el 28/09.
  fecha_inicio date not null default date '2026-09-29',
  -- project_id de OpenAI → nombre legible (ej. {"proj_abc": "Web – imágenes"}).
  openai_proyectos jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.control_gastos_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Cotización diaria del dólar (blue = la que se usa; oficial solo referencia)
-- ---------------------------------------------------------------------------
create table if not exists public.cotizaciones_usd (
  fecha date primary key,
  blue_venta numeric not null check (blue_venta > 0),
  oficial_venta numeric,
  fuente text not null default 'dolarapi',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gastos devengados (un día × una campaña / proyecto / recurrente)
-- El valor en pesos NO se guarda: se calcula al leer (pago del mes o blue de hoy) + IVA.
-- ---------------------------------------------------------------------------
create table if not exists public.gastos_registros (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  proveedor text not null check (proveedor in ('meta_ads', 'google_ads', 'openai', 'recurrente', 'manual')),
  categoria text not null check (categoria in ('publicidad', 'automatizaciones', 'gastos_varios')),
  concepto text not null,
  external_ref text not null default '',
  moneda text not null check (moneda in ('USD', 'ARS')),
  monto numeric not null check (monto >= 0),
  iva_aplica boolean not null default true,
  raw jsonb,
  synced_at timestamptz not null default now(),
  constraint gastos_registros_unq unique (proveedor, fecha, external_ref, concepto)
);

create index if not exists gastos_registros_fecha_idx on public.gastos_registros (fecha);

-- ---------------------------------------------------------------------------
-- Pagos de los dólares de un mes (fija la cotización real del mes)
-- ---------------------------------------------------------------------------
create table if not exists public.gastos_pagos_usd (
  id uuid primary key default gen_random_uuid(),
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  fecha date not null,
  usd numeric not null check (usd > 0),
  cotizacion numeric not null check (cotizacion > 0),
  nota text,
  created_at timestamptz not null default now()
);

create index if not exists gastos_pagos_usd_mes_idx on public.gastos_pagos_usd (mes);

-- ---------------------------------------------------------------------------
-- Gastos recurrentes (suscripciones, servidor, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.gastos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'automatizaciones' check (categoria in ('publicidad', 'automatizaciones', 'gastos_varios')),
  moneda text not null default 'USD' check (moneda in ('USD', 'ARS')),
  monto numeric not null check (monto >= 0),
  iva_aplica boolean not null default true,
  dia_del_mes int not null default 1 check (dia_del_mes between 1 and 31),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Log de sincronizaciones
-- ---------------------------------------------------------------------------
create table if not exists public.gastos_sync_log (
  id bigint generated always as identity primary key,
  proveedor text not null,
  ok boolean not null,
  detalle text,
  filas int,
  created_at timestamptz not null default now()
);

create index if not exists gastos_sync_log_created_idx on public.gastos_sync_log (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: solo la cuenta dueña
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'control_gastos_config', 'cotizaciones_usd', 'gastos_registros',
    'gastos_pagos_usd', 'gastos_recurrentes', 'gastos_sync_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (auth.uid() = public.precios_catalog_owner_user_id())
         with check (auth.uid() = public.precios_catalog_owner_user_id())',
      t || '_owner_all', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Recurrentes → registros del mes (idempotente; refleja ediciones del mes en curso)
-- ---------------------------------------------------------------------------
create or replace function public.generar_gastos_recurrentes(p_hoy date default (now() at time zone 'America/Argentina/Buenos_Aires')::date)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inicio_mes date := date_trunc('month', p_hoy)::date;
  v_fin_mes date := (date_trunc('month', p_hoy) + interval '1 month - 1 day')::date;
  v_count int;
begin
  insert into public.gastos_registros (fecha, proveedor, categoria, concepto, external_ref, moneda, monto, iva_aplica)
  select
    least(v_inicio_mes + (r.dia_del_mes - 1), v_fin_mes),
    'recurrente', r.categoria, r.nombre, r.id::text, r.moneda, r.monto, r.iva_aplica
  from public.gastos_recurrentes r
  where r.activo
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
$$;

revoke all on function public.generar_gastos_recurrentes(date) from public, anon, authenticated;
grant execute on function public.generar_gastos_recurrentes(date) to service_role;

-- ---------------------------------------------------------------------------
-- Cron diario 07:00 AR (10:00 UTC) → edge `gastos-sync`.
-- Toma la anon key de `enviar_meta_conversion` (mismo patrón) para no commitearla.
-- ---------------------------------------------------------------------------
do $$
declare v_key text;
begin
  select substring(pg_get_functiondef('public.enviar_meta_conversion(uuid)'::regprocedure) from 'v_anon_key text := ''([^'']+)''') into v_key;
  if v_key is null then raise exception 'no se encontró la anon key'; end if;
  perform cron.unschedule('gastos-sync-diario') where exists (select 1 from cron.job where jobname = 'gastos-sync-diario');
  perform cron.schedule(
    'gastos-sync-diario',
    '0 10 * * *',
    format($c$select net.http_post(
      url := 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/gastos-sync',
      body := '{"origen":"cron"}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s')
    );$c$, v_key)
  );
end $$;
