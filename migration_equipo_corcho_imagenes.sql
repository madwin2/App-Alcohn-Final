-- Corcho: imágenes en las ideas (2026-11-05, POL-098).
-- ⚠️ NO aplicar sin permiso explícito del dueño (base = producción compartida con la tienda web).
-- Requiere migration_equipo_corcho.sql, migration_equipo_corcho_v2.sql
-- (es_miembro_equipo, idea_corcho_tiene_votos) y public.es_admin_equipo().
-- Idempotente: se puede correr más de una vez.
--
-- Reglas:
--   · Cualquiera del equipo sube imágenes a cualquier idea (hasta 4 por idea).
--   · Quien la subió la puede sacar mientras la idea no tenga votos.
--   · Con votos solo se agregan (no se sacan). El admin puede sacar cualquiera.
--   · Bucket privado: solo el equipo logueado las ve (URLs firmadas).

-- ═══════════════════════════════════════════════════════════════════════════
-- Bucket privado
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'corcho-ideas',
  'corcho-ideas',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tabla
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ideas_corcho_imagenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.ideas_corcho(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Ruta dentro del bucket corcho-ideas: <idea_id>/<archivo>.
  path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ideas_corcho_imagenes IS
  'Imágenes de ideas del corcho (POL-098). Hasta 4 por idea; archivo en el bucket privado corcho-ideas.';

CREATE INDEX IF NOT EXISTS idx_ideas_corcho_imagenes_idea
  ON public.ideas_corcho_imagenes (idea_id, created_at);

-- Tope de 4 por idea. El lock de la idea evita que dos subidas simultáneas pasen el tope.
CREATE OR REPLACE FUNCTION public.ideas_corcho_imagenes_tope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.ideas_corcho WHERE id = NEW.idea_id FOR UPDATE;
  IF (SELECT count(*) FROM public.ideas_corcho_imagenes WHERE idea_id = NEW.idea_id) >= 4 THEN
    RAISE EXCEPTION 'Esta idea ya tiene 4 imágenes (es el máximo).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ideas_corcho_imagenes_tope ON public.ideas_corcho_imagenes;
CREATE TRIGGER trg_ideas_corcho_imagenes_tope
  BEFORE INSERT ON public.ideas_corcho_imagenes
  FOR EACH ROW EXECUTE FUNCTION public.ideas_corcho_imagenes_tope();

ALTER TABLE public.ideas_corcho_imagenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imagenes_select ON public.ideas_corcho_imagenes;
CREATE POLICY imagenes_select ON public.ideas_corcho_imagenes
  FOR SELECT TO authenticated
  USING (public.es_miembro_equipo());

DROP POLICY IF EXISTS imagenes_insert ON public.ideas_corcho_imagenes;
CREATE POLICY imagenes_insert ON public.ideas_corcho_imagenes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.es_miembro_equipo()
    AND autor_user_id = auth.uid()
    AND path LIKE idea_id::text || '/%'
  );

DROP POLICY IF EXISTS imagenes_delete ON public.ideas_corcho_imagenes;
CREATE POLICY imagenes_delete ON public.ideas_corcho_imagenes
  FOR DELETE TO authenticated
  USING (
    public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR (autor_user_id = auth.uid() AND NOT public.idea_corcho_tiene_votos(idea_id))
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ideas_corcho_imagenes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas_corcho_imagenes;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage: el equipo lee y sube. Un archivo solo se borra cuando ya no tiene
-- fila en ideas_corcho_imagenes (la fila es la que controla el permiso), o si es admin.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS corcho_ideas_select ON storage.objects;
CREATE POLICY corcho_ideas_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'corcho-ideas' AND public.es_miembro_equipo());

DROP POLICY IF EXISTS corcho_ideas_insert ON storage.objects;
CREATE POLICY corcho_ideas_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'corcho-ideas'
    AND public.es_miembro_equipo()
    AND owner = auth.uid()
  );

DROP POLICY IF EXISTS corcho_ideas_delete ON storage.objects;
CREATE POLICY corcho_ideas_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'corcho-ideas'
    AND public.es_miembro_equipo()
    AND (
      public.es_admin_equipo()
      OR NOT EXISTS (
        SELECT 1 FROM public.ideas_corcho_imagenes i WHERE i.path = storage.objects.name
      )
    )
  );
