-- Extiende estado_historial para registrar cambios de sellos.estado_vectorizacion.
-- Permite medir tiempo BASE → VECTORIZADO (y ciclos de re-vectorización).
-- Sin backfill: solo cambios nuevos a partir de aplicar esta migración.

-- ---------------------------------------------------------------------------
-- CHECK: incluir estado_vectorizacion
-- ---------------------------------------------------------------------------
ALTER TABLE public.estado_historial
  DROP CONSTRAINT IF EXISTS estado_historial_campo_check;

ALTER TABLE public.estado_historial
  ADD CONSTRAINT estado_historial_campo_check
  CHECK (campo IN (
    'estado_fabricacion',
    'estado_venta',
    'estado_envio',
    'estado_orden',
    'estado_vectorizacion'
  ));

-- ---------------------------------------------------------------------------
-- Trigger sellos: fabricación + venta + vectorización
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
    PERFORM public.insert_estado_historial(
      NEW.orden_id,
      NEW.id,
      'estado_vectorizacion',
      NULL,
      NEW.estado_vectorizacion::text
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

  IF NEW.estado_vectorizacion IS DISTINCT FROM OLD.estado_vectorizacion THEN
    PERFORM public.insert_estado_historial(
      NEW.orden_id,
      NEW.id,
      'estado_vectorizacion',
      OLD.estado_vectorizacion::text,
      NEW.estado_vectorizacion::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_estado_historial_sellos ON public.sellos;
CREATE TRIGGER trigger_estado_historial_sellos
  AFTER INSERT OR UPDATE OF estado_fabricacion, estado_venta, estado_vectorizacion
  ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_estado_historial_sellos();

COMMENT ON TABLE public.estado_historial IS
  'Timeline de cambios de estado de pedidos/sellos (fabricación, venta, envío, orden, vectorización; solo fecha; sin usuario).';
