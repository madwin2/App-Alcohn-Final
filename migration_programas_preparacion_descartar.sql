-- Descartar la preparación de un programa y volver al flujo legado.
-- Requiere migration_programas_preparacion_v2.sql. Pendiente de autorización
-- para producción; validado solo en PostgreSQL en memoria.
--
-- El historial (programa_preparacion_revisiones) se conserva. Si después se
-- vuelve a preparar el mismo programa, la numeración sigue desde la última
-- revisión: un informe viejo de Aspire nunca coincide con la revisión nueva.
BEGIN;

CREATE OR REPLACE FUNCTION public.descartar_programa_preparacion(p_programa_id uuid, p_revision_esperada integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.programa%ROWTYPE; current_row public.programa_preparacion%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO p FROM public.programa WHERE id = p_programa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF p.bloqueado OR p.estado_programa IN ('EN_FABRICACION','FINALIZADO') OR EXISTS (
    SELECT 1 FROM public.sellos s WHERE s.programa_id = p_programa_id AND s.estado_fabricacion IN ('Haciendo','Retocar')
  ) THEN RAISE EXCEPTION 'PROGRAM_NOT_EDITABLE'; END IF;
  SELECT * INTO current_row FROM public.programa_preparacion WHERE programa_id = p_programa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_revision_esperada IS DISTINCT FROM current_row.revision THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
  DELETE FROM public.programa_preparacion WHERE programa_id = p_programa_id;
  -- El archivo que hubiera quedado se validó con la preparación: el flujo
  -- legado debe volver a sincronizarlo antes de considerarlo listo.
  UPDATE public.programa SET dirty = true,
    estado_programa = CASE WHEN estado_programa = 'LISTO' THEN 'BORRADOR' ELSE estado_programa END
    WHERE id = p_programa_id;
END $$;
REVOKE ALL ON FUNCTION public.descartar_programa_preparacion(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.descartar_programa_preparacion(uuid,integer) TO authenticated;

-- Igual que v2, salvo la primera fila: arranca desde la última revisión del
-- historial para no chocar con la clave (programa_id, revision).
CREATE OR REPLACE FUNCTION public.guardar_programa_preparacion(p_programa_id uuid, p_revision_esperada integer, p_documento jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.programa%ROWTYPE; current_row public.programa_preparacion%ROWTYPE; next_revision integer; base_revision integer;
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
  SELECT * INTO current_row FROM public.programa_preparacion WHERE programa_id = p_programa_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Sin fila vigente el cliente no conoce revisión: solo acepta 0.
    IF p_revision_esperada <> 0 THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
    SELECT COALESCE(max(revision), 0) INTO base_revision FROM public.programa_preparacion_revisiones WHERE programa_id = p_programa_id;
    INSERT INTO public.programa_preparacion(programa_id, revision, documento) VALUES (p_programa_id, base_revision, p_documento)
      RETURNING * INTO current_row;
  ELSIF current_row.revision <> p_revision_esperada THEN RAISE EXCEPTION 'REVISION_CONFLICT';
  END IF;
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

COMMIT;
