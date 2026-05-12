-- Medición del trazo del logo y proporción en Supabase (ejecutar si la tabla ya existía).

alter table public.mockup_solicitudes
  add column if not exists logo_trazo_ancho_px integer;

alter table public.mockup_solicitudes
  add column if not exists logo_trazo_alto_px integer;

alter table public.mockup_solicitudes
  add column if not exists logo_trazo_ratio_w_h double precision;

alter table public.mockup_solicitudes
  add column if not exists logo_trazo_ratio_label text;

alter table public.mockup_solicitudes
  add column if not exists logo_trazo_bbox_fallback boolean;

comment on column public.mockup_solicitudes.logo_trazo_ancho_px is 'Ancho del bbox de tinta en px (imagen optimizada).';
comment on column public.mockup_solicitudes.logo_trazo_alto_px is 'Alto del bbox de tinta en px.';
comment on column public.mockup_solicitudes.logo_trazo_ratio_w_h is 'Relación ancho/alto del trazo.';
comment on column public.mockup_solicitudes.logo_trazo_ratio_label is 'Proporción reducida legible, ej. 3 : 2.';
comment on column public.mockup_solicitudes.logo_trazo_bbox_fallback is 'True si no hubo tinta clara y se usó el lienzo completo.';
