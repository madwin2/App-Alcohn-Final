-- =============================================================================
-- Tipo de sello «Personalizado» (docs/02-modules/pedidos/mecanizado-personalizado.md).
--
-- - Suma 'Personalizado' al CHECK de sellos.tipo.
-- - La configuración (rosca, profundidad exterior, profundidad de grabado,
--   perfilado recto 1 mm) va en sellos.item_config.mecanizado; no hay columnas nuevas.
-- - No toca filas existentes. La tienda web no crea este tipo.
-- Idempotente: se puede correr de nuevo.
-- =============================================================================

ALTER TABLE public.sellos DROP CONSTRAINT IF EXISTS sellos_tipo_check;
ALTER TABLE public.sellos ADD CONSTRAINT sellos_tipo_check
  CHECK (tipo::text = ANY (ARRAY['Clasico', '3mm', 'Lacre', 'Alimento', 'ABC', 'Personalizado']::text[]));
