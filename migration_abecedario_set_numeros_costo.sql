-- =============================================================================
-- Abecedario: set de números (0-9) en costo de fabricación
-- -----------------------------------------------------------------------------
-- Regla (Q-PROD-008, 2026-11-10):
-- - Un set de números son los dígitos 0 al 9.
-- - Precio de venta: $63.250 (ya en precios_abecedario / SEED).
-- - Material: ~15 cm de planchuela de 12,7 mm → param abcCmNumeros (default 15).
-- - Se suma al material del abecedario: numeros * abcCmNumeros * planchuela12.
-- - Si no hay juegos de letras (solo números), no se cobra el cm de letras.
-- Los costos ya guardados no cambian hasta que se actualice el sello.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calc_sello_fabrication_cost()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  v_abc_numeros INT;
  v_abc_may INT;
  v_abc_min INT;
  v_has_letter_counts BOOLEAN;
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
  v_abc_num_cm NUMERIC;
  v_loss NUMERIC;
  v_ancho_cm NUMERIC;
  v_largo_cm NUMERIC;
BEGIN
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
  j := v_p->>'abcCmNumeros';
  v_abc_num_cm := CASE WHEN j IS NULL OR j = '' THEN 15 ELSE (j)::NUMERIC END;
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
    v_has_letter_counts :=
      (NEW.item_config ? 'abecedarioMayusculas')
      OR (NEW.item_config ? 'abecedarioMinusculas');
    v_abc_may := GREATEST(0, FLOOR(COALESCE((NEW.item_config->>'abecedarioMayusculas')::NUMERIC, 0)));
    v_abc_min := GREATEST(0, FLOOR(COALESCE((NEW.item_config->>'abecedarioMinusculas')::NUMERIC, 0)));
    v_abc_numeros := GREATEST(0, FLOOR(COALESCE((NEW.item_config->>'abecedarioNumeros')::NUMERIC, 0)));
    v_abc_case := UPPER(COALESCE(NEW.item_config->>'abecedarioCase', ''));

    IF v_has_letter_counts THEN
      -- Un juego de may. o de min. ≈ abcCmSimple cm de planchuela 12.
      v_abc_cm := (v_abc_may + v_abc_min) * v_abc1;
    ELSIF v_abc_case = 'AMBAS' THEN
      v_abc_cm := v_abc2;
    ELSIF v_abc_case = 'MAYUSCULA' OR v_abc_case = 'MINUSCULA' THEN
      v_abc_cm := v_abc1;
    ELSE
      -- Solo números (u abecedario sin case): no cobrar cm de letras.
      v_abc_cm := 0;
    END IF;

    v_abc_cm := v_abc_cm + (v_abc_numeros * v_abc_num_cm);
    v_material_cost := ROUND((v_abc_cm * v_p12)::NUMERIC, 1);
    v_cost := v_amort + v_sop + v_mm + v_var + v_pri + v_caja + v_tubo + v_material_cost;

  ELSE
    IF NEW.ancho_fabricacion_mm IS NOT NULL AND NEW.largo_fabricacion_mm IS NOT NULL
       AND NEW.ancho_fabricacion_mm > 0 AND NEW.largo_fabricacion_mm > 0 THEN
      v_ancho_cm := NEW.ancho_fabricacion_mm / 10.0;
      v_largo_cm := NEW.largo_fabricacion_mm / 10.0;
    ELSE
      v_ancho_cm := COALESCE(NEW.ancho_real, 0);
      v_largo_cm := COALESCE(NEW.largo_real, 0);
    END IF;

    v_minor_cm := LEAST(v_ancho_cm, v_largo_cm);
    v_major_cm := GREATEST(v_ancho_cm, v_largo_cm);

    v_major_with_loss_cm := v_major_cm + v_loss;

    IF v_minor_cm <= 1.2 THEN
      v_cm_cost := v_p12;
    ELSIF v_minor_cm <= 1.8 THEN
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
$function$;
