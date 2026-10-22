-- =============================================================================
-- Stock de planchuelas de bronce por pieza (docs/02-modules/stock/propuesta-stock-bronce.md).
-- POL-091…095 · Q-STK-001/007/008.
--
-- - bronce_compras / bronce_piezas / bronce_movimientos.
-- - Al terminar un programa (todos sus sellos en Hecho, Verificar o Rehacer) se
--   descuenta, por cada fila (= ancho), Σ (lado mayor + pérdida de corte) de la
--   pieza más corta en la que entra (máx. C 400, G/XL 250). Si en G/XL no hay
--   ninguna ≤ 250, usa una más larga (sobresale). Sin pieza: queda registrado
--   con sin_pieza = true y pide conteo de ese ancho.
-- - Una pieza con menos de 25 mm pasa a retazo.
-- - Sellos Hecho sin programa no descuentan pieza (siguen en bronce_consumo).
-- - El stock arranca con el primer ingreso o conteo: mientras no exista ninguna
--   pieza cargada, terminar un programa no registra nada.
-- Idempotente: se puede correr de nuevo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bronce_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  nota TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bronce_piezas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ancho_ref SMALLINT NOT NULL CHECK (ancho_ref IN (12, 19, 25, 38, 63)),
  largo_mm NUMERIC(7, 1) NOT NULL CHECK (largo_mm >= 0),
  largo_inicial_mm NUMERIC(7, 1) NOT NULL CHECK (largo_inicial_mm > 0),
  estado TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'retazo', 'baja')),
  compra_id UUID REFERENCES public.bronce_compras(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.bronce_piezas IS
  'Piezas físicas de planchuela de bronce. ancho_ref usa la nomenclatura de la app (19 = 20 mm, 38 = 40 mm).';

CREATE INDEX IF NOT EXISTS idx_bronce_piezas_ancho_estado
  ON public.bronce_piezas (ancho_ref, estado, largo_mm);

CREATE TABLE IF NOT EXISTS public.bronce_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'CONSUMO', 'AJUSTE', 'RETAZO', 'BAJA', 'CONTEO')),
  ancho_ref SMALLINT NOT NULL CHECK (ancho_ref IN (12, 19, 25, 38, 63)),
  pieza_id UUID REFERENCES public.bronce_piezas(id) ON DELETE SET NULL,
  mm NUMERIC(7, 1) NOT NULL DEFAULT 0,
  largo_antes_mm NUMERIC(7, 1),
  largo_despues_mm NUMERIC(7, 1),
  programa_id UUID REFERENCES public.programa(id) ON DELETE SET NULL,
  maquina TEXT,
  sobresale BOOLEAN NOT NULL DEFAULT FALSE,
  sin_pieza BOOLEAN NOT NULL DEFAULT FALSE,
  nota TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bronce_movimientos_ancho_fecha
  ON public.bronce_movimientos (ancho_ref, created_at DESC);

-- Una sola vez por fila de programa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bronce_movimientos_consumo_programa
  ON public.bronce_movimientos (programa_id, ancho_ref)
  WHERE tipo = 'CONSUMO' AND programa_id IS NOT NULL;

-- Lectura para usuarios logueados; escritura solo por las funciones de abajo.
ALTER TABLE public.bronce_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bronce_piezas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bronce_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bronce_compras_select_authenticated ON public.bronce_compras;
CREATE POLICY bronce_compras_select_authenticated ON public.bronce_compras
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bronce_piezas_select_authenticated ON public.bronce_piezas;
CREATE POLICY bronce_piezas_select_authenticated ON public.bronce_piezas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bronce_movimientos_select_authenticated ON public.bronce_movimientos;
CREATE POLICY bronce_movimientos_select_authenticated ON public.bronce_movimientos
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Constantes (POL-092 / POL-095). Mismos valores que src/lib/bronce/stock.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bronce_pieza_min_util_mm()
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 25::NUMERIC $$;

