-- =============================================================================
-- Alcohn Web — migración Supabase (compartida con la app)
-- =============================================================================
-- Referencia: docs/modelo-datos-web-supabase.md
-- Esquema base: supabase_schema.md
--
-- Objetivo:
--   - Enlazar wizard / mockups con clientes y órdenes
--   - Registrar intentos de compra web, fallos de pago y transferencias
--   - NO modifica CHECK de estado_orden / estado_envio (flujo operativo actual)
--
-- Cómo probar:
--   1. Ejecutar en un branch o proyecto de staging primero.
--   2. Revisar que la app siga listando órdenes y mockups (columnas nuevas son NULL).
--   3. Correr las consultas de verificación al final del archivo.
--
-- Rollback: ver sección comentada al final.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CLIENTES — índice para upsert por teléfono desde la web
-- -----------------------------------------------------------------------------
-- Nota: telefono NO es UNIQUE hoy; la web debe normalizar (+54…) antes del upsert.
-- Si en el futuro quieren un solo cliente por teléfono, evaluar UNIQUE parcial.

CREATE INDEX IF NOT EXISTS idx_clientes_telefono
  ON public.clientes USING btree (telefono);

COMMENT ON INDEX public.idx_clientes_telefono IS
  'Búsqueda/upsert de clientes creados desde la web por teléfono.';


-- -----------------------------------------------------------------------------
-- 2. MOCKUP_SOLICITUDES — embudo wizard / muestra sin compra obligatoria
-- -----------------------------------------------------------------------------

ALTER TABLE public.mockup_solicitudes
  ADD COLUMN IF NOT EXISTS cliente_id uuid NULL,
  ADD COLUMN IF NOT EXISTS orden_id uuid NULL,
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS email text NULL,
  ADD COLUMN IF NOT EXISTS checkout_iniciado_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS checkout_completado_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS carrito_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS metadata_web jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS web_session_id text NULL;

COMMENT ON COLUMN public.mockup_solicitudes.cliente_id IS
  'Cliente asociado cuando la web captura contacto (wizard/checkout).';
COMMENT ON COLUMN public.mockup_solicitudes.orden_id IS
  'Orden web vinculada al confirmar checkout; NULL = muestra sin compra (aún).';
COMMENT ON COLUMN public.mockup_solicitudes.origen IS
  'app | web — quién creó la solicitud.';
COMMENT ON COLUMN public.mockup_solicitudes.email IS
  'Email del wizard web (opcional).';
COMMENT ON COLUMN public.mockup_solicitudes.checkout_iniciado_at IS
  'Primera vez que el usuario entró al checkout con esta muestra.';
COMMENT ON COLUMN public.mockup_solicitudes.checkout_completado_at IS
  'Checkout confirmado (antes o después del pago, según implementación web).';
COMMENT ON COLUMN public.mockup_solicitudes.carrito_json IS
  'Snapshot del carrito al abandonar o iniciar checkout.';
COMMENT ON COLUMN public.mockup_solicitudes.metadata_web IS
  'Extras del wizard: paso actual, flags revisión manual, URLs locales, etc.';
