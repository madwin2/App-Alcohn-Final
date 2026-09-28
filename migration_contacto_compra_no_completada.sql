-- Mensaje a quien llegó al checkout y no pagó (mismo webhook generador_muestras_contacto).
-- Reemplaza procesar_contactos_comerciales_pendientes(); el cron comercial-contacto-pendientes no cambia.
--
-- LOOKBACK: interval '1 hour' (no '3 days') a propósito.
-- Julian ya escribió a mano a los que no pagaron en los últimos 3 días;
-- con '3 days' el cron los volvería a contactar. Cuando quieras ampliar el
-- margen ante caídas del cron, cambiá las dos líneas a interval '3 days' y
-- volvé a correr este archivo.

CREATE OR REPLACE FUNCTION public.procesar_contactos_comerciales_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_nombre text;
  v_enviados int := 0;
  v_omitidos int := 0;
BEGIN
  -- A) Muestras web: sin orden, o con orden que sigue sin pagar después de 10 min.
  FOR r IN
    SELECT m.id, m.whatsapp, m.nombre_muestra, m.nombre_slug
    FROM public.mockup_solicitudes m
    WHERE m.origen = 'web'
      AND m.estado IN ('completado', 'pendiente_aprobacion')
      AND NULLIF(trim(m.whatsapp), '') IS NOT NULL
      AND (m.metadata_web->>'contacto_comercial_enviado_at') IS NULL
      AND (m.metadata_web->>'contacto_comercial_omitido_at') IS NULL
      AND (m.metadata_web->>'contacto_comercial_eligible_at') IS NOT NULL
      AND (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz <= now()
      AND (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz > now() - interval '1 hour'
      AND (
        m.orden_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.ordenes o
          WHERE o.id = m.orden_id
            AND o.estado_pago_web IS DISTINCT FROM 'pagado'
            AND o.created_at <= now() - interval '10 minutes'
        )
      )
      -- Si el cliente ya pagó otra orden, no escribir.
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes op
        WHERE op.cliente_id = m.cliente_id
          AND op.estado_pago_web = 'pagado'
          AND op.created_at >= m.created_at - interval '1 day'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.comercial_exclusiones e
        WHERE e.entity_type = 'mockup' AND e.entity_id = m.id
      )
    ORDER BY (m.metadata_web->>'contacto_comercial_eligible_at')::timestamptz ASC
    LIMIT 15
  LOOP
    IF public.contacto_comercial_enviado_recientemente(r.whatsapp, 7) THEN
      UPDATE public.mockup_solicitudes
      SET metadata_web = COALESCE(metadata_web, '{}'::jsonb) || jsonb_build_object(
        'contacto_comercial_omitido_at', to_jsonb(now()),
        'contacto_comercial_omitido_motivo', 'cooldown_7_dias'
      )
      WHERE id = r.id;
      v_omitidos := v_omitidos + 1;
      CONTINUE;
    END IF;

    v_nombre := COALESCE(NULLIF(trim(r.nombre_muestra), ''), NULLIF(trim(r.nombre_slug), ''), 'Cliente');

    PERFORM public.enviar_webhook_pedido(
      'generador_muestras_contacto',
      trim(r.whatsapp),
      v_nombre,
      jsonb_build_object('solicitud_mockup_id', r.id::text),
      NULL,
      NULL
    );

    UPDATE public.mockup_solicitudes
    SET metadata_web = COALESCE(metadata_web, '{}'::jsonb) || jsonb_build_object(
      'contacto_comercial_enviado_at', to_jsonb(now()),
      'contacto_comercial_tipo', 'generador_muestras_contacto'
    )
    WHERE id = r.id;

    v_enviados := v_enviados + 1;
  END LOOP;

  -- B) Órdenes web sin muestra vinculada (ej. internacionales) que no pagaron en 10 min.
  FOR r IN
    SELECT o.id, c.nombre, c.telefono
    FROM public.ordenes o
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE o.origen = 'Web'
      AND o.mockup_solicitud_id IS NULL
      AND o.estado_pago_web IN ('pendiente', 'pago_fallido', 'esperando_comprobante')
      AND o.created_at <= now() - interval '10 minutes'
      AND o.created_at > now() - interval '1 hour'
      AND (o.notas_web->>'contacto_comercial_enviado_at') IS NULL
      AND NULLIF(trim(c.telefono), '') IS NOT NULL
      -- Ya pagó otra orden (checkout duplicado) → no escribir.
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes op
        WHERE op.cliente_id = o.cliente_id
          AND op.id <> o.id
          AND op.estado_pago_web = 'pagado'
          AND op.created_at >= o.created_at - interval '1 day'
      )
      -- Ya le escribimos por otra orden en los últimos 7 días → no repetir.
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes o2
        WHERE o2.cliente_id = o.cliente_id
          AND o2.id <> o.id
          AND (o2.notas_web->>'contacto_comercial_enviado_at')::timestamptz > now() - interval '7 days'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.comercial_exclusiones e
        WHERE (e.entity_type = 'orden' AND e.entity_id = o.id)
           OR (e.entity_type = 'cliente' AND e.entity_id = o.cliente_id)
      )
    ORDER BY o.created_at ASC
    LIMIT 15
  LOOP
    PERFORM public.enviar_webhook_pedido(
      'generador_muestras_contacto',
      trim(r.telefono),
      public.primer_nombre_comercial(r.nombre),
      jsonb_build_object('orden_id', r.id::text),
      r.id,
      NULL
    );

    UPDATE public.ordenes
    SET notas_web = COALESCE(notas_web, '{}'::jsonb) || jsonb_build_object(
      'contacto_comercial_enviado_at', to_jsonb(now())
    )
    WHERE id = r.id;

    v_enviados := v_enviados + 1;
  END LOOP;

  RETURN jsonb_build_object('enviados', v_enviados, 'omitidos', v_omitidos, 'at', now());
END;
$$;
