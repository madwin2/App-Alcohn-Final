-- Preparación visual y sincronización incremental. Pendiente de autorización
-- para producción: solo se valida en PostgreSQL local; la app no lo ejecuta.
BEGIN;

CREATE TABLE IF NOT EXISTS public.programa_preparacion (
  programa_id uuid PRIMARY KEY REFERENCES public.programa(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  documento jsonb NOT NULL,
  revision_sincronizada integer,
  archivo_revision integer,
  observacion jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CHECK (jsonb_typeof(documento) = 'object')
);
CREATE TABLE IF NOT EXISTS public.programa_preparacion_revisiones (
  programa_id uuid NOT NULL REFERENCES public.programa(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  documento jsonb NOT NULL,
  observacion jsonb,
  evento_id text,
  eventos_procesados text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (programa_id, revision)
);
ALTER TABLE public.programa_preparacion_revisiones ADD COLUMN IF NOT EXISTS eventos_procesados text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.programa_preparacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programa_preparacion_revisiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programa_preparacion, public.programa_preparacion_revisiones FROM anon, authenticated;
GRANT SELECT ON public.programa_preparacion, public.programa_preparacion_revisiones TO authenticated;
GRANT ALL ON public.programa_preparacion, public.programa_preparacion_revisiones TO service_role;
DROP POLICY IF EXISTS preparacion_read ON public.programa_preparacion;
CREATE POLICY preparacion_read ON public.programa_preparacion FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS preparacion_revisiones_read ON public.programa_preparacion_revisiones;
CREATE POLICY preparacion_revisiones_read ON public.programa_preparacion_revisiones FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.guardar_programa_preparacion(p_programa_id uuid, p_revision_esperada integer, p_documento jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.programa%ROWTYPE; current_row public.programa_preparacion%ROWTYPE; next_revision integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_revision_esperada IS NULL OR p_revision_esperada < 0 THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  SELECT * INTO p FROM public.programa WHERE id = p_programa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF p.bloqueado OR p.estado_programa IN ('EN_FABRICACION','FINALIZADO') OR EXISTS (
    SELECT 1 FROM public.sellos s WHERE s.programa_id = p_programa_id AND s.estado_fabricacion IN ('Haciendo','Retocar')
  ) THEN RAISE EXCEPTION 'PROGRAM_NOT_EDITABLE'; END IF;
  IF p_documento->>'programId' IS DISTINCT FROM p_programa_id::text
    OR p_documento->>'machine' IS DISTINCT FROM p.maquina::text
    OR p_documento->>'version' IS DISTINCT FROM '2'
    OR jsonb_typeof(p_documento->'stamps') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_documento->'stamps') > 500
    OR octet_length(p_documento::text) > 4000000 THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_documento->'stamps') entry
      WHERE NOT EXISTS (SELECT 1 FROM public.sellos s WHERE s.id::text = entry->>'selloId' AND s.programa_id = p_programa_id))
    OR EXISTS (SELECT 1 FROM public.sellos s WHERE s.programa_id = p_programa_id
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_documento->'stamps') entry WHERE entry->>'selloId' = s.id::text))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_documento->'stamps') entry GROUP BY entry->>'selloId' HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'PROGRAM_CONTENT_CHANGED'; END IF;
  INSERT INTO public.programa_preparacion(programa_id, documento) VALUES (p_programa_id, p_documento) ON CONFLICT DO NOTHING;
  SELECT * INTO current_row FROM public.programa_preparacion WHERE programa_id = p_programa_id FOR UPDATE;
  IF current_row.revision <> p_revision_esperada THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  next_revision := current_row.revision + 1;
  UPDATE public.programa_preparacion SET revision = next_revision, documento = p_documento, updated_at = now(), updated_by = auth.uid()
    WHERE programa_id = p_programa_id RETURNING * INTO current_row;
  INSERT INTO public.programa_preparacion_revisiones(programa_id, revision, documento, created_by)
    VALUES (p_programa_id, next_revision, p_documento, auth.uid());
  UPDATE public.programa SET dirty = true, estado_programa = CASE WHEN estado_programa = 'LISTO' THEN 'BORRADOR' ELSE estado_programa END
    WHERE id = p_programa_id;
  RETURN to_jsonb(current_row);
