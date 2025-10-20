-- =====================================================
-- SCHEMA DE BASE DE DATOS PARA ALCOHN AI
-- Sistema de gestión de fabricación y venta de sellos
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLA: CLIENTES
-- =====================================================
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    medio_contacto VARCHAR(20) CHECK (medio_contacto IN ('Whatsapp', 'Facebook', 'Instagram', 'Mail')),
    telefono VARCHAR(20) NOT NULL,
    dni VARCHAR(20) UNIQUE,
    mail VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: DIRECCIONES
-- =====================================================
CREATE TABLE direcciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    activa BOOLEAN DEFAULT true,
    codigo_postal VARCHAR(10) NOT NULL,
    provincia VARCHAR(100) NOT NULL,
    localidad VARCHAR(100) NOT NULL,
    domicilio VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    dni VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: COSTOS_DE_ENVIO
-- =====================================================
CREATE TABLE costos_de_envio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa VARCHAR(50) NOT NULL CHECK (empresa IN ('Andreani', 'Correo Argentino', 'Via Cargo')),
    servicio VARCHAR(20) NOT NULL CHECK (servicio IN ('Domicilio', 'Sucursal')),
    costo DECIMAL(10,2) NOT NULL,
    activo_desde DATE DEFAULT CURRENT_DATE,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: ORDENES
