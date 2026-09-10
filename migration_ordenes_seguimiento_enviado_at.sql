-- Columna materializada con la fecha en que el pedido pasó a "Seguimiento Enviado".
-- Se completa sola vía trigger BEFORE UPDATE sobre ordenes.estado_envio.
-- Sirve para ordenar/paginar la tabla de Historial de Envíos sin agregaciones sobre estado_historial.

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS seguimiento_enviado_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ordenes_seguimiento_enviado_at
  ON public.ordenes (seguimiento_enviado_at DESC)
  WHERE seguimiento_enviado_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_ordenes_stamp_seguimiento_enviado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_envio = 'Seguimiento Enviado'
     AND (TG_OP = 'INSERT' OR OLD.estado_envio IS DISTINCT FROM NEW.estado_envio) THEN
    NEW.seguimiento_enviado_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ordenes_stamp_seguimiento_enviado ON public.ordenes;
CREATE TRIGGER trigger_ordenes_stamp_seguimiento_enviado
  BEFORE INSERT OR UPDATE OF estado_envio
  ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ordenes_stamp_seguimiento_enviado();

-- Backfill: pedidos que ya están en Seguimiento Enviado pero no tienen la marca.
-- Usa la fecha real del cambio de estado si existe en estado_historial; si no, updated_at como fallback.
UPDATE public.ordenes o
SET seguimiento_enviado_at = COALESCE(
  (
    SELECT eh.changed_at
    FROM public.estado_historial eh
    WHERE eh.orden_id = o.id
      AND eh.campo = 'estado_envio'
      AND eh.estado_nuevo = 'Seguimiento Enviado'
    ORDER BY eh.changed_at DESC
    LIMIT 1
  ),
  o.updated_at
)
WHERE o.estado_envio = 'Seguimiento Enviado'
  AND o.seguimiento_enviado_at IS NULL;