END $$;
REVOKE ALL ON FUNCTION public.guardar_programa_preparacion(uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_programa_preparacion(uuid,integer,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_programa_preparacion_resultado(p_programa_id uuid, p_revision integer, p_observacion jsonb, p_evento_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_row public.programa_preparacion%ROWTYPE; existing_event text; seen_events text[]; ready boolean;
BEGIN
  PERFORM 1 FROM public.programa WHERE id=p_programa_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.programa WHERE id=p_programa_id AND (bloqueado OR estado_programa IN ('EN_FABRICACION','FINALIZADO')))
    OR EXISTS (SELECT 1 FROM public.sellos WHERE programa_id=p_programa_id AND estado_fabricacion IN ('Haciendo','Retocar'))
    THEN RAISE EXCEPTION 'PROGRAM_NOT_EDITABLE'; END IF;
  SELECT * INTO current_row FROM public.programa_preparacion WHERE programa_id = p_programa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREPARATION_NOT_FOUND'; END IF;
  SELECT evento_id, eventos_procesados INTO existing_event, seen_events FROM public.programa_preparacion_revisiones WHERE programa_id = p_programa_id AND revision = p_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVISION_NOT_FOUND'; END IF;
  IF p_evento_id IS NULL OR p_evento_id = '' THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
  IF existing_event = p_evento_id OR p_evento_id = ANY(seen_events) THEN
    RETURN jsonb_build_object('ok',true,'duplicate',true,'current',current_row.revision = p_revision AND existing_event = p_evento_id);
  END IF;
  IF existing_event IS NOT NULL AND NOT existing_event = ANY(seen_events) THEN seen_events := array_append(seen_events, existing_event); END IF;
  UPDATE public.programa_preparacion_revisiones SET observacion = p_observacion, evento_id = p_evento_id, eventos_procesados=array_append(seen_events,p_evento_id)
    WHERE programa_id = p_programa_id AND revision = p_revision;
  ready := current_row.revision = p_revision AND p_observacion->>'recalculated' = 'true'
    AND p_observacion#>>'{execution,verified}' = 'true' AND p_observacion#>>'{execution,rulesVersion}' = '1'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_observacion->'issues','[]'::jsonb)) issue WHERE issue->>'severity' = 'error');
  -- Un reporte viejo se conserva en su revisión y nunca pisa el observado actual.
  IF current_row.revision = p_revision THEN
    UPDATE public.programa_preparacion SET observacion = p_observacion, archivo_revision=NULL,
      revision_sincronizada = CASE WHEN ready THEN p_revision ELSE revision_sincronizada END
      WHERE programa_id = p_programa_id;
    UPDATE public.programa SET dirty=true,
      estado_programa=CASE WHEN estado_programa='LISTO' THEN 'BORRADOR' ELSE estado_programa END
      WHERE id=p_programa_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'current',current_row.revision = p_revision,'ready',ready);
END $$;
REVOKE ALL ON FUNCTION public.registrar_programa_preparacion_resultado(uuid,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_programa_preparacion_resultado(uuid,integer,jsonb,text) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES ('programas-plantillas','programas-plantillas',false,5242880) ON CONFLICT (id) DO NOTHING;
-- Retira la firma previa: no dejar un camino que apruebe solo por revisión.
DROP FUNCTION IF EXISTS public.confirmar_programa_preparacion_archivo(uuid,integer,text,text,text);
CREATE OR REPLACE FUNCTION public.confirmar_programa_preparacion_archivo(p_programa_id uuid, p_revision integer, p_archivo_url text, p_nombre text, p_preview_url text, p_evento_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_row public.programa_preparacion%ROWTYPE; p public.programa%ROWTYPE; current_event text;
BEGIN
  SELECT * INTO p FROM public.programa WHERE id = p_programa_id FOR UPDATE;
  SELECT * INTO current_row FROM public.programa_preparacion WHERE programa_id = p_programa_id FOR UPDATE;
  IF NOT FOUND OR current_row.revision <> p_revision OR current_row.revision_sincronizada IS DISTINCT FROM p_revision
    OR current_row.observacion->>'recalculated' IS DISTINCT FROM 'true'
    OR current_row.observacion#>>'{execution,verified}' IS DISTINCT FROM 'true'
    OR current_row.observacion#>>'{execution,rulesVersion}' IS DISTINCT FROM '1'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(current_row.observacion->'issues','[]'::jsonb)) issue WHERE issue->>'severity' = 'error')
    THEN RAISE EXCEPTION 'REVISION_NOT_READY'; END IF;
  SELECT evento_id INTO current_event FROM public.programa_preparacion_revisiones
    WHERE programa_id=p_programa_id AND revision=p_revision;
  IF p_evento_id IS NULL OR p_evento_id = '' OR current_event IS DISTINCT FROM p_evento_id
    THEN RAISE EXCEPTION 'RESULT_NOT_CURRENT'; END IF;
  IF p.bloqueado OR p.estado_programa IN ('EN_FABRICACION','FINALIZADO') OR EXISTS (
    SELECT 1 FROM public.sellos s WHERE s.programa_id = p_programa_id AND s.estado_fabricacion IN ('Haciendo','Retocar')
  ) THEN RAISE EXCEPTION 'PROGRAM_NOT_EDITABLE'; END IF;
  IF NOT public.programa_preparacion_contenido_vigente(p_programa_id) THEN RAISE EXCEPTION 'PROGRAM_CONTENT_CHANGED'; END IF;
  UPDATE public.programa_preparacion SET archivo_revision=p_revision WHERE programa_id=p_programa_id;
  UPDATE public.programa SET archivo_aspire_url = p_archivo_url, archivo_aspire_nombre = p_nombre, archivo_aspire_subido_at = now(),
    preview_url = p_preview_url, dirty = false, estado_programa = CASE WHEN estado_programa = 'BORRADOR' THEN 'LISTO' ELSE estado_programa END
    WHERE id = p_programa_id;
END $$;
REVOKE ALL ON FUNCTION public.confirmar_programa_preparacion_archivo(uuid,integer,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_programa_preparacion_archivo(uuid,integer,text,text,text,text) TO service_role;
-- Verifica pertenencia y vector actual; las medidas vendidas no se reescriben.
CREATE OR REPLACE FUNCTION public.programa_preparacion_contenido_vigente(p_programa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.programa p JOIN public.programa_preparacion prep ON prep.programa_id=p.id
    WHERE p.id=p_programa_id AND prep.documento->>'machine'=p.maquina::text) AND NOT EXISTS (
    SELECT 1 FROM public.programa_preparacion p CROSS JOIN LATERAL jsonb_array_elements(p.documento->'stamps') item
    WHERE p.programa_id=p_programa_id AND (item->>'excluded'='true' OR NOT EXISTS (
      SELECT 1 FROM public.sellos s WHERE s.programa_id=p_programa_id AND s.id::text=item->>'selloId'
        AND COALESCE(s.archivo_vector_preview,'')=item->>'sourceUrl'
    ))
  ) AND NOT EXISTS (
    SELECT 1 FROM public.sellos s WHERE s.programa_id=p_programa_id AND NOT EXISTS (
      SELECT 1 FROM public.programa_preparacion p CROSS JOIN LATERAL jsonb_array_elements(p.documento->'stamps') item
      WHERE p.programa_id=p_programa_id AND item->>'selloId'=s.id::text AND item->>'excluded'='false'
    )
  );
$$;
REVOKE ALL ON FUNCTION public.programa_preparacion_contenido_vigente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.programa_preparacion_contenido_vigente(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validar_inicio_preparacion_programa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prep public.programa_preparacion%ROWTYPE; p public.programa%ROWTYPE;
BEGIN
  IF NEW.programa_id IS NULL OR NEW.estado_fabricacion IS NOT DISTINCT FROM OLD.estado_fabricacion
    OR NEW.estado_fabricacion <> 'Haciendo' THEN RETURN NEW; END IF;
  -- Serializa con guardar/confirmar. dirty no sirve como prueba aquí: el
  -- trigger legado lo pone en true al actualizar cada sello de la cascada.
  SELECT * INTO p FROM public.programa WHERE id=NEW.programa_id FOR UPDATE;
  SELECT * INTO prep FROM public.programa_preparacion WHERE programa_id=NEW.programa_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF prep.archivo_revision IS DISTINCT FROM prep.revision OR prep.revision_sincronizada IS DISTINCT FROM prep.revision
    OR prep.observacion->>'recalculated' IS DISTINCT FROM 'true'
    OR prep.observacion#>>'{execution,verified}' IS DISTINCT FROM 'true'
    OR prep.observacion#>>'{execution,rulesVersion}' IS DISTINCT FROM '1'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(prep.observacion->'issues','[]'::jsonb)) issue WHERE issue->>'severity'='error')
    OR NOT public.programa_preparacion_contenido_vigente(NEW.programa_id)
    THEN RAISE EXCEPTION 'Sincronizá y validá la preparación vigente antes de iniciar fabricación'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validar_inicio_preparacion_programa ON public.sellos;
CREATE TRIGGER validar_inicio_preparacion_programa BEFORE UPDATE OF estado_fabricacion ON public.sellos
  FOR EACH ROW EXECUTE FUNCTION public.validar_inicio_preparacion_programa();
DROP POLICY IF EXISTS programa_templates_read ON storage.objects;
CREATE POLICY programa_templates_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'programas-plantillas');
DROP POLICY IF EXISTS programa_templates_insert ON storage.objects;
CREATE POLICY programa_templates_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'programas-plantillas');
-- Objetos inmutables por UUID; no se habilita escritura anónima ni reemplazo.
COMMIT;