-- =====================================================
CREATE TABLE ordenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    direccion_id UUID REFERENCES direcciones(id),
    empresa_envio VARCHAR(50) CHECK (empresa_envio IN ('Andreani', 'Correo Argentino', 'Via Cargo', 'Retiro')),
    tipo_envio VARCHAR(20) CHECK (tipo_envio IN ('Domicilio', 'Sucursal', 'Retiro')),
    cantidad_sellos INTEGER DEFAULT 0,
    senia_total DECIMAL(10,2) DEFAULT 0.00,
    valor_total DECIMAL(10,2) DEFAULT 0.00,
    restante DECIMAL(10,2) DEFAULT 0.00,
    seguimiento VARCHAR(100),
    estado_orden VARCHAR(30) CHECK (estado_orden IN ('Señado', 'Hecho', 'Foto', 'Transferido', 'Hacer Etiqueta', 'Etiqueta Lista', 'Despachado', 'Seguimiento Enviado')),
    fecha DATE DEFAULT CURRENT_DATE,
    estado_envio VARCHAR(30) CHECK (estado_envio IN ('Sin envio', 'Hacer Etiqueta', 'Etiqueta Lista', 'Despachado', 'Seguimiento Enviado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: PROGRAMA
-- =====================================================
CREATE TABLE programa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE DEFAULT CURRENT_DATE,
    nombre VARCHAR(100) NOT NULL,
    cantidad_sellos INTEGER DEFAULT 0,
    maquina VARCHAR(10) CHECK (maquina IN ('C', 'G', 'XL', 'ABC', 'Circular')),
    estado_fabricacion VARCHAR(20) CHECK (estado_fabricacion IN ('Sin Hacer', 'Haciendo', 'Hecho', 'Verificado', 'Rehacer')),
    tiempo_maximo INTEGER,
    largo_usado_63 DECIMAL(8,2) DEFAULT 0.00,
    largo_usado_38 DECIMAL(8,2) DEFAULT 0.00,
    largo_usado_25 DECIMAL(8,2) DEFAULT 0.00,
    largo_usado_19 DECIMAL(8,2) DEFAULT 0.00,
    largo_usado_12 DECIMAL(8,2) DEFAULT 0.00,
    verificado BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: SELLOS
-- =====================================================
CREATE TABLE sellos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
    programa_id UUID REFERENCES programa(id),
    fecha DATE DEFAULT CURRENT_DATE,
    tipo VARCHAR(20) CHECK (tipo IN ('Clasico', '3mm', 'Lacre', 'Alimento', 'ABC')),
    senia DECIMAL(10,2) DEFAULT 0.00,
    fecha_limite DATE,
    diseno TEXT,
    nota TEXT,
    valor DECIMAL(10,2) NOT NULL,
    restante DECIMAL(10,2) DEFAULT 0.00,
    estado_fabricacion VARCHAR(20) CHECK (estado_fabricacion IN ('Sin Hacer', 'Haciendo', 'Hecho', 'Rehacer', 'Retocar', 'Prioridad', 'Verificar')),
    estado_venta VARCHAR(20) CHECK (estado_venta IN ('Señado', 'Foto', 'Transferido')),
    archivo_base TEXT,
    foto_sello TEXT,
    tipo_planchuela INTEGER CHECK (tipo_planchuela IN (100, 63, 38, 25, 19, 12)),
    tiempo INTEGER,
    maquina VARCHAR(10) CHECK (maquina IN ('C', 'G', 'XL', 'ABC', 'Circular')),
    largo_real DECIMAL(8,2),
    ancho_real DECIMAL(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================
CREATE INDEX idx_clientes_dni ON clientes(dni);
CREATE INDEX idx_clientes_mail ON clientes(mail);
CREATE INDEX idx_ordenes_cliente_id ON ordenes(cliente_id);
CREATE INDEX idx_ordenes_fecha ON ordenes(fecha);
CREATE INDEX idx_sellos_orden_id ON sellos(orden_id);
CREATE INDEX idx_sellos_programa_id ON sellos(programa_id);
CREATE INDEX idx_sellos_estado_fabricacion ON sellos(estado_fabricacion);
CREATE INDEX idx_direcciones_cliente_id ON direcciones(cliente_id);
CREATE INDEX idx_programa_fecha ON programa(fecha);
CREATE INDEX idx_programa_estado_fabricacion ON programa(estado_fabricacion);

-- =====================================================
-- FUNCIONES PARA CAMPOS CALCULADOS
-- =====================================================

-- Función para actualizar campos calculados de sellos
CREATE OR REPLACE FUNCTION update_sello_restante()
RETURNS TRIGGER AS $$
BEGIN
    NEW.restante = NEW.valor - NEW.senia;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar campos calculados de órdenes
CREATE OR REPLACE FUNCTION update_orden_totals()
RETURNS TRIGGER AS $$
DECLARE
    total_sellos INTEGER;
    total_senia DECIMAL(10,2);
    total_valor DECIMAL(10,2);
    total_restante DECIMAL(10,2);
BEGIN
    -- Calcular totales de la orden
    SELECT 
        COUNT(*),
        COALESCE(SUM(senia), 0),
        COALESCE(SUM(valor), 0),
        COALESCE(SUM(valor - senia), 0)
    INTO total_sellos, total_senia, total_valor, total_restante
    FROM sellos 
    WHERE orden_id = COALESCE(NEW.orden_id, OLD.orden_id);
    
    -- Actualizar la orden
    UPDATE ordenes 
    SET 
        cantidad_sellos = total_sellos,
        senia_total = total_senia,
        valor_total = total_valor,
        restante = total_restante,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.orden_id, OLD.orden_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Función para actualizar cantidad de sellos en programa
CREATE OR REPLACE FUNCTION update_programa_cantidad()
RETURNS TRIGGER AS $$
DECLARE
    total_sellos INTEGER;
BEGIN
    -- Calcular cantidad de sellos del programa
    SELECT COUNT(*)
    INTO total_sellos
    FROM sellos 
    WHERE programa_id = COALESCE(NEW.programa_id, OLD.programa_id);
    
    -- Actualizar el programa
    UPDATE programa 
    SET 
        cantidad_sellos = total_sellos,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.programa_id, OLD.programa_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger para actualizar restante en sellos
CREATE TRIGGER trigger_update_sello_restante
    BEFORE INSERT OR UPDATE ON sellos
    FOR EACH ROW
    EXECUTE FUNCTION update_sello_restante();

-- Trigger para actualizar totales de órdenes cuando se modifica un sello
CREATE TRIGGER trigger_update_orden_totals
    AFTER INSERT OR UPDATE OR DELETE ON sellos
    FOR EACH ROW
    EXECUTE FUNCTION update_orden_totals();

-- Trigger para actualizar cantidad de sellos en programa
CREATE TRIGGER trigger_update_programa_cantidad
    AFTER INSERT OR UPDATE OR DELETE ON sellos
    FOR EACH ROW
    EXECUTE FUNCTION update_programa_cantidad();

-- =====================================================
-- FUNCIÓN PARA ACTUALIZAR TIMESTAMPS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de updated_at a todas las tablas
CREATE TRIGGER trigger_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_direcciones_updated_at
    BEFORE UPDATE ON direcciones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_ordenes_updated_at
    BEFORE UPDATE ON ordenes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_sellos_updated_at
    BEFORE UPDATE ON sellos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_programa_updated_at
    BEFORE UPDATE ON programa
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_costos_de_envio_updated_at
    BEFORE UPDATE ON costos_de_envio
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- POLÍTICAS RLS (ROW LEVEL SECURITY)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE direcciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellos ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos_de_envio ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (ajustar según necesidades de autenticación)
-- Por ahora permitir todo para usuarios autenticados
CREATE POLICY "Usuarios autenticados pueden ver todo" ON clientes
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden ver todo" ON direcciones
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden ver todo" ON ordenes
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden ver todo" ON sellos
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden ver todo" ON programa
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden ver todo" ON costos_de_envio
    FOR ALL USING (auth.role() = 'authenticated');

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Insertar costos de envío iniciales
INSERT INTO costos_de_envio (empresa, servicio, costo) VALUES
('Andreani', 'Domicilio', 1500.00),
('Andreani', 'Sucursal', 1200.00),
('Correo Argentino', 'Domicilio', 1800.00),
('Correo Argentino', 'Sucursal', 1400.00),
('Via Cargo', 'Domicilio', 2000.00),
('Via Cargo', 'Sucursal', 1600.00);

-- =====================================================
-- COMENTARIOS EN TABLAS Y COLUMNAS
-- =====================================================

COMMENT ON TABLE clientes IS 'Información de los clientes del sistema';
COMMENT ON TABLE direcciones IS 'Direcciones de envío de los clientes';
COMMENT ON TABLE ordenes IS 'Órdenes de pedidos de sellos';
COMMENT ON TABLE sellos IS 'Sellos individuales dentro de las órdenes';
COMMENT ON TABLE programa IS 'Programas de fabricación que agrupan sellos';
COMMENT ON TABLE costos_de_envio IS 'Costos de envío por empresa y tipo de servicio';

COMMENT ON COLUMN ordenes.cantidad_sellos IS 'Calculado automáticamente: suma de sellos en la orden';
COMMENT ON COLUMN ordenes.senia_total IS 'Calculado automáticamente: suma de señas de todos los sellos';
COMMENT ON COLUMN ordenes.valor_total IS 'Calculado automáticamente: suma de valores de todos los sellos';
COMMENT ON COLUMN ordenes.restante IS 'Calculado automáticamente: valor_total - senia_total';

COMMENT ON COLUMN sellos.restante IS 'Calculado automáticamente: valor - senia';
COMMENT ON COLUMN programa.cantidad_sellos IS 'Calculado automáticamente: cuenta de sellos asociados';
