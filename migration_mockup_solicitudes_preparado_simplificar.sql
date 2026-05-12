-- Si ya tenés la tabla mockup_solicitudes, ejecutá esto una vez en Supabase.

alter table public.mockup_solicitudes
  add column if not exists preparado_con_simplificar_ia boolean not null default false;

comment on column public.mockup_solicitudes.preparado_con_simplificar_ia is
  'True si la imagen optimizada se generó con el flujo Simplificar (IA); Rehacer debe volver a llamar a simplify-logo.';