COMMENT ON COLUMN public.mockup_solicitudes.web_session_id IS
  'Correlación de pestaña/sesión en la tienda (no es auth).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mockup_solicitudes_cliente_id_fkey'
  ) THEN
    ALTER TABLE public.mockup_solicitudes
      ADD CONSTRAINT mockup_solicitudes_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mockup_solicitudes_orden_id_fkey'
  ) THEN
    ALTER TABLE public.mockup_solicitudes
      ADD CONSTRAINT mockup_solicitudes_orden_id_fkey
      FOREIGN KEY (orden_id) REFERENCES public.ordenes (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mockup_solicitudes_cliente_id
  ON public.mockup_solicitudes USING btree (cliente_id);

CREATE INDEX IF NOT EXISTS idx_mockup_solicitudes_orden_id
  ON public.mockup_solicitudes USING btree (orden_id);

CREATE INDEX IF NOT EXISTS idx_mockup_solicitudes_origen_estado
  ON public.mockup_solicitudes USING btree (origen, estado);

-- Muestras listas sin venta (remarketing)
CREATE INDEX IF NOT EXISTS idx_mockup_solicitudes_sin_orden
  ON public.mockup_solicitudes USING btree (created_at DESC)
  WHERE orden_id IS NULL AND estado IN ('completado', 'pendiente_aprobacion');

ALTER TABLE public.mockup_solicitudes
  DROP CONSTRAINT IF EXISTS mockup_solicitudes_origen_check;

ALTER TABLE public.mockup_solicitudes
  ADD CONSTRAINT mockup_solicitudes_origen_check
  CHECK (origen = ANY (ARRAY['app'::text, 'web'::text]));

-- Ampliar materiales del wizard web (cerámica, alimentos, otros)
ALTER TABLE public.mockup_solicitudes
  DROP CONSTRAINT IF EXISTS mockup_solicitudes_material_check;

ALTER TABLE public.mockup_solicitudes
  ADD CONSTRAINT mockup_solicitudes_material_check
  CHECK (
    material = ANY (
      ARRAY[
        'cuero'::text,
        'madera'::text,
        'ambos'::text,
        'ceramica'::text,
        'alimentos'::text,
        'otros'::text
      ]
    )
  );


-- -----------------------------------------------------------------------------
-- 3. ORDENES — pago web, transferencias, errores Openpay
-- -----------------------------------------------------------------------------
-- estado_orden / estado_envio: sin cambios → la app sigue igual.
-- estado_pago_web: ciclo de vida del pago solo para pedidos web.

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS origen character varying(20) NULL,
  ADD COLUMN IF NOT EXISTS metodo_pago character varying(30) NULL,
  ADD COLUMN IF NOT EXISTS estado_pago_web character varying(30) NULL,
  ADD COLUMN IF NOT EXISTS mockup_solicitud_id uuid NULL,
  ADD COLUMN IF NOT EXISTS web_checkout_ref character varying(64) NULL,
  ADD COLUMN IF NOT EXISTS openpay_order_id text NULL,
  ADD COLUMN IF NOT EXISTS pago_error_codigo text NULL,
  ADD COLUMN IF NOT EXISTS pago_error_mensaje text NULL,
  ADD COLUMN IF NOT EXISTS ultimo_intento_pago_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pago_confirmado_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS comprobante_path text NULL,
  ADD COLUMN IF NOT EXISTS comprobante_url text NULL,
  ADD COLUMN IF NOT EXISTS comprobante_subido_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS comprobante_validado_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS comprobante_validado_por uuid NULL,
  ADD COLUMN IF NOT EXISTS notas_web jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS carrito_json jsonb NULL;

COMMENT ON COLUMN public.ordenes.origen IS 'Web | App | NULL (histórico).';
COMMENT ON COLUMN public.ordenes.metodo_pago IS 'Openpay | Transferencia.';
COMMENT ON COLUMN public.ordenes.estado_pago_web IS
  'pendiente | pago_fallido | esperando_comprobante | pagado | abandonado';
COMMENT ON COLUMN public.ordenes.mockup_solicitud_id IS
  'Muestra del wizard que originó este pedido (personalizados).';
COMMENT ON COLUMN public.ordenes.web_checkout_ref IS
  'Referencia opaca para retomar checkout / callbacks Openpay.';
COMMENT ON COLUMN public.ordenes.notas_web IS
  'Metadata del checkout web (provincia, ciudad, canal, etc.).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_mockup_solicitud_id_fkey'
  ) THEN
    ALTER TABLE public.ordenes
      ADD CONSTRAINT ordenes_mockup_solicitud_id_fkey
      FOREIGN KEY (mockup_solicitud_id) REFERENCES public.mockup_solicitudes (id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_comprobante_validado_por_fkey'
  ) THEN
    ALTER TABLE public.ordenes
      ADD CONSTRAINT ordenes_comprobante_validado_por_fkey
      FOREIGN KEY (comprobante_validado_por) REFERENCES auth.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_web_checkout_ref
  ON public.ordenes (web_checkout_ref)
  WHERE web_checkout_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_origen_estado_pago_web
  ON public.ordenes USING btree (origen, estado_pago_web);

CREATE INDEX IF NOT EXISTS idx_ordenes_esperando_comprobante
  ON public.ordenes USING btree (created_at DESC)
  WHERE origen = 'Web'
    AND estado_pago_web = 'esperando_comprobante';

CREATE INDEX IF NOT EXISTS idx_ordenes_pago_fallido
  ON public.ordenes USING btree (created_at DESC)
  WHERE origen = 'Web'
    AND estado_pago_web = 'pago_fallido';

ALTER TABLE public.ordenes
  DROP CONSTRAINT IF EXISTS ordenes_origen_check;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_origen_check
  CHECK (
    origen IS NULL
    OR (origen::text = ANY (ARRAY['Web'::text, 'App'::text]))
  );

ALTER TABLE public.ordenes
  DROP CONSTRAINT IF EXISTS ordenes_metodo_pago_check;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_metodo_pago_check
  CHECK (
    metodo_pago IS NULL
    OR (metodo_pago::text = ANY (ARRAY['Openpay'::text, 'Transferencia'::text]))
  );

