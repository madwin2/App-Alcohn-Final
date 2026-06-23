-- =============================================================================
-- Consumo de bronce por planchuela al marcar un sello como Hecho.
-- Solo item_type = SELLO. Sin backfill histórico. Rehacer → Hecho cuenta de nuevo.
-- Referencia interna: 12 / 19 / 25 / 38 / 63 (19 → planchuela 20 mm, 38 → 40 mm).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bronce_consumo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sello_id UUID NOT NULL REFERENCES public.sellos(id) ON DELETE CASCADE,
  tipo_planchuela_ref SMALLINT NOT NULL CHECK (tipo_planchuela_ref IN (12, 19, 25, 38, 63)),
  largo_cm NUMERIC(8, 2) NOT NULL CHECK (largo_cm > 0),
  costo_pesos NUMERIC(12, 1),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.bronce_consumo IS
  'Registro de cm de bronce consumidos al pasar un sello a Hecho. tipo_planchuela_ref: 19=20mm, 38=40mm.';

CREATE INDEX IF NOT EXISTS idx_bronce_consumo_consumed_at
  ON public.bronce_consumo (consumed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bronce_consumo_mes_tipo
  ON public.bronce_consumo (tipo_planchuela_ref, consumed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bronce_consumo_sello
  ON public.bronce_consumo (sello_id);

-- ---------------------------------------------------------------------------
-- Trigger: registrar consumo al pasar a Hecho (cada transición cuenta, p. ej. Rehacer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_bronce_consumo_sello()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_type TEXT;
  v_minor_cm NUMERIC;
  v_major_cm NUMERIC;
  v_major_with_loss_cm NUMERIC;
  v_tipo_ref SMALLINT;
  v_cm_cost NUMERIC;
  v_material_cost NUMERIC;
  v_p JSONB;
  j TEXT;
  v_p12 NUMERIC;
  v_p20 NUMERIC;
  v_p25 NUMERIC;
  v_p40 NUMERIC;
  v_p63 NUMERIC;
  v_loss NUMERIC;
BEGIN
  IF NEW.estado_fabricacion IS DISTINCT FROM 'Hecho' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.estado_fabricacion IS NOT DISTINCT FROM 'Hecho' THEN
    RETURN NEW;
  END IF;

  v_item_type := COALESCE(NEW.item_type, 'SELLO');
  IF v_item_type IS DISTINCT FROM 'SELLO' THEN
    RETURN NEW;
  END IF;

  v_minor_cm := LEAST(COALESCE(NEW.ancho_real, 0), COALESCE(NEW.largo_real, 0));
  v_major_cm := GREATEST(COALESCE(NEW.ancho_real, 0), COALESCE(NEW.largo_real, 0));

  IF v_minor_cm <= 0 OR v_major_cm <= 0 THEN
    RETURN NEW;
  END IF;

  v_p := fabricacion_params_at(NOW());

  j := v_p->>'selloPerdidaCorteCm';
  v_loss := CASE WHEN j IS NULL OR j = '' THEN 0.8 ELSE (j)::NUMERIC END;

  j := v_p->>'planchuela12';
  v_p12 := CASE WHEN j IS NULL OR j = '' THEN 375 ELSE (j)::NUMERIC END;
  j := v_p->>'planchuela20';
  v_p20 := CASE WHEN j IS NULL OR j = '' THEN 530 ELSE (j)::NUMERIC END;
  j := v_p->>'planchuela25';
  v_p25 := CASE WHEN j IS NULL OR j = '' THEN 690 ELSE (j)::NUMERIC END;
  j := v_p->>'planchuela40';
  v_p40 := CASE WHEN j IS NULL OR j = '' THEN 1015 ELSE (j)::NUMERIC END;
  j := v_p->>'planchuela63';
  v_p63 := CASE WHEN j IS NULL OR j = '' THEN 2190 ELSE (j)::NUMERIC END;

  v_major_with_loss_cm := v_major_cm + v_loss;

  IF v_minor_cm <= 1.2 THEN
    v_tipo_ref := 12;
    v_cm_cost := v_p12;
  ELSIF v_minor_cm <= 2.0 THEN
    v_tipo_ref := 19;
    v_cm_cost := v_p20;
  ELSIF v_minor_cm <= 2.5 THEN
    v_tipo_ref := 25;
    v_cm_cost := v_p25;
  ELSIF v_minor_cm <= 4.0 THEN
    v_tipo_ref := 38;
    v_cm_cost := v_p40;
  ELSE
    v_tipo_ref := 63;
    v_cm_cost := v_p63;
  END IF;

  v_material_cost := ROUND((v_major_with_loss_cm * v_cm_cost)::NUMERIC, 1);

  INSERT INTO public.bronce_consumo (
    sello_id,
    tipo_planchuela_ref,
    largo_cm,
    costo_pesos,
    consumed_at
  ) VALUES (
    NEW.id,
    v_tipo_ref,
    ROUND(v_major_with_loss_cm::NUMERIC, 2),
    v_material_cost,
    NOW()
  );

  UPDATE public.sellos
  SET tipo_planchuela = v_tipo_ref
  WHERE id = NEW.id
    AND (tipo_planchuela IS DISTINCT FROM v_tipo_ref);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_registrar_bronce_consumo ON public.sellos;

CREATE TRIGGER trigger_registrar_bronce_consumo
  AFTER INSERT OR UPDATE OF estado_fabricacion
  ON public.sellos
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_bronce_consumo_sello();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.bronce_consumo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bronce_consumo_select_authenticated" ON public.bronce_consumo;

CREATE POLICY "bronce_consumo_select_authenticated"
  ON public.bronce_consumo
  FOR SELECT
  TO authenticated
  USING (true);
