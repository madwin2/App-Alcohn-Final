-- =============================================================
-- Seguimiento postventa (seguimiento_cliente_recompra): mandar al bot qué compró.
-- Aplicada el 25/10/2026 en Supabase (migración seguimiento_recompra_datos_compra).
-- =============================================================
-- Agrega 'compra' al aviso: lista legible de lo fabricado en la orden
-- (ej. "sello Maderas Rosa 3.5x2.5 cm", "base para remachadora"), para que
-- Francisco (bot) haga el seguimiento hablando del sello del cliente.
-- Único cambio respecto de la versión anterior: el campo 'compra' en el jsonb.
-- =============================================================

CREATE OR REPLACE FUNCTION public.procesar_seguimientos_clientes_pendientes(p_limite integer DEFAULT 10, p_enviado_por text DEFAULT 'cron'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_enviados int := 0;
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 10), 1), 50);
  v_nombre text;
BEGIN
  FOR r IN
    SELECT *
    FROM public.v_comercial_clientes_seguimiento_elegibles
    ORDER BY random()
    LIMIT v_limite
  LOOP
    v_nombre := public.primer_nombre_comercial(r.nombre);

    -- compra: lo que se fabricó en la orden, para que Francisco (bot) haga
    -- el seguimiento hablando de SU sello (25/10/2026).
    PERFORM public.enviar_webhook_pedido(
      'seguimiento_cliente_recompra',
      trim(r.telefono),
      v_nombre,
      jsonb_build_object(
        'cliente_id', r.cliente_id::text,
        'orden_id', r.orden_id::text,
        'nombre', v_nombre,
        'seguimiento_comercial', true,
        'compra', COALESCE((
          SELECT jsonb_agg(trim(concat_ws(' ',
            CASE s.item_type
              WHEN 'SELLO' THEN 'sello'
              WHEN 'ABECEDARIO' THEN 'abecedario'
              WHEN 'SOLDADOR' THEN 'calentador eléctrico'
              WHEN 'MANGO_GOLPE' THEN 'mango de golpe'
              WHEN 'BASE_REMACHADORA' THEN 'base para remachadora'
              ELSE lower(COALESCE(s.item_type, 'sello'))
            END,
            NULLIF(trim(s.diseno), ''),
            CASE WHEN COALESCE(s.item_type, 'SELLO') = 'SELLO' AND s.ancho_real >= 0.5 AND s.largo_real >= 0.5
              THEN (s.ancho_real::float8)::text || 'x' || (s.largo_real::float8)::text || ' cm' END
          )))
          FROM public.sellos s
          WHERE s.orden_id = r.orden_id
        ), '[]'::jsonb)
      ),
      NULL,
      NULL
    );

    INSERT INTO public.comercial_cliente_seguimientos (
      cliente_id,
      orden_id,
      telefono,
      nombre,
      tipo,
      estado,
      enviado_por,
      datos
    )
    VALUES (
      r.cliente_id,
      r.orden_id,
      trim(r.telefono),
      v_nombre,
      'seguimiento_cliente_recompra',
      'enviado',
      COALESCE(NULLIF(trim(p_enviado_por), ''), 'cron'),
      jsonb_build_object(
        'cliente_id', r.cliente_id::text,
        'orden_id', r.orden_id::text,
        'orden_fecha', r.orden_fecha,
        'estado_orden', r.estado_orden,
        'estado_envio', r.estado_envio
      )
    )
    ON CONFLICT (cliente_id, tipo) DO NOTHING;

    IF FOUND THEN
      v_enviados := v_enviados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'enviados', v_enviados,
    'limite', v_limite,
    'tipo', 'seguimiento_cliente_recompra',
    'at', now()
  );
END;
$function$;
