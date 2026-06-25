-- Seguimientos comerciales post-venta: 10 clientes por día hábil -> WhatsApp vía bot.
--
-- Criterio:
--   - Cliente con exactamente 1 orden en total.
--   - Esa orden está Transferida y con Seguimiento Enviado.
--   - Orden de al menos 2 meses.
--   - Cliente con teléfono y sin seguimiento comercial post-venta previo.
--   - Cliente/orden no excluidos de Comercial Web.
--
-- Horario automático:
--   - Lunes a viernes 12:26 Argentina = 15:26 UTC en pg_cron.
--
-- Requisitos previos:
--   1. Función public.enviar_webhook_pedido(...), usada por las demás automatizaciones.
--   2. Plantilla/tipo en el bot Hetzner: seguimiento_cliente_recompra.
--
-- Prueba manual:
--   SELECT public.procesar_seguimientos_clientes_pendientes(10, 'manual');

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.comercial_cliente_seguimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  telefono text NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'seguimiento_cliente_recompra',
  estado text NOT NULL DEFAULT 'enviado',
  enviado_at timestamptz NOT NULL DEFAULT now(),
  enviado_por text NOT NULL DEFAULT 'cron',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comercial_cliente_seguimientos_estado_check
    CHECK (estado IN ('enviado', 'error')),
  CONSTRAINT comercial_cliente_seguimientos_tipo_check
    CHECK (tipo IN ('seguimiento_cliente_recompra'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comercial_cliente_seguimientos_cliente_tipo
  ON public.comercial_cliente_seguimientos (cliente_id, tipo);

CREATE INDEX IF NOT EXISTS idx_comercial_cliente_seguimientos_enviado_at
  ON public.comercial_cliente_seguimientos (enviado_at DESC);

COMMENT ON TABLE public.comercial_cliente_seguimientos IS
  'Historial de seguimientos comerciales post-venta enviados por WhatsApp.';

DROP VIEW IF EXISTS public.v_comercial_cliente_seguimiento_historial;
DROP VIEW IF EXISTS public.v_comercial_cliente_seguimiento_resumen;
DROP VIEW IF EXISTS public.v_comercial_clientes_seguimiento_elegibles;

CREATE VIEW public.v_comercial_clientes_seguimiento_elegibles AS
WITH ordenes_por_cliente AS (
  SELECT
    o.cliente_id,
    count(*) AS total_ordenes,
    (array_agg(o.id ORDER BY o.created_at DESC))[1] AS orden_id,
    max(o.created_at) AS orden_fecha
  FROM public.ordenes o
  GROUP BY o.cliente_id
)
SELECT
  c.id AS cliente_id,
  opc.orden_id,
  opc.orden_fecha,
  c.nombre,
  c.apellido,
  c.telefono,
  c.mail,
  c.medio_contacto,
  o.estado_orden,
  o.estado_envio,
  o.seguimiento,
  o.valor_total
FROM ordenes_por_cliente opc
JOIN public.clientes c ON c.id = opc.cliente_id
JOIN public.ordenes o ON o.id = opc.orden_id
WHERE opc.total_ordenes = 1
  AND o.estado_orden = 'Transferido'
  AND o.estado_envio = 'Seguimiento Enviado'
  AND opc.orden_fecha <= now() - interval '2 months'
  AND NULLIF(trim(c.telefono), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.comercial_cliente_seguimientos s
    WHERE s.cliente_id = c.id
      AND s.tipo = 'seguimiento_cliente_recompra'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.comercial_exclusiones e
    WHERE (e.entity_type = 'cliente' AND e.entity_id = c.id)
       OR (e.entity_type = 'orden' AND e.entity_id = o.id)
  );

COMMENT ON VIEW public.v_comercial_clientes_seguimiento_elegibles IS
  'Clientes elegibles para seguimiento comercial post-venta; no usar para listar masivamente en UI.';

CREATE VIEW public.v_comercial_cliente_seguimiento_historial AS
SELECT
  s.id,
  s.cliente_id,
  s.orden_id,
  s.telefono,
  s.nombre,
  s.tipo,
  s.estado,
  s.enviado_at,
  s.enviado_por,
  s.datos,
  c.apellido,
  c.mail,
  o.valor_total,
  o.fecha AS orden_fecha,
  o.estado_orden,
  o.estado_envio
FROM public.comercial_cliente_seguimientos s
JOIN public.clientes c ON c.id = s.cliente_id
JOIN public.ordenes o ON o.id = s.orden_id;

COMMENT ON VIEW public.v_comercial_cliente_seguimiento_historial IS
  'Historial compacto para la sección Seguimientos de Clientes en Comercial Web.';

CREATE VIEW public.v_comercial_cliente_seguimiento_resumen AS
SELECT
  (SELECT count(*) FROM public.v_comercial_clientes_seguimiento_elegibles) AS elegibles_count,
  (
    SELECT count(*)
    FROM public.comercial_cliente_seguimientos s
    WHERE (s.enviado_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date =
      (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  ) AS enviados_hoy,
  (
    SELECT count(*)
    FROM public.comercial_cliente_seguimientos s
    WHERE s.enviado_at >= now() - interval '7 days'
  ) AS enviados_ultimos_7_dias,
  (
    SELECT count(*)
    FROM public.comercial_cliente_seguimientos s
    WHERE s.enviado_at >= now() - interval '30 days'
  ) AS enviados_ultimos_30_dias,
  (
    SELECT max(s.enviado_at)
    FROM public.comercial_cliente_seguimientos s
  ) AS ultimo_envio_at;

COMMENT ON VIEW public.v_comercial_cliente_seguimiento_resumen IS
  'Resumen agregado de seguimientos comerciales post-venta.';

CREATE OR REPLACE FUNCTION public.primer_nombre_comercial(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(split_part(trim(COALESCE(p_nombre, '')), ' ', 1), ''), 'Cliente');
$$;

CREATE OR REPLACE FUNCTION public.procesar_seguimientos_clientes_pendientes(
  p_limite integer DEFAULT 10,
  p_enviado_por text DEFAULT 'cron'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    PERFORM public.enviar_webhook_pedido(
      'seguimiento_cliente_recompra',
      trim(r.telefono),
      v_nombre,
      jsonb_build_object(
        'cliente_id', r.cliente_id::text,
        'orden_id', r.orden_id::text,
        'nombre', v_nombre,
        'seguimiento_comercial', true
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
$$;

COMMENT ON FUNCTION public.procesar_seguimientos_clientes_pendientes(integer, text) IS
  'Envía hasta N seguimientos comerciales post-venta a clientes aleatorios elegibles.';

GRANT SELECT ON public.v_comercial_cliente_seguimiento_resumen TO authenticated;
GRANT SELECT ON public.v_comercial_cliente_seguimiento_historial TO authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_seguimientos_clientes_pendientes(integer, text) TO authenticated;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comercial-seguimientos-clientes') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'comercial-seguimientos-clientes';
  END IF;

  PERFORM cron.schedule(
    'comercial-seguimientos-clientes',
    '26 15 * * 1-5',
    $cron$SELECT public.procesar_seguimientos_clientes_pendientes(10, 'cron');$cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE
      'pg_cron no disponible (%). Programá manualmente lun-vie 15:26 UTC: SELECT public.procesar_seguimientos_clientes_pendientes(10, ''cron'');',
      SQLERRM;
END;
$$;
