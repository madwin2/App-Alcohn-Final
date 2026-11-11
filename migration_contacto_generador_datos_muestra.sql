-- =============================================================
-- Contacto comercial del generador web: mandar la muestra al bot.
-- Aplicada el 25/10/2026 en Supabase (migración generador_contacto_datos_muestra).
-- =============================================================
-- El aviso generador_muestras_contacto llevaba solo solicitud_mockup_id.
-- Ahora también lleva archivo_base_url, imagen_optimizada_url, los mockups,
-- material y medidas_cotizacion, para que Francisco (bot) vea la muestra
-- del cliente sin pedirle el logo. El bot copia las imágenes al recibirlas
-- (las URLs firmadas vencen a los 7 días). Único cambio: bloque A.
-- =============================================================

CREATE OR REPLACE FUNCTION public.procesar_contactos_comerciales_pendientes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_nombre text;
  v_enviados int := 0;
  v_omitidos int := 0;
BEGIN
  -- A) Muestras web: sin orden, o con orden que sigue sin pagar después de 10 min.
  FOR r IN
    SELECT m.id, m.whatsapp, m.nombre_muestra, m.nombre_slug,
           m.archivo_base_url, m.imagen_optimizada_url,
           m.mockup_cuero_url, m.mockup_madera_url,
           m.material, m.medidas_cotizacion_json
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
      jsonb_strip_nulls(jsonb_build_object(
        'solicitud_mockup_id', r.id::text,
        'archivo_base_url', r.archivo_base_url,
        'imagen_optimizada_url', r.imagen_optimizada_url,
        'mockup_cuero_url', r.mockup_cuero_url,
        'mockup_madera_url', r.mockup_madera_url,
        'material', r.material,
        'medidas_cotizacion', r.medidas_cotizacion_json
      )),
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
$function$;
