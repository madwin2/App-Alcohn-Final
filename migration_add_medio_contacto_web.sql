-- Agregar "Web" como canal de contacto válido en clientes.medio_contacto
ALTER TABLE clientes
DROP CONSTRAINT IF EXISTS clientes_medio_contacto_check;

ALTER TABLE clientes
ADD CONSTRAINT clientes_medio_contacto_check
CHECK (medio_contacto IN ('Whatsapp', 'Facebook', 'Instagram', 'Mail', 'Web'));
