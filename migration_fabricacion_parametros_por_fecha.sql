-- =============================================================================
-- Parámetros de fabricación versionados por fecha (vigencia desde effective_from)
-- Ejecutar en Supabase DESPUÉS de migration_add_fabrication_costs.sql
-- -----------------------------------------------------------------------------
-- Regla de negocio:
-- - Cada fila define un paquete de valores vigentes desde effective_from (inclusive).
-- - El trigger usa la fecha de creación del sello (created_at), no "hoy", para elegir
--   el paquete: los ítems históricos siguen calculándose con la tarifa vigente cuando
--   se crearon; los nuevos usan la tarifa vigente en su alta.
-- - Para actualizar precios: INSERT una nueva fila con effective_from = instante desde el
--   cual aplican los nuevos valores (ej. primer día del mes a las 00:00).
-- Los costos ya guardados en sellos no cambian hasta que se actualice esa fila.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fabricacion_parametros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from TIMESTAMPTZ NOT NULL,
  params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fabricacion_parametros_effective_from
  ON fabricacion_parametros (effective_from);

COMMENT ON TABLE fabricacion_parametros IS 'Historial de parámetros para costo_fabricacion; vigencia desde effective_from.';

CREATE OR REPLACE FUNCTION fabricacion_params_at(p_ts TIMESTAMPTZ)
RETURNS JSONB AS $$
DECLARE
  r JSONB;
BEGIN
  SELECT fp.params INTO r
  FROM fabricacion_parametros fp
  WHERE fp.effective_from <= p_ts
  ORDER BY fp.effective_from DESC
  LIMIT 1;

  IF r IS NULL THEN
    SELECT fp.params INTO r
    FROM fabricacion_parametros fp
    ORDER BY fp.effective_from DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(r, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;

INSERT INTO fabricacion_parametros (effective_from, note, params)
SELECT
  TIMESTAMPTZ '1970-01-01 00:00:00+00',
  'Valores iniciales (equivalentes a migration_add_fabrication_costs.sql)',
  '{
    "soldador100": 13000,
    "soldador200": 30000,
    "baseRemachadora": 13000,
    "mangoGolpe": 7000,
    "amortFresa": 5600,
    "planchuela12": 375,
    "planchuela20": 530,
    "planchuela25": 690,
    "planchuela40": 1015,
    "planchuela63": 2190,
    "tubo": 1100,
    "cajaAbc": 4000,
    "mangoMadera": 860,
    "varilla": 250,
    "prisionero": 100,
    "soporteAbc": 12000,
    "abcCmSimple": 40,
    "abcCmAmbas": 80,
    "selloPerdidaCorteCm": 0.8
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM fabricacion_parametros fp WHERE fp.effective_from = TIMESTAMPTZ '1970-01-01 00:00:00+00'
);

CREATE OR REPLACE FUNCTION calc_sello_fabrication_cost()
RETURNS TRIGGER AS $$
DECLARE
  v_item_type TEXT;
  v_cost NUMERIC := 0;
  v_value NUMERIC := COALESCE(NEW.valor, 0);
  v_minor_cm NUMERIC;
  v_major_cm NUMERIC;
  v_major_with_loss_cm NUMERIC;
  v_cm_cost NUMERIC := 0;
  v_material_cost NUMERIC := 0;
  v_abc_case TEXT;
  v_abc_cm NUMERIC;
  v_soldador_power TEXT;
  v_haystack TEXT;
  v_ref_ts TIMESTAMPTZ;
  v_p JSONB;
  j TEXT;
  v_amort NUMERIC;
  v_s100 NUMERIC;
  v_s200 NUMERIC;
  v_base NUMERIC;
  v_mango NUMERIC;
  v_p12 NUMERIC;
  v_p20 NUMERIC;
  v_p25 NUMERIC;
  v_p40 NUMERIC;
  v_p63 NUMERIC;
  v_tubo NUMERIC;
  v_caja NUMERIC;
  v_mm NUMERIC;
  v_var NUMERIC;
  v_pri NUMERIC;
  v_sop NUMERIC;
  v_abc1 NUMERIC;
  v_abc2 NUMERIC;
  v_loss NUMERIC;
