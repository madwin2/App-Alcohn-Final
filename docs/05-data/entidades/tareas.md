# Tareas

Tres tablas con propósito parecido pero distinto (ver [plataforma](../../02-modules/plataforma/README.md#tareas-y-post-its)):

| Tabla | Campos | RLS | Uso |
|---|---|---|---|
| `tareas` | `orden_id`, `titulo`, `descripcion`, `estado` (`PENDING`,`IN_PROGRESS`,`COMPLETED`), `fecha_limite`, `completada_at`, `contexto` (`PEDIDOS`,`PRODUCCION`) | cualquier autenticado | Tareas ligadas a una orden, visibles en la celda de tareas (Producción las muestra como PENDIENTE/EN_PROGRESO/COMPLETADO) |
| `tareas_pedidos_globales` | `orden_id`, `tarea_id`, `asignado_a_user_id`, `creado_por_user_id`, `texto`, `pos_x`, `pos_y` | solo asignado/creador | Post-its flotantes en todas las pantallas del asignado |
| `tareas_dashboard` | `asignado_a_user_id`, `creado_por_user_id`, `texto`, `pos_x`, `pos_y` | solo asignado (ver/editar/borrar), creador (crear) | Tareas entre compañeros y de reposición de stock (`[STOCK_REPLENISH]` en el texto) en el Inicio |
