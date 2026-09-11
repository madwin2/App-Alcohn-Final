-- Sistema de notificaciones in-app (v1): áreas de usuario, feed persistente,
-- emisión desde RPC (anti-autonotificación + fan-out por área) y crons de
-- vencimientos / deudor.
-- Ejecutar en Supabase SQL Editor o vía apply_migration.

-- ---------------------------------------------------------------------------
-- 1. Áreas por usuario
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuario_area (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('produccion', 'logistica', 'ventas')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, area)
);

CREATE INDEX IF NOT EXISTS idx_usuario_area_area ON public.usuario_area (area);

COMMENT ON TABLE public.usuario_area IS
  'Áreas de la app a las que pertenece un usuario. Un usuario puede estar en varias.';

ALTER TABLE public.usuario_area ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuario_area_select_authenticated" ON public.usuario_area;
CREATE POLICY "usuario_area_select_authenticated"
  ON public.usuario_area FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "usuario_area_insert_authenticated" ON public.usuario_area;
CREATE POLICY "usuario_area_insert_authenticated"
  ON public.usuario_area FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "usuario_area_delete_authenticated" ON public.usuario_area;
CREATE POLICY "usuario_area_delete_authenticated"
  ON public.usuario_area FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, DELETE ON public.usuario_area TO authenticated;
REVOKE ALL ON public.usuario_area FROM anon;

-- ---------------------------------------------------------------------------
-- 2. Notificaciones + destinatarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  area text CHECK (area IS NULL OR area IN ('produccion', 'logistica', 'ventas')),
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nombre text,
  titulo text NOT NULL,
  cuerpo text,
  entidad_tipo text,
  entidad_id text,
  link_path text,
  severidad text NOT NULL DEFAULT 'info' CHECK (severidad IN ('info', 'warning', 'urgent')),
  dedup_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_created_at
  ON public.notificaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_area
  ON public.notificaciones (area);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notificaciones_dedup
  ON public.notificaciones (dedup_key)
  WHERE dedup_key IS NOT NULL;

COMMENT ON TABLE public.notificaciones IS
  'Eventos del feed in-app. Destinatario = área (salvo T1, area NULL).';

CREATE TABLE IF NOT EXISTS public.notificacion_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leida_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notificacion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_dest_user_leida
  ON public.notificacion_destinatarios (user_id, leida_at);
CREATE INDEX IF NOT EXISTS idx_notif_dest_user_created
  ON public.notificacion_destinatarios (user_id, created_at DESC);

COMMENT ON TABLE public.notificacion_destinatarios IS
  'Entrega por usuario. leida_at NULL = no leída. Persistente entre sesiones.';

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacion_destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificaciones_select_own" ON public.notificaciones;
CREATE POLICY "notificaciones_select_own"
  ON public.notificaciones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notificacion_destinatarios d
      WHERE d.notificacion_id = notificaciones.id
        AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "notificaciones_insert_authenticated" ON public.notificaciones;
CREATE POLICY "notificaciones_insert_authenticated"
  ON public.notificaciones FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notificaciones_update_authenticated" ON public.notificaciones;
CREATE POLICY "notificaciones_update_authenticated"
  ON public.notificaciones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notif_dest_select_own" ON public.notificacion_destinatarios;
CREATE POLICY "notif_dest_select_own"
  ON public.notificacion_destinatarios FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_dest_insert_authenticated" ON public.notificacion_destinatarios;
CREATE POLICY "notif_dest_insert_authenticated"
  ON public.notificacion_destinatarios FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notif_dest_update_own" ON public.notificacion_destinatarios;
CREATE POLICY "notif_dest_update_own"
  ON public.notificacion_destinatarios FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.notificaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notificacion_destinatarios TO authenticated;
REVOKE ALL ON public.notificaciones FROM anon;
REVOKE ALL ON public.notificacion_destinatarios FROM anon;

ALTER TABLE public.notificaciones REPLICA IDENTITY FULL;
ALTER TABLE public.notificacion_destinatarios REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'Publicación supabase_realtime no disponible';
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacion_destinatarios;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'Publicación supabase_realtime no disponible';
END $$;

