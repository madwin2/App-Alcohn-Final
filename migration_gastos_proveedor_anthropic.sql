-- Gastos automáticos: suma Claude (API de Anthropic) como proveedor (2026-10-07).
-- Lo carga `gastos-sync` desde el Cost Report de la Admin API (secreto ANTHROPIC_ADMIN_KEY).
alter table public.gastos_registros drop constraint if exists gastos_registros_proveedor_check;
alter table public.gastos_registros add constraint gastos_registros_proveedor_check
  check (proveedor = any (array['meta_ads', 'google_ads', 'openai', 'anthropic', 'recurrente', 'manual']));
