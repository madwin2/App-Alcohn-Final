-- Fix: net.http_post requiere body jsonb (no text)
-- Ejecutar en SQL Editor si ya corriste migration_meta_conversion_api.sql

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS public.enviar_meta_conversion(uuid);

CREATE OR REPLACE FUNCTION public.enviar_meta_conversion(p_orden_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/meta-conversion';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnYnlyZWpmY3FlYXJldnZ6ZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNzQwNDAsImV4cCI6MjA3NTk1MDA0MH0.H-JC5wb3b4xSKSXGY8Sgh4_qyapWJgUZORgvK7ogCAM';
DECLARE
  v_request_id bigint;
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.meta_conversion_log WHERE orden_id = p_orden_id) THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object('orden_id', p_orden_id::text),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    )
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;
