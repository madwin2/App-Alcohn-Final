-- Rellena mockup_solicitudes.whatsapp desde clientes.telefono cuando el flujo web
-- creó la muestra antes de capturar el contacto (whatsapp quedó NULL).

UPDATE public.mockup_solicitudes AS m
SET
  whatsapp = c.telefono,
  updated_at = now()
FROM public.clientes AS c
WHERE m.cliente_id = c.id
  AND (m.whatsapp IS NULL OR btrim(m.whatsapp) = '')
  AND c.telefono IS NOT NULL
  AND btrim(c.telefono) <> '';
