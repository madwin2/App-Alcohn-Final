-- Historial de cambios de estado (fabricación, venta, envío).
-- Solo guarda fecha + de/a. No registra quién lo cambió.
--
-- Cubierto por triggers:
--   - sellos.estado_fabricacion
--   - sellos.estado_venta
--   - ordenes.estado_envio
--   - ordenes.estado_orden  (venta agregada a nivel pedido)
--
-- Incluye INSERT (estado inicial, estado_anterior = NULL) y UPDATE
-- solo cuando el valor realmente cambia (IS DISTINCT FROM).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.estado_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  sello_id uuid REFERENCES public.sellos(id) ON DELETE SET NULL,
  campo text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estado_historial_campo_check
    CHECK (campo IN (
      'estado_fabricacion',
      'estado_venta',
      'estado_envio',
      'estado_orden'
    ))
);

CREATE INDEX IF NOT EXISTS idx_estado_historial_orden_changed_at
  ON public.estado_historial (orden_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_estado_historial_sello_changed_at
  ON public.estado_historial (sello_id, changed_at DESC)
  WHERE sello_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estado_historial_campo_changed_at
  ON public.estado_historial (campo, changed_at DESC);

COMMENT ON TABLE public.estado_historial IS
  'Timeline de cambios de estado de pedidos/sellos (solo fecha; sin usuario).';

-- ---------------------------------------------------------------------------
-- Función compartida de insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_estado_historial(
  p_orden_id uuid,
  p_sello_id uuid,
  p_campo text,
  p_anterior text,
  p_nuevo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_orden_id IS NULL THEN
    RETURN;
  END IF;

  -- No loguear si ambos son NULL (sin estado inicial útil)
  IF p_anterior IS NULL AND p_nuevo IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.estado_historial (
    orden_id,
    sello_id,
    campo,
    estado_anterior,
    estado_nuevo,
    changed_at
  )
  VALUES (
    p_orden_id,
    p_sello_id,
    p_campo,
    p_anterior,
    p_nuevo,
    now()
  );
END;
$$;

COMMENT ON FUNCTION public.insert_estado_historial(uuid, uuid, text, text, text) IS
  'Inserta una fila en estado_historial. Usado por triggers.';

-- ---------------------------------------------------------------------------
-- Triggers: sellos (fabricación + venta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_estado_historial_sellos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.insert_estado_historial(
      NEW.orden_id,
      NEW.id,
      'estado_fabricacion',
      NULL,
      NEW.estado_fabricacion::text
    );
    PERFORM public.insert_estado_historial(
      NEW.orden_id,
      NEW.id,
      'estado_venta',
      NULL,
      NEW.estado_venta::text
    );
    RETURN NEW;
  END IF;

  IF NEW.estado_fabricacion IS DISTINCT FROM OLD.estado_fabricacion THEN
    PERFORM public.insert_estado_historial(
      NEW.orden_id,
      NEW.id,
      'estado_fabricacion',
      OLD.estado_fabricacion::text,
      NEW.estado_fabricacion::text
    );
  END IF;

  IF NEW.estado_venta IS DISTINCT FROM OLD.estado_venta THEN
    PERFORM public.insert_estado_historial(
      NEW.orden_id,
      NEW.id,
      'estado_venta',
      OLD.estado_venta::text,
      NEW.estado_venta::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_estado_historial_sellos ON public.sellos;
CREATE TRIGGER trigger_estado_historial_sellos
  AFTER INSERT OR UPDATE OF estado_fabricacion, estado_venta
  ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_estado_historial_sellos();

-- ---------------------------------------------------------------------------
-- Triggers: ordenes (envío + venta agregada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_estado_historial_ordenes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.insert_estado_historial(
      NEW.id,
      NULL,
      'estado_envio',
      NULL,
      NEW.estado_envio::text
    );
    PERFORM public.insert_estado_historial(
      NEW.id,
      NULL,
      'estado_orden',
      NULL,
      NEW.estado_orden::text
    );
    RETURN NEW;
  END IF;

  IF NEW.estado_envio IS DISTINCT FROM OLD.estado_envio THEN
    PERFORM public.insert_estado_historial(
      NEW.id,
      NULL,
      'estado_envio',
      OLD.estado_envio::text,
      NEW.estado_envio::text
    );
  END IF;

  IF NEW.estado_orden IS DISTINCT FROM OLD.estado_orden THEN
    PERFORM public.insert_estado_historial(
      NEW.id,
      NULL,
      'estado_orden',
      OLD.estado_orden::text,
      NEW.estado_orden::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_estado_historial_ordenes ON public.ordenes;
CREATE TRIGGER trigger_estado_historial_ordenes
  AFTER INSERT OR UPDATE OF estado_envio, estado_orden
  ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_estado_historial_ordenes();

-- ---------------------------------------------------------------------------
-- RLS: lectura para equipo autenticado; escritura solo vía trigger (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
ALTER TABLE public.estado_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estado_historial_select_authenticated" ON public.estado_historial;
CREATE POLICY "estado_historial_select_authenticated"
  ON public.estado_historial
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.estado_historial TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.estado_historial FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.estado_historial FROM anon;
