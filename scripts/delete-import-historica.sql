-- =============================================================================
-- Borrar SOLO la carga del script import-clientes-viejos-csv.mjs
-- (nota: "Importación histórica Clientes Viejos (...csv)").
--
-- NO borra:
--   · import-ventas-csv.mjs → nota "Importación histórica ene-2026 (CSV)" u otras
--   · cargas manuales sin esa frase en sellos.nota
--
-- Supabase → SQL Editor. Ejecutá primero el PREVIEW.
-- Opcional: NO uses created_at en sellos para "el día que importé": el script
-- import-clientes-viejos-csv.mjs pone created_at de orden/sello = fecha del pedido
-- en el CSV (histórica), no la hora real del insert. Para borrar por sesión no sirve.
-- (Si algún día querés acotar por otro criterio, usá otra columna o un tag en nota.)
-- =============================================================================

-- --- PREVIEW ---
SELECT COUNT(DISTINCT o.id) AS ordenes_a_borrar,
       COUNT(*)            AS sellos_matcheados,
       MIN(s.created_at)   AS primer_sello_utc,
       MAX(s.created_at)   AS ultimo_sello_utc
FROM ordenes o
JOIN sellos s ON s.orden_id = o.id
WHERE s.nota IS NOT NULL
  AND s.nota ILIKE '%Importación histórica Clientes Viejos%';

-- --- BORRADO (revisá PREVIEW) ---
BEGIN;

CREATE TEMP TABLE tmp_import_cliente_ids ON COMMIT DROP AS
SELECT DISTINCT o.cliente_id
FROM ordenes o
JOIN sellos s ON s.orden_id = o.id
WHERE s.nota IS NOT NULL
  AND s.nota ILIKE '%Importación histórica Clientes Viejos%';

DELETE FROM ordenes o
USING sellos s
WHERE s.orden_id = o.id
  AND s.nota IS NOT NULL
  AND s.nota ILIKE '%Importación histórica Clientes Viejos%';

DELETE FROM clientes c
WHERE c.id IN (SELECT cliente_id FROM tmp_import_cliente_ids)
  AND NOT EXISTS (SELECT 1 FROM ordenes o WHERE o.cliente_id = c.id);

COMMIT;
