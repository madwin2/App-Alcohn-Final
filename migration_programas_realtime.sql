-- Habilitar Realtime en tablas usadas por la pestaña Programas
-- (para que cambios de otra PC / mutaciones locales se reflejen sin F5).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'programa'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE programa;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sellos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sellos;
  END IF;
END $$;
