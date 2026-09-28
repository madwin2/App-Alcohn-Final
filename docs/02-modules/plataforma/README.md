# Plataforma (funciones transversales)

## Tareas y post-its

✅ Tres mecanismos distintos (ver [05-data/inconsistencias-de-nombres.md](../../05-data/inconsistencias-de-nombres.md#tareas)):

| Mecanismo | Tabla | Dónde se ve | Uso |
|---|---|---|---|
| Tareas de pedido/producción | `tareas` (`contexto` `PEDIDOS` o `PRODUCCION`; estado `PENDING`/`IN_PROGRESS`/`COMPLETED`; fecha límite) | Celda Tareas en Pedidos y Producción | 49 filas (48 de producción) |
| Post-its globales de pedido | `tareas_pedidos_globales` (posición x/y, asignado, creador) | `OrderTasksOverlay`, flota en **todas** las pantallas del usuario asignado | 0 filas |
| Tareas del dashboard | `tareas_dashboard` (texto, asignado, creador, posición) | Inicio: tareas de compañeros y reposición de stock (`[STOCK_REPLENISH]`) | 3 filas |
| Notas personales | `localStorage` | Inicio | — |

## Novedades y aviso de versión

✅ (plan: `actualizaciones-app.md`)
- `scripts/generate-version.mjs` genera `public/version.json` en cada build.
- `useAppVersionCheck` compara la versión cargada con la publicada (al volver a la pestaña) → `AppUpdateDialog` ofrece recargar.
- `lib/changelog/entries.ts`: novedades curadas a mano (ids 1–21, 2026-09-12 a 2026-09-27). `WhatsNewDialog` muestra las no vistas; `changelog_visto` guarda el último id visto por usuario. Es una **fuente útil** de "qué cambió y por qué" en lenguaje de usuario.

## Vistas de tabla

✅ `vistas_tabla` (por usuario y tabla: `pedidos`, `produccion`): columnas visibles, orden, anchos, filtros. `useTableViewPersistence`.

## Sonidos, tours y sandboxes

- `useSound` (sonido al crear pedido).
- Tours de onboarding en Vectorización y Programas.
- Rutas `/dev/*` y `/stock-pendiente` (ver [02-modules](../README.md#4-rutas-ocultas--de-desarrollo)).

## Historial de estados

✅ Triggers registran en `estado_historial` todo cambio de `estado_fabricacion`, `estado_venta` (por sello) y `estado_envio`, `estado_orden` (por orden), con fecha. Se usa para el cálculo de deudores (fecha en que pasó a `Foto`). No registra quién hizo el cambio.
