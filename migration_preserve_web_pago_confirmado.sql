-- =============================================================================
-- Preservar estado_pago_web = 'pagado' en pedidos web ya confirmados.
--
-- Problema: la web, al subir comprobante, a veces reescribe la orden con
-- estado_pago_web = 'esperando_comprobante' aunque el equipo ya lo haya
-- confirmado en Comercial. Eso oculta el pedido en Pedidos/Producción
-- (filtro isWebOrderHiddenFromInternalApp) pese a tener sellos y WhatsApp.
--
-- Contrato (web-alcohn-integracion.md): al subir comprobante solo tocar
-- comprobante_path / comprobante_url / comprobante_subido_at.
-- Este trigger es red de seguridad en DB.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_preserve_web_pago_confirmado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending text[] := ARRAY[
    'pendiente',
    'pago_fallido',
    'esperando_comprobante',
    'abandonado'
  ];
BEGIN
  IF COALESCE(OLD.origen, '') <> 'Web' THEN
    RETURN NEW;
  END IF;

  -- Una vez confirmado, no permitir bajar a estados de seguimiento de pago.
  IF OLD.estado_pago_web = 'pagado'
     AND NEW.estado_pago_web IS DISTINCT FROM 'pagado'
     AND NEW.estado_pago_web = ANY (v_pending)
  THEN
    NEW.estado_pago_web := 'pagado';

    IF NEW.pago_confirmado_at IS NULL THEN
      NEW.pago_confirmado_at := COALESCE(OLD.pago_confirmado_at, now());
    END IF;

    IF NEW.estado_orden IS NULL AND OLD.estado_orden IS NOT NULL THEN
      NEW.estado_orden := OLD.estado_orden;
    END IF;
  END IF;

  -- Si ya hubo confirmación registrada, no borrar el timestamp.
  IF OLD.pago_confirmado_at IS NOT NULL AND NEW.pago_confirmado_at IS NULL THEN
    NEW.pago_confirmado_at := OLD.pago_confirmado_at;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_preserve_web_pago_confirmado() IS
  'Impide que un UPDATE (p. ej. subida de comprobante desde la web) baje un pedido web ya pagado a esperando_comprobante u otro estado pendiente.';

DROP TRIGGER IF EXISTS trigger_preserve_web_pago_confirmado ON public.ordenes;
CREATE TRIGGER trigger_preserve_web_pago_confirmado
  BEFORE UPDATE ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_preserve_web_pago_confirmado();

-- -----------------------------------------------------------------------------
-- Backfill: pedidos ya confirmados (sellos + pago_confirmado_at / notas) que
-- quedaron mal en esperando_comprobante u otro estado pendiente.
-- -----------------------------------------------------------------------------
UPDATE public.ordenes o
SET
  estado_pago_web = 'pagado',
  estado_orden = COALESCE(o.estado_orden, 'Señado'),
  pago_confirmado_at = COALESCE(o.pago_confirmado_at, now()),
  updated_at = now()
WHERE o.origen = 'Web'
  AND o.estado_pago_web IS DISTINCT FROM 'pagado'
  AND o.estado_pago_web IN (
    'pendiente',
    'pago_fallido',
    'esperando_comprobante',
    'abandonado'
  )
  AND (
    o.pago_confirmado_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.sellos s WHERE s.orden_id = o.id)
    OR COALESCE((o.notas_web->>'senia_confirmada')::text, '') <> ''
    OR COALESCE((o.notas_web->>'diseno_confirmado')::text, '') <> ''
  );
