-- Si ya creaste mockup_solicitudes con whatsapp NOT NULL, ejecutá esto una vez en Supabase.

alter table public.mockup_solicitudes
  alter column whatsapp drop not null;