-- ---------------------------------------------------------------------------
-- 3. RPC de emisión (capa única para UI y crons)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emitir_notificacion(
  p_tipo text,
  p_area text DEFAULT NULL,
  p_autor_id uuid DEFAULT NULL,
  p_autor_nombre text DEFAULT NULL,
  p_titulo text DEFAULT '',
  p_cuerpo text DEFAULT NULL,
  p_entidad_tipo text DEFAULT NULL,
  p_entidad_id text DEFAULT NULL,
  p_link_path text DEFAULT NULL,
  p_severidad text DEFAULT 'info',
  p_dedup_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_destinatarios uuid[];
BEGIN
  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'p_tipo es obligatorio';
  END IF;

  IF p_area IS NOT NULL AND p_area NOT IN ('produccion', 'logistica', 'ventas') THEN
    RAISE EXCEPTION 'área inválida: %', p_area;
  END IF;

  IF p_severidad IS NULL OR p_severidad NOT IN ('info', 'warning', 'urgent') THEN
    p_severidad := 'info';
  END IF;

  IF p_dedup_key IS NOT NULL THEN
    SELECT n.id INTO v_id
    FROM public.notificaciones n
    WHERE n.dedup_key = p_dedup_key
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.notificaciones (
      tipo, area, autor_id, autor_nombre, titulo, cuerpo,
      entidad_tipo, entidad_id, link_path, severidad, dedup_key, metadata
    ) VALUES (
      p_tipo, p_area, p_autor_id, p_autor_nombre, COALESCE(p_titulo, ''), p_cuerpo,
      p_entidad_tipo, p_entidad_id, p_link_path, p_severidad, p_dedup_key,
      COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT n.id INTO v_id
      FROM public.notificaciones n
      WHERE n.dedup_key = p_dedup_key
      LIMIT 1;
      RETURN v_id;
  END;

  IF p_user_ids IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT uid), '{}')
      INTO v_destinatarios
    FROM unnest(p_user_ids) AS uid
    WHERE uid IS NOT NULL
      AND (p_autor_id IS NULL OR uid <> p_autor_id);
  ELSIF p_area IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT ua.user_id), '{}')
      INTO v_destinatarios
    FROM public.usuario_area ua
    WHERE ua.area = p_area
      AND (p_autor_id IS NULL OR ua.user_id <> p_autor_id);
  ELSE
    v_destinatarios := '{}';
  END IF;

  IF v_destinatarios IS NOT NULL AND array_length(v_destinatarios, 1) IS NOT NULL THEN
    INSERT INTO public.notificacion_destinatarios (notificacion_id, user_id)
    SELECT v_id, uid
    FROM unnest(v_destinatarios) AS uid
    ON CONFLICT (notificacion_id, user_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.emitir_notificacion IS
  'Crea una notificación y la reparte al área (excluyendo al autor) o a user_ids explícitos.';

GRANT EXECUTE ON FUNCTION public.emitir_notificacion(
  text, text, uuid, text, text, text, text, text, text, text, text, jsonb, uuid[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_notificacion(
  text, text, uuid, text, text, text, text, text, text, text, text, jsonb, uuid[]
) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_notificacion_dedup(p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RETURN;
  END IF;
  UPDATE public.notificaciones
  SET dedup_key = NULL
  WHERE dedup_key = p_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_notificacion_dedup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_notificacion_dedup(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Cron: vencimientos producción (P4) y logística (L2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emitir_notificaciones_vencimientos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_dias int;
  v_titulo text;
  v_cuerpo text;
  v_cliente text;
  v_diseno text;
  v_pedido text;
BEGIN
  -- P4: un aviso al entrar en ventana (≤3 días) y otro al vencer. Sin repetir.
  FOR r IN
    SELECT
      s.id AS sello_id,
      s.orden_id,
      s.fecha_limite,
      COALESCE(NULLIF(btrim(s.diseno), ''), 'Sello') AS diseno,
      TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '')) AS cliente
    FROM public.sellos s
    JOIN public.ordenes o ON o.id = s.orden_id
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE s.fecha_limite IS NOT NULL
      AND COALESCE(s.estado_fabricacion, '') IS DISTINCT FROM 'Hecho'
  LOOP
    v_dias := (r.fecha_limite::date - CURRENT_DATE);
    v_cliente := NULLIF(btrim(r.cliente), '');
    IF v_cliente IS NULL THEN
      v_cliente := 'Cliente';
    END IF;
    v_diseno := r.diseno;
    v_pedido := left(r.orden_id::text, 8);

    IF v_dias < 0 THEN
      v_titulo := v_cliente || ' — ' || v_diseno || ' venció hace ' || abs(v_dias)::text ||
        CASE WHEN abs(v_dias) = 1 THEN ' día' ELSE ' días' END;
      v_cuerpo := 'Pedido #' || v_pedido || ' · fecha límite vencida';
      PERFORM public.emitir_notificacion(
        'p4_vencimiento_vencido',
        'produccion',
        NULL, NULL,
        v_titulo, v_cuerpo,
        'sello', r.sello_id::text, '/produccion',
        'urgent',
        'p4:overdue:' || r.sello_id::text,
        jsonb_build_object(
          'clienteNombre', v_cliente,
          'diseno', v_diseno,
          'ordenId', r.orden_id,
          'dias', v_dias
        ),
        NULL
      );
    ELSIF v_dias <= 3 THEN
      v_titulo := v_cliente || ' — ' || v_diseno ||
        CASE
          WHEN v_dias = 0 THEN ' vence hoy'
          WHEN v_dias = 1 THEN ' vence en 1 día'
          ELSE ' vence en ' || v_dias::text || ' días'
        END;
      v_cuerpo := 'Pedido #' || v_pedido;
      PERFORM public.emitir_notificacion(
        'p4_vencimiento_proximo',
        'produccion',
        NULL, NULL,
        v_titulo, v_cuerpo,
        'sello', r.sello_id::text, '/produccion',
        'warning',
        'p4:upcoming:' || r.sello_id::text,
        jsonb_build_object(
          'clienteNombre', v_cliente,
          'diseno', v_diseno,
          'ordenId', r.orden_id,
          'dias', v_dias
        ),
        NULL
      );
    END IF;
  END LOOP;

  -- L2: mismo umbral a nivel pedido, si todavía no salió
  FOR r IN
    SELECT
      o.id AS orden_id,
      MIN(s.fecha_limite)::date AS fecha_limite,
      TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '')) AS cliente
    FROM public.ordenes o
    JOIN public.sellos s ON s.orden_id = o.id
    JOIN public.clientes c ON c.id = o.cliente_id
    WHERE s.fecha_limite IS NOT NULL
      AND COALESCE(o.estado_envio, '') NOT IN ('Despachado', 'Seguimiento Enviado')
    GROUP BY o.id, c.nombre, c.apellido
  LOOP
    v_dias := (r.fecha_limite - CURRENT_DATE);
    v_cliente := NULLIF(btrim(r.cliente), '');
    IF v_cliente IS NULL THEN
      v_cliente := 'Cliente';
    END IF;
    v_pedido := left(r.orden_id::text, 8);

    IF v_dias < 0 THEN
      v_titulo := v_cliente || ' — pedido #' || v_pedido ||
        ' debería haberse despachado hace ' || abs(v_dias)::text ||
        CASE WHEN abs(v_dias) = 1 THEN ' día' ELSE ' días' END || ' y todavía no salió';
      PERFORM public.emitir_notificacion(
        'l2_despacho_vencido',
        'logistica',
        NULL, NULL,
        v_titulo, NULL,
        'orden', r.orden_id::text, '/envios',
        'urgent',
        'l2:overdue:' || r.orden_id::text,
        jsonb_build_object('clienteNombre', v_cliente, 'ordenId', r.orden_id, 'dias', v_dias),
        NULL
      );
    ELSIF v_dias <= 3 THEN
      v_titulo := v_cliente || ' — pedido #' || v_pedido ||
        CASE
          WHEN v_dias = 0 THEN ' debería despacharse hoy y todavía no salió'
          WHEN v_dias = 1 THEN ' debería despacharse en 1 día y todavía no salió'
          ELSE ' debería despacharse en ' || v_dias::text || ' días y todavía no salió'
        END;
      PERFORM public.emitir_notificacion(
        'l2_despacho_proximo',
        'logistica',
        NULL, NULL,
        v_titulo, NULL,
        'orden', r.orden_id::text, '/envios',
        'warning',
        'l2:upcoming:' || r.orden_id::text,
        jsonb_build_object('clienteNombre', v_cliente, 'ordenId', r.orden_id, 'dias', v_dias),
        NULL
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.emitir_notificaciones_vencimientos IS
  'P4/L2: avisa una vez al entrar en ventana de 3 días y otra al vencer.';

GRANT EXECUTE ON FUNCTION public.emitir_notificaciones_vencimientos() TO postgres;
GRANT EXECUTE ON FUNCTION public.emitir_notificaciones_vencimientos() TO service_role;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificaciones-vencimientos') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'notificaciones-vencimientos';
  END IF;

  PERFORM cron.schedule(
    'notificaciones-vencimientos',
    '10 9 * * *',
    $cron$SELECT public.emitir_notificaciones_vencimientos();$cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE
      'pg_cron no disponible (%). Programá: SELECT public.emitir_notificaciones_vencimientos();',
      SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. V4: deudor automático también emite notificación a Ventas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_ordenes_deudores_por_foto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_cliente text;
  v_pedido text;
  v_titulo text;
BEGIN
  DROP TABLE IF EXISTS tt_ordenes_a_deudor_por_foto;

  CREATE TEMPORARY TABLE tt_ordenes_a_deudor_por_foto AS
  SELECT o.id
  FROM ordenes o
  WHERE (o.estado_orden IS NULL OR o.estado_orden IN ('Señado', 'Hecho', 'Foto'))
    AND EXISTS (SELECT 1 FROM sellos s WHERE s.orden_id = o.id)
    AND NOT EXISTS (
      SELECT 1
      FROM sellos s
      WHERE s.orden_id = o.id
        AND s.estado_venta IS DISTINCT FROM 'Foto'
    )
    AND (
      SELECT MAX(
        COALESCE(
          (
            SELECT eh.changed_at
            FROM estado_historial eh
            WHERE eh.sello_id = s.id
              AND eh.campo = 'estado_venta'
              AND eh.estado_nuevo = 'Foto'
            ORDER BY eh.changed_at DESC
            LIMIT 1
          ),
          s.updated_at
        )
      )
      FROM sellos s
      WHERE s.orden_id = o.id
    ) <= NOW() - INTERVAL '10 days';

  UPDATE sellos s
  SET estado_venta = 'Deudor',
      updated_at   = NOW()
  WHERE s.orden_id IN (SELECT id FROM tt_ordenes_a_deudor_por_foto)
    AND s.estado_venta = 'Foto';

  UPDATE ordenes o
  SET estado_orden = 'Deudor',
      updated_at   = NOW()
  WHERE o.id IN (SELECT id FROM tt_ordenes_a_deudor_por_foto);

  FOR r IN
    SELECT
      o.id AS orden_id,
      TRIM(COALESCE(c.nombre, '') || ' ' || COALESCE(c.apellido, '')) AS cliente
    FROM tt_ordenes_a_deudor_por_foto t
    JOIN public.ordenes o ON o.id = t.id
    JOIN public.clientes c ON c.id = o.cliente_id
  LOOP
    v_cliente := NULLIF(btrim(r.cliente), '');
    IF v_cliente IS NULL THEN
      v_cliente := 'Cliente';
    END IF;
    v_pedido := left(r.orden_id::text, 8);
    v_titulo := v_cliente || ' — pedido #' || v_pedido ||
      ' pasó a Deudor (10+ días con la foto enviada sin transferir)';
    PERFORM public.emitir_notificacion(
      'v4_deudor',
      'ventas',
      NULL, NULL,
      v_titulo, NULL,
      'orden', r.orden_id::text, '/pedidos',
      'urgent',
      'v4:deudor:' || r.orden_id::text,
      jsonb_build_object('clienteNombre', v_cliente, 'ordenId', r.orden_id),
      NULL
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.marcar_ordenes_deudores_por_foto() IS
  'Pasa a Deudor órdenes (y sellos) que llevan 10+ días en Foto enviada. Emite notificación V4 a Ventas.';
