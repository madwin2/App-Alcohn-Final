-- Motivo de fallo de importación en Aspire (gadget).
-- Se setea desde programa-sync al reportar sellos_no_importados
-- y se limpia cuando el sello aparece en sellos_importados_ahora.

ALTER TABLE sellos
  ADD COLUMN IF NOT EXISTS no_importado_motivo text;

COMMENT ON COLUMN sellos.no_importado_motivo IS
  'Motivo por el que el gadget no pudo importar el vector; se limpia cuando entra en un sync posterior.';
