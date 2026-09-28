# Innovación

> Ruta: `/innovacion` · Página: `src/app/innovacion/index.tsx` · Componentes: `src/components/innovacion/*` · Servicio: `src/lib/supabase/services/innovation.service.ts` · Migración: `migration_add_innovation_module.sql`

## Propósito

✅ Tablero interno de **ideas y proyectos de mejora** de la empresa. No participa del ciclo de pedidos.

## Modelo

Área → Proyecto (idea) → Tarea → Subtarea, con comentarios, adjuntos (bucket público `adjuntos`), colaboradores y registro de actividad.

| Entidad | Estados / campos |
|---|---|
| Área | `Activa` / `Archivada`, color |
| Proyecto | estado `Pendiente`, `En proceso`, `Esperando revisión`, `Bloqueado`, `Finalizado`, `Cancelado`; prioridad `Baja`/`Media`/`Alta`/`Crítica`; responsable; vencimiento; progreso 0–100 |
| Tarea | mismos estados y prioridades; asignado; progreso; completada |
| Subtarea | asignado; completada |

✅ Automatizaciones (triggers): progreso de tarea = % de subtareas completas; progreso de proyecto = promedio/porcentaje de tareas (`recalculate_innovation_*_progress`); `updated_at` automático; `innovation_activity_log` (1.245 registros) de altas/cambios/bajas.

Uso real: 2 proyectos, 23 tareas.