BEGIN
  -- Tarifa según creación del ítem (histórico estable); si falta created_at, NOW()
  v_ref_ts := COALESCE(OLD.created_at, NEW.created_at, NOW());
  v_p := fabricacion_params_at(v_ref_ts);

  j := v_p->>'amortFresa';
  v_amort := CASE WHEN j IS NULL OR j = '' THEN 5600 ELSE (j)::NUMERIC END;
  j := v_p->>'soldador100';
  v_s100 := CASE WHEN j IS NULL OR j = '' THEN 13000 ELSE (j)::NUMERIC END;
  j := v_p->>'soldador200';
  v_s200 := CASE WHEN j IS NULL OR j = '' THEN 30000 ELSE (j)::NUMERIC END;
  j := v_p->>'baseRemachadora';
  v_base := CASE WHEN j IS NULL OR j = '' THEN 13000 ELSE (j)::NUMERIC END;
  j := v_p->>'mangoGolpe';
  v_mango := CASE WHEN j IS NULL OR j = '' THEN 7000 ELSE (j)::NUMERIC END;
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
  j := v_p->>'tubo';
  v_tubo := CASE WHEN j IS NULL OR j = '' THEN 1100 ELSE (j)::NUMERIC END;
  j := v_p->>'cajaAbc';
  v_caja := CASE WHEN j IS NULL OR j = '' THEN 4000 ELSE (j)::NUMERIC END;
  j := v_p->>'mangoMadera';
  v_mm := CASE WHEN j IS NULL OR j = '' THEN 860 ELSE (j)::NUMERIC END;
  j := v_p->>'varilla';
  v_var := CASE WHEN j IS NULL OR j = '' THEN 250 ELSE (j)::NUMERIC END;
  j := v_p->>'prisionero';
  v_pri := CASE WHEN j IS NULL OR j = '' THEN 100 ELSE (j)::NUMERIC END;
  j := v_p->>'soporteAbc';
  v_sop := CASE WHEN j IS NULL OR j = '' THEN 12000 ELSE (j)::NUMERIC END;
  j := v_p->>'abcCmSimple';
  v_abc1 := CASE WHEN j IS NULL OR j = '' THEN 40 ELSE (j)::NUMERIC END;
  j := v_p->>'abcCmAmbas';
  v_abc2 := CASE WHEN j IS NULL OR j = '' THEN 80 ELSE (j)::NUMERIC END;
  j := v_p->>'selloPerdidaCorteCm';
  v_loss := CASE WHEN j IS NULL OR j = '' THEN 0.8 ELSE (j)::NUMERIC END;

  v_item_type := COALESCE(NEW.item_type, 'SELLO');

  IF v_item_type = 'SOLDADOR' THEN
    v_soldador_power := UPPER(COALESCE(NEW.item_config->>'soldadorPower', ''));
    v_haystack := UPPER(COALESCE(NEW.diseno, '') || ' ' || COALESCE(NEW.nota, ''));

    IF v_soldador_power LIKE '%100%' OR v_haystack LIKE '%100W%' OR v_haystack LIKE '%100 W%' THEN
      v_cost := v_s100 + v_amort;
    ELSE
      v_cost := v_s200 + v_amort;
    END IF;

  ELSIF v_item_type = 'MANGO_GOLPE' THEN
    v_cost := v_mango;

  ELSIF v_item_type = 'BASE_REMACHADORA' THEN
    v_cost := v_base + v_amort;

  ELSIF v_item_type = 'ABECEDARIO' THEN
    v_abc_case := UPPER(COALESCE(NEW.item_config->>'abecedarioCase', 'MAYUSCULA'));
    IF v_abc_case = 'AMBAS' THEN
      v_abc_cm := v_abc2;
    ELSE
      v_abc_cm := v_abc1;
    END IF;

    v_material_cost := ROUND((v_abc_cm * v_p12)::NUMERIC, 1);
    v_cost := v_amort + v_sop + v_mm + v_var + v_pri + v_caja + v_tubo + v_material_cost;

  ELSE
    v_minor_cm := LEAST(COALESCE(NEW.ancho_real, 0), COALESCE(NEW.largo_real, 0));
    v_major_cm := GREATEST(COALESCE(NEW.ancho_real, 0), COALESCE(NEW.largo_real, 0));

    v_major_with_loss_cm := v_major_cm + v_loss;

    IF v_minor_cm <= 1.2 THEN
      v_cm_cost := v_p12;
    ELSIF v_minor_cm <= 2.0 THEN
      v_cm_cost := v_p20;
    ELSIF v_minor_cm <= 2.5 THEN
      v_cm_cost := v_p25;
    ELSIF v_minor_cm <= 4.0 THEN
      v_cm_cost := v_p40;
    ELSE
      v_cm_cost := v_p63;
    END IF;

    v_material_cost := ROUND((v_major_with_loss_cm * v_cm_cost)::NUMERIC, 1);
    v_cost := v_amort + v_mm + v_var + v_pri + v_tubo + v_material_cost;
  END IF;

  NEW.costo_fabricacion := ROUND(v_cost::NUMERIC, 1);
  NEW.margen_fabricacion := ROUND((v_value - NEW.costo_fabricacion)::NUMERIC, 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
