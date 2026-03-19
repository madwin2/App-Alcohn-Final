-- Tabla para tareas del dashboard asignadas entre compañeros
-- Las tareas personales siguen en localStorage; las asignadas por compañeros van acá

CREATE TABLE IF NOT EXISTS tareas_dashboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asignado_a_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creado_por_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_tareas_dashboard_asignado_a ON tareas_dashboard(asignado_a_user_id);
CREATE INDEX IF NOT EXISTS idx_tareas_dashboard_creado_por ON tareas_dashboard(creado_por_user_id);

-- RLS: cada usuario puede ver solo las tareas que le asignaron (asignado_a = yo)
ALTER TABLE tareas_dashboard ENABLE ROW LEVEL SECURITY;

-- Política: ver tareas donde yo soy el asignado
CREATE POLICY "Usuarios ven tareas asignadas a ellos"
    ON tareas_dashboard FOR SELECT
    USING (auth.uid() = asignado_a_user_id);

-- Política: cualquier usuario autenticado puede crear tareas (asignar a compañeros)
CREATE POLICY "Usuarios autenticados pueden crear tareas"
    ON tareas_dashboard FOR INSERT
    WITH CHECK (auth.uid() = creado_por_user_id);

-- Política: el asignado puede eliminar (marcar hecho) sus propias tareas
CREATE POLICY "Asignado puede eliminar sus tareas"
    ON tareas_dashboard FOR DELETE
    USING (auth.uid() = asignado_a_user_id);

COMMENT ON TABLE tareas_dashboard IS 'Tareas del dashboard asignadas por compañeros. Aparecen como sticky notes amarillas para el destinatario.';