CREATE OR REPLACE FUNCTION public.bronce_largo_max_maquina_mm(p_maquina TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p_maquina
    WHEN 'C' THEN COALESCE(NULLIF(fabricacion_params_at(NOW())->>'largoMaximoPlanchuelaMm_C', '')::NUMERIC, 400)
    WHEN 'G' THEN COALESCE(NULLIF(fabricacion_params_at(NOW())->>'largoMaximoPlanchuelaMm_G', '')::NUMERIC, 250)
    WHEN 'XL' THEN COALESCE(NULLIF(fabricacion_params_at(NOW())->>'largoMaximoPlanchuelaMm_XL', '')::NUMERIC, 250)
    ELSE NULL
  END
$$;

-- ---------------------------------------------------------------------------
-- Descuento de un programa terminado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bronce_descontar_programa(p_programa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_maquina TEXT;
  v_max NUMERIC;
  v_loss_cm NUMERIC;
  j TEXT;
  v_fila RECORD;
  v_pieza_id UUID;
  v_pieza_largo NUMERIC;
  v_sobresale BOOLEAN;
  v_despues NUMERIC;
  v_count INTEGER := 0;
BEGIN
  IF p_programa_id IS NULL THEN RETURN 0; END IF;

  -- El stock todavía no se empezó a llevar.
  IF NOT EXISTS (SELECT 1 FROM public.bronce_piezas) THEN RETURN 0; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bronce_programa:' || p_programa_id::TEXT));

  SELECT maquina INTO v_maquina FROM public.programa WHERE id = p_programa_id;
  v_max := bronce_largo_max_maquina_mm(v_maquina);
  IF v_max IS NULL THEN RETURN 0; END IF; -- ABC u otra: sin planchuelas

  j := fabricacion_params_at(NOW())->>'selloPerdidaCorteCm';
  v_loss_cm := CASE WHEN j IS NULL OR j = '' THEN 0.8 ELSE j::NUMERIC END;

  FOR v_fila IN
    WITH s AS (
      SELECT
        CASE WHEN ancho_fabricacion_mm > 0 AND largo_fabricacion_mm > 0
          THEN ancho_fabricacion_mm / 10.0 ELSE COALESCE(ancho_real, 0) END AS a,
        CASE WHEN ancho_fabricacion_mm > 0 AND largo_fabricacion_mm > 0
          THEN largo_fabricacion_mm / 10.0 ELSE COALESCE(largo_real, 0) END AS l,
        tipo_planchuela AS tp
      FROM public.sellos
      WHERE programa_id = p_programa_id
        AND COALESCE(item_type, 'SELLO') = 'SELLO'
    ), d AS (
      SELECT LEAST(a, l) AS mi, GREATEST(a, l) AS ma, tp FROM s WHERE LEAST(a, l) > 0
    )
    SELECT
      (CASE
        WHEN tp IN (12, 19, 25, 38, 63) THEN tp
        WHEN mi <= 1.2 THEN 12
        WHEN mi <= 1.8 THEN 19
        WHEN mi <= 2.5 THEN 25
        WHEN mi <= 4.0 THEN 38
        ELSE 63
      END)::SMALLINT AS ancho_ref,
      ROUND(SUM((ma + v_loss_cm) * 10)::NUMERIC, 1) AS largo_mm
    FROM d
    GROUP BY 1
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.bronce_movimientos
      WHERE tipo = 'CONSUMO' AND programa_id = p_programa_id AND ancho_ref = v_fila.ancho_ref
    );

    v_sobresale := FALSE;
    v_pieza_id := NULL;
    v_pieza_largo := NULL;

    -- 1) La más corta en la que entra, sin pasar el máximo de la máquina.
    SELECT id, largo_mm INTO v_pieza_id, v_pieza_largo
    FROM public.bronce_piezas
    WHERE ancho_ref = v_fila.ancho_ref AND estado = 'disponible'
      AND largo_mm >= v_fila.largo_mm AND largo_mm <= v_max
    ORDER BY largo_mm ASC, created_at ASC
    LIMIT 1
    FOR UPDATE;

    -- 2) G / XL: si no hay, una más larga (sobresale).
    IF v_pieza_id IS NULL AND v_maquina IN ('G', 'XL') THEN
      SELECT id, largo_mm INTO v_pieza_id, v_pieza_largo
      FROM public.bronce_piezas
      WHERE ancho_ref = v_fila.ancho_ref AND estado = 'disponible'
        AND largo_mm > v_max AND v_fila.largo_mm <= v_max
      ORDER BY largo_mm ASC, created_at ASC
      LIMIT 1
      FOR UPDATE;
      v_sobresale := v_pieza_id IS NOT NULL;
    END IF;

    IF v_pieza_id IS NULL THEN
      -- 3) Ninguna alcanza: se registra igual y se pide conteo.
      INSERT INTO public.bronce_movimientos (tipo, ancho_ref, mm, programa_id, maquina, sin_pieza, nota)
      VALUES ('CONSUMO', v_fila.ancho_ref, v_fila.largo_mm, p_programa_id, v_maquina, TRUE,
              'Ninguna pieza cargada alcanzaba para esta fila');
    ELSE
      v_despues := GREATEST(v_pieza_largo - v_fila.largo_mm, 0);
      UPDATE public.bronce_piezas
      SET largo_mm = v_despues,
          estado = CASE WHEN v_despues < bronce_pieza_min_util_mm() THEN 'retazo' ELSE 'disponible' END,
          updated_at = NOW()
      WHERE id = v_pieza_id;

      INSERT INTO public.bronce_movimientos
        (tipo, ancho_ref, pieza_id, mm, largo_antes_mm, largo_despues_mm, programa_id, maquina, sobresale)
      VALUES ('CONSUMO', v_fila.ancho_ref, v_pieza_id, v_fila.largo_mm, v_pieza_largo, v_despues,
              p_programa_id, v_maquina, v_sobresale);

      IF v_despues < bronce_pieza_min_util_mm() THEN
        INSERT INTO public.bronce_movimientos (tipo, ancho_ref, pieza_id, mm, largo_antes_mm, largo_despues_mm, programa_id)
        VALUES ('RETAZO', v_fila.ancho_ref, v_pieza_id, v_despues, v_despues, v_despues, p_programa_id);
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bronce_descontar_programa(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: cuando el último sello del programa sale de lo pendiente.
-- Solo transiciones de no-terminado → terminado (Hecho → Verificar no dispara).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_bronce_descontar_programa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.programa_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.estado_fabricacion NOT IN ('Hecho', 'Verificar', 'Rehacer') THEN RETURN NEW; END IF;
  IF OLD.estado_fabricacion IN ('Hecho', 'Verificar', 'Rehacer') THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.sellos
    WHERE programa_id = NEW.programa_id
      AND COALESCE(estado_fabricacion, '') NOT IN ('Hecho', 'Verificar', 'Rehacer')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM bronce_descontar_programa(NEW.programa_id);
  RETURN NEW;
END;
$$;

-- El nombre ordena este trigger después de trigger_registrar_bronce_consumo.
REVOKE ALL ON FUNCTION public.trg_bronce_descontar_programa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bronce_largo_max_maquina_mm(TEXT) FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trigger_zz_bronce_descontar_programa ON public.sellos;
CREATE TRIGGER trigger_zz_bronce_descontar_programa
  AFTER UPDATE OF estado_fabricacion ON public.sellos
  FOR EACH ROW EXECUTE FUNCTION public.trg_bronce_descontar_programa();

-- ---------------------------------------------------------------------------
-- Ingreso de una compra: p_piezas = [{"ancho_ref": 25, "largo_mm": 400}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bronce_registrar_compra(p_piezas JSONB, p_nota TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra UUID;
  v_item JSONB;
  v_ref SMALLINT;
  v_largo NUMERIC;
  v_pieza UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_piezas IS NULL OR jsonb_typeof(p_piezas) <> 'array' OR jsonb_array_length(p_piezas) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene piezas';
  END IF;

  INSERT INTO public.bronce_compras (nota, created_by)
  VALUES (NULLIF(trim(p_nota), ''), auth.uid())
  RETURNING id INTO v_compra;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_piezas) LOOP
    v_ref := (v_item->>'ancho_ref')::SMALLINT;
    v_largo := (v_item->>'largo_mm')::NUMERIC;
    IF v_ref NOT IN (12, 19, 25, 38, 63) THEN RAISE EXCEPTION 'Ancho inválido: %', v_ref; END IF;
    IF v_largo IS NULL OR v_largo <= 0 OR v_largo > 2000 THEN RAISE EXCEPTION 'Largo inválido: %', v_largo; END IF;

    INSERT INTO public.bronce_piezas (ancho_ref, largo_mm, largo_inicial_mm, estado, compra_id)
    VALUES (v_ref, v_largo, v_largo,
            CASE WHEN v_largo < bronce_pieza_min_util_mm() THEN 'retazo' ELSE 'disponible' END, v_compra)
    RETURNING id INTO v_pieza;

    INSERT INTO public.bronce_movimientos (tipo, ancho_ref, pieza_id, mm, largo_despues_mm, nota)
    VALUES ('INGRESO', v_ref, v_pieza, v_largo, v_largo, NULLIF(trim(p_nota), ''));
  END LOOP;

  RETURN v_compra;
END;
$$;

-- ---------------------------------------------------------------------------
-- Conteo de un ancho: p_piezas es la lista completa de lo que hay.
-- [{"id": "<uuid opcional>", "largo_mm": 180}, ...]. Las disponibles que no
-- vienen en la lista se dan de baja. Deja un movimiento CONTEO como marca.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bronce_guardar_conteo(p_ancho_ref SMALLINT, p_piezas JSONB, p_nota TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_id UUID;
  v_largo NUMERIC;
  v_actual_id UUID;
  v_actual_largo NUMERIC;
  v_actual_estado TEXT;
  v_ids UUID[] := '{}';
  v_baja RECORD;
  v_estado TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_ancho_ref NOT IN (12, 19, 25, 38, 63) THEN RAISE EXCEPTION 'Ancho inválido: %', p_ancho_ref; END IF;
  IF p_piezas IS NULL OR jsonb_typeof(p_piezas) <> 'array' THEN RAISE EXCEPTION 'Conteo inválido'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_piezas) LOOP
    v_id := NULLIF(v_item->>'id', '')::UUID;
    v_largo := (v_item->>'largo_mm')::NUMERIC;
    IF v_largo IS NULL OR v_largo <= 0 OR v_largo > 2000 THEN RAISE EXCEPTION 'Largo inválido: %', v_largo; END IF;
    v_estado := CASE WHEN v_largo < bronce_pieza_min_util_mm() THEN 'retazo' ELSE 'disponible' END;

    v_actual_id := NULL;
    v_actual_largo := NULL;
    v_actual_estado := NULL;
    IF v_id IS NOT NULL AND v_id = ANY (v_ids) THEN RAISE EXCEPTION 'Pieza repetida en el conteo'; END IF;
    SELECT id, largo_mm, estado INTO v_actual_id, v_actual_largo, v_actual_estado
    FROM public.bronce_piezas
    WHERE id = v_id AND ancho_ref = p_ancho_ref
    FOR UPDATE;

    IF v_actual_id IS NULL THEN
      INSERT INTO public.bronce_piezas (ancho_ref, largo_mm, largo_inicial_mm, estado)
      VALUES (p_ancho_ref, v_largo, v_largo, v_estado)
      RETURNING id INTO v_id;
      INSERT INTO public.bronce_movimientos (tipo, ancho_ref, pieza_id, mm, largo_despues_mm, nota)
      VALUES ('AJUSTE', p_ancho_ref, v_id, v_largo, v_largo, 'Conteo: pieza nueva');
    ELSIF v_actual_largo IS DISTINCT FROM v_largo OR v_actual_estado IS DISTINCT FROM v_estado THEN
      UPDATE public.bronce_piezas SET largo_mm = v_largo, estado = v_estado, updated_at = NOW() WHERE id = v_id;
      INSERT INTO public.bronce_movimientos (tipo, ancho_ref, pieza_id, mm, largo_antes_mm, largo_despues_mm, nota)
      VALUES ('AJUSTE', p_ancho_ref, v_id, abs(v_largo - v_actual_largo), v_actual_largo, v_largo,
              format('Conteo: %s → %s mm', v_actual_largo, v_largo));
    END IF;

    v_ids := array_append(v_ids, v_id);
  END LOOP;

  FOR v_baja IN
    SELECT id, largo_mm FROM public.bronce_piezas
    WHERE ancho_ref = p_ancho_ref AND estado = 'disponible' AND NOT (id = ANY (v_ids))
    FOR UPDATE
  LOOP
    UPDATE public.bronce_piezas SET estado = 'baja', updated_at = NOW() WHERE id = v_baja.id;
    INSERT INTO public.bronce_movimientos (tipo, ancho_ref, pieza_id, mm, largo_antes_mm, largo_despues_mm, nota)
    VALUES ('BAJA', p_ancho_ref, v_baja.id, v_baja.largo_mm, v_baja.largo_mm, 0, 'Conteo: no está');
  END LOOP;

  INSERT INTO public.bronce_movimientos (tipo, ancho_ref, nota)
  VALUES ('CONTEO', p_ancho_ref, NULLIF(trim(p_nota), ''));

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.bronce_registrar_compra(JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bronce_guardar_conteo(SMALLINT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bronce_registrar_compra(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bronce_guardar_conteo(SMALLINT, JSONB, TEXT) TO authenticated;
