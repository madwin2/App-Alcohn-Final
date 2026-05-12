-- Snapshot de medidas + precio transferencia al completar mockup (WhatsApp / auditoría).

alter table public.mockup_solicitudes
  add column if not exists medidas_cotizacion_json jsonb null;

comment on column public.mockup_solicitudes.medidas_cotizacion_json is
  'Al completar: [{ label, ancho_cm, alto_cm, precio_transferencia_ars, precio_transferencia_texto }]. El webhook puede leerlo desde la fila.';
