-- Agregar 'Aspire XL Check' al CHECK de sellos.estado_aspire
-- (usado cuando un programa XL queda verificado).

ALTER TABLE sellos DROP CONSTRAINT IF EXISTS sellos_estado_aspire_check;

ALTER TABLE sellos
  ADD CONSTRAINT sellos_estado_aspire_check
  CHECK (
    estado_aspire IS NULL
    OR estado_aspire IN (
      'Aspire G',
      'Aspire G Check',
      'Aspire C',
      'Aspire C Check',
      'Aspire XL',
      'Aspire XL Check'
    )
  );
