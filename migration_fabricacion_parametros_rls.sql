-- Políticas RLS para que usuarios autenticados lean e inserten versiones desde la app (clave anon + JWT).
-- Ejecutar después de crear la tabla fabricacion_parametros.

ALTER TABLE fabricacion_parametros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fabricacion_parametros_select_authenticated" ON fabricacion_parametros;
DROP POLICY IF EXISTS "fabricacion_parametros_insert_authenticated" ON fabricacion_parametros;

CREATE POLICY "fabricacion_parametros_select_authenticated"
  ON fabricacion_parametros FOR SELECT TO authenticated USING (true);

CREATE POLICY "fabricacion_parametros_insert_authenticated"
  ON fabricacion_parametros FOR INSERT TO authenticated WITH CHECK (true);
