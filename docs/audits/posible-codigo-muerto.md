# Auditoría — Posible código muerto o sin uso

"Posible": verificado por búsqueda de referencias en `src/` al 2026-09-27; puede haber usos dinámicos. **No se borró nada.**

<a id="aud-dead-001"></a>

### AUD-DEAD-001 · `NewOrderForm.tsx`
Sin importaciones; el alta usa `NewOrderStepForm`.

<a id="aud-dead-002"></a>

### AUD-DEAD-002 · `NewTaskDialog` / `NewTaskForm` (Producción)
`NewTaskDialog` no se importa en ningún lado.

<a id="aud-dead-003"></a>

### AUD-DEAD-003 · Vista "lista" de Programas (`ProgramCard`)
No es código muerto pero está **escondida** (se activa desde el diálogo de orden) y es el único lugar con: subir `.crv3d` a mano + conciliación (`SyncReconcileDialog`), revisión por sello (`DoneReviewDialog`) y `StampsSelectionDialog`. Ver [Q-PROG-007](../14-open-questions/programas.md#q-prog-007).

<a id="aud-dead-004"></a>

### AUD-DEAD-004 · `uploadVerifiedAspire`
Marcada `@deprecated`; expuesta en `usePrograms` pero no la usa ninguna pantalla.

<a id="aud-dead-005"></a>

### AUD-DEAD-005 · Tabla `catalogo_items`
No referenciada por el frontend (solo en `types.ts`). RLS desactivado.

<a id="aud-dead-006"></a>

### AUD-DEAD-006 · Aprobación de usuarios
`approveRegistrationRequest`, `rejectRegistrationRequest`, `getPendingRegistrationRequests`, `getAllRegistrationRequests`, `getUserRegistrationStatus` sin uso; `/admin/registros` redirige.

<a id="aud-dead-007"></a>

### AUD-DEAD-007 · Componentes/hooks sin uso
`components/home/RevealSection.tsx`, `lib/hooks/useShowAfterPaint.ts`.

<a id="aud-dead-008"></a>

### AUD-DEAD-008 · Mocks
`lib/mocks/orders.mock.ts`, `programs.mock.ts` sin uso; `production.mock.ts` importado en `ProductionStateChips.tsx` sin usarse.

<a id="aud-dead-009"></a>

### AUD-DEAD-009 · "Migraciones" desde el navegador
`lib/supabase/migrations.ts` (`runMigrations`) verifica `es_prioritario` y RPCs que probablemente ya no existen (`add_es_prioritario_column`, `apply_restante_envio_migration`); `lib/supabase/setup-migration.sql`.

<a id="aud-dead-010"></a>

### AUD-DEAD-010 · Trayectorias
Tabla `programa_trayectorias`, bucket `programas-trayectorias`, evento `TRAYECTORIAS_SUBIDAS`: preparados, sin implementación (ADR-010).

<a id="aud-dead-011"></a>

### AUD-DEAD-011 · Post-its globales de pedidos
`tareas_pedidos_globales` (0 filas) y `OrderTasksOverlay` activo; función `apply_order_sticky_tasks_migration` en la base.

<a id="aud-dead-012"></a>

### AUD-DEAD-012 · Vectorización automática
`vector-worker`, `/api/vectorize-enqueue`, `vector_jobs`, estado `EN_PROCESO`: apagados por flag.

<a id="aud-dead-013"></a>

### AUD-DEAD-013 · Tipos y campos sin respaldo
`ProgramType`, `ProgramStatus`, `ProgramCategory`, `Program.version/status/category/createdBy/tags/settings`, `ShippingOriginMethod`, `VITE_VECTORIZACION_ENABLED` (en `.env.local.example`, sin uso en `src`). Dependencia npm `unicornstudio-react` sin importaciones en `src`.

<a id="aud-dead-014"></a>

### AUD-DEAD-014 · Valores de estado sin uso
`estado_vectorizacion='DESCARGADO'` (legado, elegible a mano), `etiqueta_estado` `pendiente`/`pagando`, `tipo_planchuela=100`, `programa.maquina='Circular'`, `programa.estado_fabricacion`, `programa.tiempo_maximo`, `sellos.tiempo`.

<a id="aud-dead-015"></a>

### AUD-DEAD-015 · Archivos sueltos en la raíz
Versionados: `tatus`, `progress status.svg`. No versionados: `_deploy_*`, `_mcp_*`, `_b64_*`, `_chunk_*`, `_cs*`, `_da_*`, `_half*`, `_linechunk_*`, `_part*`, `_ps_chunk_*`, `_programa_sync_*`, `_query_mcp_keys.py`, `_inspect_tokens*.py`, `tmp-*`, `tmp_*`, `actual.md` (copia vieja de la edge `webhook-bot`), `vector-worker.tgz`, `dist/`. Además hay **CSV/PDF con datos de clientes** en la raíz (no versionados). Ver [Q-ARQ-005](../14-open-questions/arquitectura.md#q-arq-005).

<a id="aud-dead-016"></a>

### AUD-DEAD-016 · Documentos de diseño superados
`PLAN_INTEGRACION_CORREO_API_FASE_1.md` (reemplazado, según el plan nuevo), `info_de_pagina_pedidos.md` (2025-11), `database_*.md/sql` (desactualizados), `webhook_*.md` (varias versiones de la misma solución).
