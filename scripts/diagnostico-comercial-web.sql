-- Diagnóstico: filas "Cliente" sin nombre en Directorio de clientes web
-- Ejecutar en Supabase → SQL Editor

-- 1) Clientes con mockup web pero sin medio_contacto = 'Web'
SELECT
  c.id,
  c.nombre,
  c.apellido,
  c.telefono,
  c.medio_contacto,
  COUNT(m.id) AS mockups_web
FROM public.mockup_solicitudes m
JOIN public.clientes c ON c.id = m.cliente_id
WHERE m.origen = 'web'
  AND c.medio_contacto IS DISTINCT FROM 'Web'
GROUP BY c.id, c.nombre, c.apellido, c.telefono, c.medio_contacto
ORDER BY mockups_web DESC;

-- 2) Cuántos clientes entraban al directorio solo por órdenes internas (App)
--    sin ser contacto web ni tener mockup web
WITH web_clientes AS (
  SELECT id FROM public.clientes WHERE medio_contacto = 'Web'
),
mockup_clientes AS (
  SELECT DISTINCT cliente_id AS id
  FROM public.mockup_solicitudes
  WHERE origen = 'web' AND cliente_id IS NOT NULL
),
orden_clientes AS (
  SELECT DISTINCT cliente_id AS id FROM public.ordenes WHERE cliente_id IS NOT NULL
)
SELECT COUNT(*) AS clientes_solo_app_en_directorio
FROM orden_clientes o
WHERE o.id NOT IN (SELECT id FROM web_clientes)
  AND o.id NOT IN (SELECT id FROM mockup_clientes);

-- 3) Mockups web con datos de contacto en la solicitud (fallback útil)
SELECT
  m.id,
  m.cliente_id,
  m.nombre_muestra,
  m.whatsapp,
  m.email,
  c.nombre AS cliente_nombre,
  c.telefono AS cliente_telefono,
  c.medio_contacto
FROM public.mockup_solicitudes m
LEFT JOIN public.clientes c ON c.id = m.cliente_id
WHERE m.origen = 'web'
  AND (
    c.id IS NULL
    OR c.medio_contacto IS DISTINCT FROM 'Web'
    OR NULLIF(trim(c.nombre), '') IS NULL
  )
  AND (
    NULLIF(trim(m.whatsapp), '') IS NOT NULL
    OR NULLIF(trim(m.nombre_muestra), '') IS NOT NULL
  )
ORDER BY m.created_at DESC
LIMIT 50;

-- 4) (Opcional) Corregir medio_contacto para quien hizo mockup web pero quedó como Whatsapp
-- UPDATE public.clientes c
-- SET medio_contacto = 'Web'
-- FROM public.mockup_solicitudes m
-- WHERE m.cliente_id = c.id
--   AND m.origen = 'web'
--   AND c.medio_contacto IS DISTINCT FROM 'Web';
