-- Limpia estado_aspire huérfano: Aspire solo aplica cuando el sello está en Programado.
-- Si ya pasó a Haciendo/Hecho/Rehacer/etc., el chip Aspire en Producción no debe quedar colgado.

UPDATE public.sellos
SET estado_aspire = NULL,
    updated_at = now()
WHERE estado_aspire IS NOT NULL
  AND COALESCE(estado_fabricacion, '') IS DISTINCT FROM 'Programado';
