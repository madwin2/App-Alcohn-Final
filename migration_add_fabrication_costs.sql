-- =============================================================================
-- Costos de fabricación calculados en DB (sellos + ordenes)
-- Usa largo_real / ancho_real de sellos (en cm) para calcular material de sellos.
-- =============================================================================

-- 1) Columnas nuevas
ALTER TABLE sellos
ADD COLUMN IF NOT EXISTS costo_fabricacion NUMERIC(12,1),
ADD COLUMN IF NOT EXISTS margen_fabricacion NUMERIC(12,1);

ALTER TABLE ordenes
ADD COLUMN IF NOT EXISTS costo_fabricacion_total NUMERIC(12,1),
ADD COLUMN IF NOT EXISTS margen_fabricacion_total NUMERIC(12,1);

-- 2) Cálculo por ítem (antes de guardar sello)
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
  v_abc_cm NUMERIC := 40;
  v_soldador_power TEXT;
  v_haystack TEXT;
BEGIN
  v_item_type := COALESCE(NEW.item_type, 'SELLO');

  IF v_item_type = 'SOLDADOR' THEN
    v_soldador_power := UPPER(COALESCE(NEW.item_config->>'soldadorPower', ''));
    v_haystack := UPPER(COALESCE(NEW.diseno, '') || ' ' || COALESCE(NEW.nota, ''));

    IF v_soldador_power LIKE '%100%' OR v_haystack LIKE '%100W%' OR v_haystack LIKE '%100 W%' THEN
      v_cost := 13000 + 5600;
    ELSE
      -- default: 200W
      v_cost := 30000 + 5600;
    END IF;

  ELSIF v_item_type = 'MANGO_GOLPE' THEN
    -- Regla de negocio: mango no lleva amortización
    v_cost := 7000;

  ELSIF v_item_type = 'BASE_REMACHADORA' THEN
    v_cost := 13000 + 5600;

  ELSIF v_item_type = 'ABECEDARIO' THEN
    v_abc_case := UPPER(COALESCE(NEW.item_config->>'abecedarioCase', 'MAYUSCULA'));
    IF v_abc_case = 'AMBAS' THEN
      v_abc_cm := 80;
    ELSE
      v_abc_cm := 40;
    END IF;

    -- 12mm => 375 por cm
    v_material_cost := ROUND((v_abc_cm * 375)::NUMERIC, 1);
    v_cost := 5600 + 12000 + 860 + 250 + 100 + 4000 + 1100 + v_material_cost;

  ELSE
    -- SELLO
    v_minor_cm := LEAST(COALESCE(NEW.ancho_real, 0), COALESCE(NEW.largo_real, 0));
    v_major_cm := GREATEST(COALESCE(NEW.ancho_real, 0), COALESCE(NEW.largo_real, 0));

    -- pérdida por corte: +8mm = +0.8cm
    v_major_with_loss_cm := v_major_cm + 0.8;

    -- elegir planchuela más chica posible (catálogo simplificado usa 40mm)
    IF v_minor_cm <= 1.2 THEN
      v_cm_cost := 375;   -- 12mm
    ELSIF v_minor_cm <= 2.0 THEN
      v_cm_cost := 530;   -- 20mm
    ELSIF v_minor_cm <= 2.5 THEN
      v_cm_cost := 690;   -- 25mm
    ELSIF v_minor_cm <= 4.0 THEN
      v_cm_cost := 1015;  -- 40mm
    ELSE
      v_cm_cost := 2190;  -- 63mm
    END IF;

    v_material_cost := ROUND((v_major_with_loss_cm * v_cm_cost)::NUMERIC, 1);
    v_cost := 5600 + 860 + 250 + 100 + 1100 + v_material_cost;
  END IF;

  NEW.costo_fabricacion := ROUND(v_cost::NUMERIC, 1);
  NEW.margen_fabricacion := ROUND((v_value - NEW.costo_fabricacion)::NUMERIC, 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calc_sello_fabrication_cost ON sellos;
CREATE TRIGGER trigger_calc_sello_fabrication_cost
  BEFORE INSERT OR UPDATE OF item_type, item_config, largo_real, ancho_real, valor, diseno, nota
  ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION calc_sello_fabrication_cost();

-- 3) Agregado por orden (después de cambios en sellos)
CREATE OR REPLACE FUNCTION refresh_orden_fabrication_totals(p_orden_id UUID)
RETURNS VOID AS $$
DECLARE
  v_cost_total NUMERIC;
  v_value_total NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(COALESCE(costo_fabricacion, 0)), 0),
    COALESCE(SUM(COALESCE(valor, 0)), 0)
  INTO v_cost_total, v_value_total
  FROM sellos
  WHERE orden_id = p_orden_id;

  UPDATE ordenes
  SET
    costo_fabricacion_total = ROUND(v_cost_total::NUMERIC, 1),
    margen_fabricacion_total = ROUND((v_value_total - v_cost_total)::NUMERIC, 1),
    updated_at = NOW()
  WHERE id = p_orden_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_refresh_orden_fabrication_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_orden_id UUID;
BEGIN
  v_orden_id := COALESCE(NEW.orden_id, OLD.orden_id);
  PERFORM refresh_orden_fabrication_totals(v_orden_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_refresh_orden_fabrication_totals ON sellos;
CREATE TRIGGER trigger_refresh_orden_fabrication_totals
  AFTER INSERT OR UPDATE OR DELETE ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_orden_fabrication_totals();

-- 4) Backfill de históricos
UPDATE sellos
SET item_type = COALESCE(item_type, 'SELLO');

UPDATE ordenes o
SET
  costo_fabricacion_total = x.cost_total,
  margen_fabricacion_total = x.value_total - x.cost_total
FROM (
  SELECT
    orden_id,
    ROUND(COALESCE(SUM(COALESCE(costo_fabricacion, 0)), 0)::NUMERIC, 1) AS cost_total,
    ROUND(COALESCE(SUM(COALESCE(valor, 0)), 0)::NUMERIC, 1) AS value_total
  FROM sellos
  GROUP BY orden_id
) x
WHERE o.id = x.orden_id;
