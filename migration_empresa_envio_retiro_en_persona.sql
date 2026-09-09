-- Agrega 'Retiro en Persona' como empresa_envio distinta de 'Retiro' (histórico vía "Otro").
-- Costo de envío = 0, igual que 'Retiro'.

ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_empresa_envio_check;

ALTER TABLE public.ordenes
  ADD CONSTRAINT ordenes_empresa_envio_check
  CHECK (
    empresa_envio IS NULL
    OR empresa_envio IN (
      'Andreani',
      'Correo Argentino',
      'Via Cargo',
      'Retiro',
      'Retiro en Persona'
    )
  );

CREATE OR REPLACE FUNCTION get_shipping_cost(
    p_empresa_envio VARCHAR(50),
    p_tipo_envio VARCHAR(20)
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_costo DECIMAL(10,2);
BEGIN
    IF p_empresa_envio IS NULL
       OR p_empresa_envio IN ('Retiro', 'Retiro en Persona')
       OR p_tipo_envio IS NULL
       OR p_tipo_envio = 'Retiro' THEN
        RETURN 0;
    END IF;

    SELECT costo INTO v_costo
    FROM costos_de_envio
    WHERE empresa = p_empresa_envio
      AND servicio = p_tipo_envio
      AND activo = true
    ORDER BY activo_desde DESC
    LIMIT 1;

    RETURN COALESCE(v_costo, 0);
END;
$$ LANGUAGE plpgsql;
