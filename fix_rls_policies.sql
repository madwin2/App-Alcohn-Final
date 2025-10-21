-- =====================================================
-- FIX RLS POLICIES PARA ALCOHN AI
-- =====================================================

-- Eliminar políticas existentes que pueden estar causando problemas
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver todo" ON clientes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver todo" ON direcciones;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver todo" ON ordenes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver todo" ON sellos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver todo" ON programa;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver todo" ON costos_de_envio;

-- Crear políticas más permisivas para desarrollo
-- Estas políticas permiten todas las operaciones para usuarios autenticados

-- Políticas para CLIENTES
CREATE POLICY "Permitir todo para usuarios autenticados" ON clientes
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas para DIRECCIONES  
CREATE POLICY "Permitir todo para usuarios autenticados" ON direcciones
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas para ORDENES
CREATE POLICY "Permitir todo para usuarios autenticados" ON ordenes
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas para SELLOS
CREATE POLICY "Permitir todo para usuarios autenticados" ON sellos
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas para PROGRAMA
CREATE POLICY "Permitir todo para usuarios autenticados" ON programa
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas para COSTOS_DE_ENVIO
CREATE POLICY "Permitir todo para usuarios autenticados" ON costos_de_envio
    FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- ALTERNATIVA: Deshabilitar RLS temporalmente para desarrollo
-- =====================================================
-- Si las políticas anteriores no funcionan, puedes deshabilitar RLS:

-- ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE direcciones DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE ordenes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE sellos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE programa DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE costos_de_envio DISABLE ROW LEVEL SECURITY;
