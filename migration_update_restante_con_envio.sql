-- Migración: Actualizar función update_orden_totals para incluir costo de envío en el cálculo del restante
-- El restante ahora se calcula como: (valor_total - senia_total) + costo_envio

-- Función auxiliar para obtener el costo de envío
CREATE OR REPLACE FUNCTION get_shipping_cost(
    p_empresa_envio VARCHAR(50),
    p_tipo_envio VARCHAR(20)
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_costo DECIMAL(10,2);
BEGIN
    -- Si no hay empresa de envío o es "Retiro", retornar 0
    IF p_empresa_envio IS NULL OR p_empresa_envio = 'Retiro' OR p_tipo_envio IS NULL OR p_tipo_envio = 'Retiro' THEN
        RETURN 0;
    END IF;

    -- Obtener el costo de envío activo más reciente
    SELECT costo INTO v_costo
    FROM costos_de_envio
    WHERE empresa = p_empresa_envio
      AND servicio = p_tipo_envio
      AND activo = true
    ORDER BY activo_desde DESC
    LIMIT 1;

    -- Si no se encuentra, retornar 0
    RETURN COALESCE(v_costo, 0);
END;
$$ LANGUAGE plpgsql;

-- Actualizar función para calcular totales de órdenes incluyendo costo de envío
CREATE OR REPLACE FUNCTION update_orden_totals()
RETURNS TRIGGER AS $$
DECLARE
    total_sellos INTEGER;
    total_senia DECIMAL(10,2);
    total_valor DECIMAL(10,2);
    total_restante DECIMAL(10,2);
    costo_envio DECIMAL(10,2);
    orden_id_val UUID;
BEGIN
    -- Obtener el ID de la orden
    orden_id_val := COALESCE(NEW.orden_id, OLD.orden_id);
    
    -- Calcular totales de la orden desde los sellos
    SELECT 
        COUNT(*),
        COALESCE(SUM(senia), 0),
        COALESCE(SUM(valor), 0),
        COALESCE(SUM(valor - senia), 0)
    INTO total_sellos, total_senia, total_valor, total_restante
    FROM sellos 
    WHERE orden_id = orden_id_val;
    
    -- Obtener el costo de envío de la orden
    SELECT get_shipping_cost(empresa_envio, tipo_envio)
    INTO costo_envio
    FROM ordenes
    WHERE id = orden_id_val;
    
    -- Calcular el restante incluyendo el costo de envío
    total_restante := total_restante + COALESCE(costo_envio, 0);
    
    -- Actualizar la orden
    UPDATE ordenes 
    SET 
        cantidad_sellos = total_sellos,
        senia_total = total_senia,
        valor_total = total_valor,
        restante = total_restante,
        updated_at = NOW()
    WHERE id = orden_id_val;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- También necesitamos un trigger para actualizar el restante cuando cambia la empresa o tipo de envío
CREATE OR REPLACE FUNCTION update_orden_restante_on_shipping_change()
RETURNS TRIGGER AS $$
DECLARE
    total_sellos INTEGER;
    total_senia DECIMAL(10,2);
    total_valor DECIMAL(10,2);
    total_restante DECIMAL(10,2);
    costo_envio DECIMAL(10,2);
BEGIN
    -- Solo actualizar si cambió empresa_envio o tipo_envio
    IF (OLD.empresa_envio IS DISTINCT FROM NEW.empresa_envio) OR 
       (OLD.tipo_envio IS DISTINCT FROM NEW.tipo_envio) THEN
        
        -- Calcular totales de la orden desde los sellos
        SELECT 
            COUNT(*),
            COALESCE(SUM(senia), 0),
            COALESCE(SUM(valor), 0),
            COALESCE(SUM(valor - senia), 0)
        INTO total_sellos, total_senia, total_valor, total_restante
        FROM sellos 
        WHERE orden_id = NEW.id;
        
        -- Obtener el nuevo costo de envío
        costo_envio := get_shipping_cost(NEW.empresa_envio, NEW.tipo_envio);
        
        -- Calcular el restante incluyendo el costo de envío
        total_restante := total_restante + COALESCE(costo_envio, 0);
        
        -- Actualizar el restante
        NEW.restante := total_restante;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para actualizar restante cuando cambia el envío
DROP TRIGGER IF EXISTS trigger_update_orden_restante_on_shipping_change ON ordenes;
CREATE TRIGGER trigger_update_orden_restante_on_shipping_change
    BEFORE UPDATE ON ordenes
    FOR EACH ROW
    WHEN (
        OLD.empresa_envio IS DISTINCT FROM NEW.empresa_envio OR 
        OLD.tipo_envio IS DISTINCT FROM NEW.tipo_envio
    )
    EXECUTE FUNCTION update_orden_restante_on_shipping_change();

-- Actualizar comentario de la columna restante
COMMENT ON COLUMN ordenes.restante IS 'Calculado automáticamente: valor_total - senia_total + costo_envio';




