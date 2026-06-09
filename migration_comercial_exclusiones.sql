-- Exclusiones del panel Comercial Web (datos de prueba / ruido).
-- No borra registros de negocio: solo los oculta de métricas y listas comerciales.

CREATE TABLE IF NOT EXISTS public.comercial_exclusiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('cliente', 'mockup', 'orden')),
  entity_id uuid NOT NULL,
  motivo text,
  excluido_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comercial_exclusiones_entity_unique UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_comercial_exclusiones_entity
  ON public.comercial_exclusiones (entity_type, entity_id);

COMMENT ON TABLE public.comercial_exclusiones IS
  'Registros ocultos del panel Comercial Web y sus KPIs (p. ej. pruebas internas).';

ALTER TABLE public.comercial_exclusiones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comercial_exclusiones'
      AND policyname = 'comercial_exclusiones_authenticated_all'
  ) THEN
    CREATE POLICY comercial_exclusiones_authenticated_all
      ON public.comercial_exclusiones
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
