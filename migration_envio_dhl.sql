-- Pedidos internacionales: permitir DHL y asignarlo automáticamente.

-- 1. Permitir DHL
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_empresa_envio_check;
ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_empresa_envio_check CHECK (
  empresa_envio IS NULL OR empresa_envio::text = ANY (ARRAY[
    'Andreani','Correo Argentino','Via Cargo','Retiro','Retiro en Persona','DHL'
  ]::text[])
);

-- 2. Toda orden internacional nueva entra como DHL domicilio
CREATE OR REPLACE FUNCTION public.trg_ordenes_internacional_dhl()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.notas_web, '{}'::jsonb) ? 'international' AND NEW.empresa_envio IS NULL THEN
    NEW.empresa_envio := 'DHL';
    NEW.tipo_envio := COALESCE(NEW.tipo_envio, 'Domicilio');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ordenes_internacional_dhl ON public.ordenes;
CREATE TRIGGER trigger_ordenes_internacional_dhl
  BEFORE INSERT ON public.ordenes
  FOR EACH ROW EXECUTE FUNCTION public.trg_ordenes_internacional_dhl();

-- 3. Las que ya existen
UPDATE public.ordenes
SET empresa_envio = 'DHL', tipo_envio = COALESCE(tipo_envio, 'Domicilio')
WHERE notas_web ? 'international' AND empresa_envio IS NULL;