ALTER TABLE public.ordenes
  DROP CONSTRAINT IF EXISTS ordenes_estado_pago_web_check;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_estado_pago_web_check
  CHECK (
    estado_pago_web IS NULL
    OR (estado_pago_web::text = ANY (
      ARRAY[
        'pendiente'::text,
        'pago_fallido'::text,
        'esperando_comprobante'::text,
        'pagado'::text,
        'abandonado'::text
      ]
    ))
  );


-- -----------------------------------------------------------------------------
-- 4. SELLOS — enlace opcional a la muestra (además de item_config)
-- -----------------------------------------------------------------------------

ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS mockup_solicitud_id uuid NULL;

COMMENT ON COLUMN public.sellos.mockup_solicitud_id IS
  'Solicitud de mockup web asociada a esta línea (personalizado).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sellos_mockup_solicitud_id_fkey'
  ) THEN
    ALTER TABLE public.sellos
      ADD CONSTRAINT sellos_mockup_solicitud_id_fkey
      FOREIGN KEY (mockup_solicitud_id) REFERENCES public.mockup_solicitudes (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sellos_mockup_solicitud_id
  ON public.sellos USING btree (mockup_solicitud_id);


-- -----------------------------------------------------------------------------
-- 5. VISTAS (solo lectura — no afectan triggers ni la app si no se usan)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_web_mockups_sin_compra AS
SELECT
  m.id AS mockup_id,
  m.created_at,
  m.estado,
  m.material,
  m.whatsapp,
  m.email,
  m.mockup_cuero_url,
  m.mockup_madera_url,
  m.medidas_cotizacion_json,
  c.id AS cliente_id,
  c.nombre,
  c.apellido,
  c.telefono,
  c.mail
FROM public.mockup_solicitudes m
LEFT JOIN public.clientes c ON c.id = m.cliente_id
WHERE m.origen = 'web'
  AND m.orden_id IS NULL
  AND m.estado IN ('completado', 'pendiente_aprobacion');

COMMENT ON VIEW public.v_web_mockups_sin_compra IS
  'Muestras web terminadas o en revisión sin orden — seguimiento WhatsApp.';

CREATE OR REPLACE VIEW public.v_web_ordenes_seguimiento_pago AS
SELECT
  o.id AS orden_id,
  o.created_at,
  o.estado_pago_web,
  o.metodo_pago,
  o.valor_total,
  o.senia_total,
  o.pago_error_mensaje,
  o.comprobante_subido_at,
  o.comprobante_url,
  o.web_checkout_ref,
  c.id AS cliente_id,
  c.nombre,
  c.apellido,
  c.telefono,
  c.mail
FROM public.ordenes o
JOIN public.clientes c ON c.id = o.cliente_id
WHERE o.origen = 'Web'
  AND o.estado_pago_web IN (
    'pendiente',
    'pago_fallido',
    'esperando_comprobante',
    'abandonado'
  );

COMMENT ON VIEW public.v_web_ordenes_seguimiento_pago IS
  'Pedidos web sin pago cerrado — reintentar tarjeta o pedir comprobante.';


-- -----------------------------------------------------------------------------
-- 6. STORAGE — buckets para la web (opcional; revisar políticas RLS en dashboard)
-- -----------------------------------------------------------------------------
-- La app puede seguir usando sus buckets actuales.
-- Estos nombres coinciden con docs/modelo-datos-web-supabase.md

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'comprobantes',
    'comprobantes',
    false,
    10485760,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ]
  ),
  (
    'logos-web',
    'logos-web',
    false,
    15728640,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml'
    ]
  ),
  (
    'mockups-web',
    'mockups-web',
    false,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas de Storage: configurar en Supabase según auth de la app.
-- Ejemplo (comentado) — service role de la web bypass RLS al subir vía API:
--
-- CREATE POLICY "App users read comprobantes"
--   ON storage.objects FOR SELECT
--   TO authenticated
--   USING (bucket_id = 'comprobantes');


COMMIT;


-- =============================================================================
-- VERIFICACIÓN (ejecutar después del COMMIT)
-- =============================================================================

-- Columnas nuevas en ordenes
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'ordenes'
--   AND column_name IN (
--     'origen', 'metodo_pago', 'estado_pago_web', 'comprobante_url', 'mockup_solicitud_id'
--   )
-- ORDER BY column_name;

-- Columnas nuevas en mockup_solicitudes
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'mockup_solicitudes'
--   AND column_name IN ('cliente_id', 'orden_id', 'origen', 'carrito_json');

-- Filas existentes no deberían violar checks (todo NULL / default)
-- SELECT COUNT(*) FROM public.ordenes WHERE origen IS NOT NULL;
-- SELECT COUNT(*) FROM public.mockup_solicitudes WHERE origen <> 'app';

-- Probar inserción mínima web (STAGING — borrar después)
-- INSERT INTO public.clientes (nombre, apellido, telefono, medio_contacto)
-- VALUES ('Test', 'Web', '+5491100000000', 'Web')
-- RETURNING id;


-- =============================================================================
-- NOTAS PARA LA APP (sin romper producción)
-- =============================================================================
--
-- 1. Filas antiguas: origen NULL en ordenes, origen 'app' en mockups → comportamiento igual.
-- 2. estado_orden NULL sigue siendo válido para borradores web hasta confirmar seña.
-- 3. Triggers de sellos (costos, totales) se disparan al INSERT — la web debe enviar
--    valor, tipo, item_type, estado_fabricacion 'Sin Hacer', etc. como hace la app.
-- 4. Al confirmar pago transferencia: estado_pago_web = 'pagado', estado_orden = 'Señado'.
-- 5. Al fallar Openpay: estado_pago_web = 'pago_fallido'; estado_orden puede quedar NULL.
-- 6. Vistas v_web_* son opcionales; pueden exponerse en la app o ignorarse.


-- =============================================================================
-- ROLLBACK (manual — solo si necesitan revertir)
-- =============================================================================
--
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_web_ordenes_seguimiento_pago;
-- DROP VIEW IF EXISTS public.v_web_mockups_sin_compra;
-- ALTER TABLE public.sellos DROP CONSTRAINT IF EXISTS sellos_mockup_solicitud_id_fkey;
-- ALTER TABLE public.sellos DROP COLUMN IF EXISTS mockup_solicitud_id;
-- ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_pago_web_check;
-- ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_metodo_pago_check;
-- ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_origen_check;
-- ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_mockup_solicitud_id_fkey;
-- ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_comprobante_validado_por_fkey;
-- ALTER TABLE public.ordenes
--   DROP COLUMN IF EXISTS origen,
--   DROP COLUMN IF EXISTS metodo_pago,
--   DROP COLUMN IF EXISTS estado_pago_web,
--   DROP COLUMN IF EXISTS mockup_solicitud_id,
--   DROP COLUMN IF EXISTS web_checkout_ref,
--   DROP COLUMN IF EXISTS openpay_order_id,
--   DROP COLUMN IF EXISTS pago_error_codigo,
--   DROP COLUMN IF EXISTS pago_error_mensaje,
--   DROP COLUMN IF EXISTS ultimo_intento_pago_at,
--   DROP COLUMN IF EXISTS pago_confirmado_at,
--   DROP COLUMN IF EXISTS comprobante_path,
--   DROP COLUMN IF EXISTS comprobante_url,
--   DROP COLUMN IF EXISTS comprobante_subido_at,
--   DROP COLUMN IF EXISTS comprobante_validado_at,
--   DROP COLUMN IF EXISTS comprobante_validado_por,
--   DROP COLUMN IF EXISTS notas_web,
--   DROP COLUMN IF EXISTS carrito_json;
-- ALTER TABLE public.mockup_solicitudes DROP CONSTRAINT IF EXISTS mockup_solicitudes_origen_check;
-- ALTER TABLE public.mockup_solicitudes DROP CONSTRAINT IF EXISTS mockup_solicitudes_material_check;
-- ALTER TABLE public.mockup_solicitudes
--   ADD CONSTRAINT mockup_solicitudes_material_check
--   CHECK (material = ANY (ARRAY['cuero'::text, 'madera'::text, 'ambos'::text]));
-- ALTER TABLE public.mockup_solicitudes DROP CONSTRAINT IF EXISTS mockup_solicitudes_cliente_id_fkey;
-- ALTER TABLE public.mockup_solicitudes DROP CONSTRAINT IF EXISTS mockup_solicitudes_orden_id_fkey;
-- ALTER TABLE public.mockup_solicitudes
--   DROP COLUMN IF EXISTS cliente_id,
--   DROP COLUMN IF EXISTS orden_id,
--   DROP COLUMN IF EXISTS origen,
--   DROP COLUMN IF EXISTS email,
--   DROP COLUMN IF EXISTS checkout_iniciado_at,
--   DROP COLUMN IF EXISTS checkout_completado_at,
--   DROP COLUMN IF EXISTS carrito_json,
--   DROP COLUMN IF EXISTS metadata_web,
--   DROP COLUMN IF EXISTS web_session_id;
-- DROP INDEX IF EXISTS public.idx_clientes_telefono;
-- DELETE FROM storage.buckets WHERE id IN ('comprobantes', 'logos-web', 'mockups-web');
-- COMMIT;
