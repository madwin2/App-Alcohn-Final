-- Empezar a fabricar (sello a Haciendo) sin exigir el archivo .crv3d subido.
-- Caso real (2026-10-26): Aspire sincronizó la revisión, se mecanizó, pero la
-- subida del archivo falló por internet. El archivo queda pendiente (la mesa lo
-- sigue pidiendo) y no bloquea registrar lo que pasó en la máquina.
-- Se siguen exigiendo: revisión sincronizada por Aspire, recálculo y auxiliares
-- verificados, sin errores y contenido vigente.
BEGIN;
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
  -- El archivo de Aspire (archivo_revision) ya no se exige: puede subirse después.
  IF prep.revision_sincronizada IS DISTINCT FROM prep.revision
    OR prep.observacion->>'recalculated' IS DISTINCT FROM 'true'
    OR prep.observacion#>>'{execution,verified}' IS DISTINCT FROM 'true'
    OR prep.observacion#>>'{execution,rulesVersion}' IS DISTINCT FROM '1'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(prep.observacion->'issues','[]'::jsonb)) issue WHERE issue->>'severity'='error')
    OR NOT public.programa_preparacion_contenido_vigente(NEW.programa_id)
    THEN RAISE EXCEPTION 'Sincronizá y validá la preparación vigente antes de iniciar fabricación'; END IF;
  RETURN NEW;
END $$;
COMMIT;
