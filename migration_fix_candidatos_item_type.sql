-- =============================================================================
-- Corrección de item_type / item_config (candidatos CSV) + casos especiales
-- Ejecutar en Supabase SQL Editor DESPUÉS de migration_add_item_types.sql
--
-- 1) ac2fc0b6: figuraba "Soldador 150w" con valor 40.000 → es base remachadora
-- 2) 2fff4267 (lerual) y 475d9c1d (Las Ricardas): nota "va con soldador…".
--    - Se anula nota, se desconta 75.000 del valor del **sello** (precio de lista
--      soldador) y se agrega un **segundo renglón** SOLDADOR con valor 75.000.
--    - La seña del sello se ajusta con LEIST para no superar al nuevo valor.
--    (Total de la orden, sum(sellos.valor), queda alineado con lo ya cobrado.)
-- Placeholder 0,1 / 0,1 en largo_real/ancho = 1mm×1mm (como en altas no-sello).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) "Soldador" con texto 150w y valor 40.000 → base remachadora
-- ---------------------------------------------------------------------------
UPDATE sellos
SET
  item_type = 'BASE_REMACHADORA',
  item_config = COALESCE(item_config, '{}'::jsonb),
  diseno = 'Base remachadora'
WHERE id = 'ac2fc0b6-9fe9-4741-848b-5cfea4a95d4a';

-- ---------------------------------------------------------------------------
-- 1) Bases (5)
-- ---------------------------------------------------------------------------
UPDATE sellos
SET
  item_type = 'BASE_REMACHADORA',
  item_config = COALESCE(item_config, '{}'::jsonb)
WHERE id IN (
  '8a465dc7-ba81-42af-b91e-a38d7a9110ea',
  'f77fb13f-bc76-4a5c-b37a-35b312c0bde7',
  'f27034ef-05f4-4d4f-817c-03fec4e71bd7',
  '0247e61d-d9ef-49e9-9dc0-32c73c8eae15',
  '0eb227cc-7d37-4142-a33b-a8fe005d710d'
);

-- ---------------------------------------------------------------------------
-- 2) Mangos (4)
-- ---------------------------------------------------------------------------
UPDATE sellos
SET
  item_type = 'MANGO_GOLPE',
  item_config = COALESCE(item_config, '{}'::jsonb)
WHERE id IN (
  'e6b6aa77-155a-45ff-a29f-10db59078553',
  '6ae2ff7e-8157-4342-81b7-079556b33271',
  '8414fd14-eb7c-4a2c-9570-9b20d1ad95da',
  'df8daecf-4a3b-4d11-9461-4603f212303e'
);

-- ---------------------------------------------------------------------------
-- 3) Abecedarios (6)
-- ---------------------------------------------------------------------------
UPDATE sellos
SET
  item_type = 'ABECEDARIO',
  item_config = COALESCE(item_config, '{}'::jsonb)
WHERE id IN (
  '1cb4f257-1b05-419c-b3b0-bc86a0b8876b',
  '77d8a6e5-24cc-420c-8151-70d9dff90d65',
  '9825a892-efc2-40d0-ac62-76e5c68b1e27',
  '9c1bf1a8-1971-40e9-888c-c1947d699788',
  'b864bb66-9527-4f35-8d58-a280e48892d6',
  '8f99083f-963f-4c46-9ca3-19c4b7da085e'
);

-- ---------------------------------------------------------------------------
-- 4) Soldadores (100W y 200W)
-- ---------------------------------------------------------------------------
UPDATE sellos
SET
  item_type = 'SOLDADOR',
  item_config = jsonb_build_object('soldadorPower', '100W')
WHERE id IN (
  'a590b62b-f81a-4b36-86ea-47893d4dc969',
  '202b7537-036e-44ea-922d-65a1be72ba92'
);

UPDATE sellos
SET
  item_type = 'SOLDADOR',
  item_config = jsonb_build_object('soldadorPower', '200W')
WHERE id IN (
  'a673bb55-4ab1-4e16-a80c-774faa5c2df8',
  'a4839d61-9aa3-4a04-a559-a983bef43d8e',
  'c181cdeb-f770-4454-b6b7-f41b410f3d7b',
  '5e178d6c-7e93-407d-b60d-bba8e0f5a4cb',
  '40b725fe-42dd-43d4-9738-81bd272b363b',
  '2eb4c877-31d8-42f3-845d-fccf2d341d4c',
  '877f3ffb-cae5-414a-9dba-1aa1772a735b',
  'ef962537-cde2-4460-86e6-1ae79d60524b',
  '5a5fd2ba-e891-4e6c-9975-0166ce5b3d07'
);

-- 150W real (sí es soldador, precio 75.000)
UPDATE sellos
SET
  item_type = 'SOLDADOR',
  item_config = jsonb_build_object('soldadorPower', '150W')
WHERE id = 'b236fc9c-dffe-4768-a85c-8a9c13bafc6d';

-- ---------------------------------------------------------------------------
-- 5) Sello + soldador en un solo renglón: separar
--     IDs: 2fff4267 (lerual) / 475d9c1d (Las Ricardas)
-- ---------------------------------------------------------------------------
UPDATE sellos
SET
  nota = NULL,
  valor = GREATEST(0, valor - 75000.00)
WHERE id IN (
  '2fff4267-e884-41fc-aa17-0371e85263e6',
  '475d9c1d-b97a-4fb5-97ed-b26e122e277a'
);

UPDATE sellos
SET
  senia = LEAST(COALESCE(senia, 0), valor)
WHERE id IN (
  '2fff4267-e884-41fc-aa17-0371e85263e6',
  '475d9c1d-b97a-4fb5-97ed-b26e122e277a'
);

-- Soldador 200W añadido a la misma orden que "lerual"
INSERT INTO sellos (
  orden_id, tipo, diseno, nota, valor, senia, fecha,
  estado_fabricacion, estado_venta, item_type, item_config, largo_real, ancho_real
)
SELECT
  s.orden_id,
  'Clasico',
  'Soldador 200W',
  NULL,
  75000.00,
  0.00,
  s.fecha,
  s.estado_fabricacion,
  s.estado_venta,
  'SOLDADOR',
  jsonb_build_object('soldadorPower', '200W'),
  0.1, 0.1
FROM sellos s
WHERE s.id = '2fff4267-e884-41fc-aa17-0371e85263e6';

-- Soldador 100W añadido a la misma orden que "Las Ricardas"
INSERT INTO sellos (
  orden_id, tipo, diseno, nota, valor, senia, fecha,
  estado_fabricacion, estado_venta, item_type, item_config, largo_real, ancho_real
)
SELECT
  s.orden_id,
  'Clasico',
  'Soldador 100W',
  NULL,
  75000.00,
  0.00,
  s.fecha,
  s.estado_fabricacion,
  s.estado_venta,
  'SOLDADOR',
  jsonb_build_object('soldadorPower', '100W'),
  0.1, 0.1
FROM sellos s
WHERE s.id = '475d9c1d-b97a-4fb5-97ed-b26e122e277a';

COMMIT;

-- Verificación (ejecutar aparte)
-- SELECT id, diseno, nota, valor, senia, item_type, item_config
-- FROM sellos
-- WHERE orden_id IN (
--   (SELECT orden_id FROM sellos WHERE id = '2fff4267-e884-41fc-aa17-0371e85263e6'),
--   (SELECT orden_id FROM sellos WHERE id = '475d9c1d-b97a-4fb5-97ed-b26e122e277a')
-- )
-- ORDER BY orden_id, created_at, id;
