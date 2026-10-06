# Equipo (página personal)

Tablas del plan [Mi perfil](../../02-modules/perfil/README.md) / [`PLAN_PAGINA_PERSONAL.md`](../../../PLAN_PAGINA_PERSONAL.md). **Todas** nacen con RLS activado y políticas `TO authenticated` (datos personales).

| Tabla | Qué es | RLS |
|---|---|---|
| `perfiles_equipo` | Perfil laboral (puesto, área, fechas, color, vacaciones, `es_admin`, `activo`). 1 fila por usuario. | SELECT authenticated; INSERT/UPDATE solo `es_admin_equipo()`. Sin DELETE. Migración: `migration_equipo_perfiles.sql`. |
| `feriados` | Feriados nacionales (importados) y días de la empresa (`origen` = `nacional` \| `empresa`). Unique `(fecha, origen, nombre)`. | SELECT authenticated; ALL solo admin. Migración: `migration_equipo_calendario.sql`. |
| `ausencias_equipo` | Vacaciones (`fecha_desde`–`fecha_hasta`) y cambios de día (`desde` = `hasta`, `fecha_recupero` opcional). Sin aprobación. Superposición de vacaciones: validación en UI + deduplicación en cálculo de saldo (EQ-R10); exclusión `EXCLUDE` en DB opcional y pendiente de OK (`btree_gist`). | SELECT authenticated; INSERT propia o admin; UPDATE/DELETE propias futuras o admin. **Pendiente de aplicar** (`migration_equipo_fix_rls.sql`): `es_miembro_equipo()` en SELECT; no admin solo INSERT/UPDATE con `fecha_desde > hoy` (AR) en `WITH CHECK`. |
| `tareas_recurrentes` | Definición de tareas diarias / semanales / quincenales / mensuales / **unica** (día en `fecha` o legacy `semana_inicio`). Marcado por ocurrencia en `tareas_registro` (Mi día / calendario). Migración base: `migration_equipo_tareas_recurrentes.sql`. | SELECT propia o admin; INSERT propia o admin (para otro); UPDATE/DELETE si `user_id = auth.uid()` (dueño) o admin. `creado_por` solo informativo / notificación. |
| `notas_personales` | Anotaciones Markdown privadas (D3). | ALL solo `user_id = auth.uid()` (sin acceso admin). Migración: `migration_equipo_notas_necesidades.sql`. |
| `necesidades_equipo` | Pedidos “Lo que necesito” (`pendiente` \| `resuelta`, `respuesta_admin`). | SELECT propia o admin; INSERT propia; UPDATE persona si pendiente o admin; DELETE propia si pendiente. Migración: `migration_equipo_notas_necesidades.sql`. |
| `objetivos_personales` | Objetivos / “quiero aprender” (`tipo`, `estado`, `fecha_objetivo`, `logrado_at`). | SELECT propia o admin (S9); ALL escritura solo propia. Migración: `migration_equipo_crecimiento_feedback.sql`. |
| `feedback_equipo` | Feedback del admin (`felicitacion` \| `mejora` \| `correccion`, Markdown, `leido_at`, **`editado_at`** al editar tipo/título/texto — columna en migración pendiente). | SELECT destinatario o admin (S10); ALL escritura solo admin (`autor_user_id = auth.uid()`). Tras editar, app limpia `leido_at` (POL-059). |
| `ideas_corcho` | Ideas del corcho compartido (`propuesta` \| `aprobada` \| `descartada`). | SELECT authenticated; INSERT propia en propuesta; UPDATE/DELETE autor si propuesta o admin. Migración: `migration_equipo_corcho.sql`. Realtime. |
| `ideas_corcho_votos` | Votos 👍/👎 (`valor` 1 \| −1). PK `(idea_id, user_id)`. | SELECT authenticated; ALL solo propio y **no** sobre idea propia (S11). Realtime. |
| `ideas_corcho_vistas` | Ideas ya vistas por cada persona (cartel “Nueva”, D14). | ALL solo `user_id = auth.uid()`. |

Funciones auxiliares: `es_admin_equipo()` (`SECURITY DEFINER`); **`es_miembro_equipo()`** (perfil activo — **pendiente de aplicar**, `migration_equipo_fix_rls.sql`, POL-057).

**Trigger pendiente de aplicar** (`migration_equipo_fix_rls.sql`, EQ-R11 / POL implícita): `trg_perfiles_equipo_ultimo_admin` impide dejar al equipo sin un admin activo al desactivar o quitar rol admin.

RPC: `pausar_tarea_recurrente(p_id, p_activa)`; `marcar_feedback_leido(p_id)` (solo el destinatario setea `leido_at`).

**Saldos de vacaciones**: no hay columna de “disponibles”; se calculan en app (`src/lib/equipo/vacaciones.ts`) a partir de `vacaciones_saldo_base` + acreditaciones cada 1/1 − días hábiles de vacaciones posteriores a la fecha base. Los cambios de día **no** descuentan.

**Tareas recurrentes**: lógica de ocurrencias en `src/lib/equipo/tareasRecurrentes.ts` (mensual D21: fin de semana/feriado → día hábil siguiente; **unica**: solo la fecha en `semana_inicio`). No reutilizar `tareas_dashboard` (completar ahí borra la fila).

**Corcho**: lógica de orden/filtro/votos en `src/lib/equipo/corcho.ts`. Separado de Innovación (D22). Ruta `/corcho` + pestaña “Mis ideas” en el perfil.

**Mis números** (Etapa 7): sin tablas nuevas. Lectura filtrada por fecha de `estado_historial` (producción: `campo` + `estado_nuevo` Hecho / VECTORIZADO; D11 atribuye todo Hecho al área producción), `ordenes.envio_datos_cargado_por` / `envio_datos_cargado_at`, `envio_eventos.created_by` (etiquetas: **envíos distintos** por orden y período, POL-062). Lógica de períodos en `src/lib/equipo/misNumeros.ts`; consultas en `equipoNumeros.service.ts`. Galería desde `sellos` (`foto_sello` / `archivo_vector_preview`) + cliente de la orden.

**Servicios (`equipo*.service.ts`)**: DELETE/UPDATE con RLS puede afectar 0 filas sin error de PostgREST; la app debe comprobar filas devueltas (helper `asegurarFilaAfectada`, EQ-R03 / AUD-INC-026).

Ver también [usuarios](usuarios.md) y [tareas](tareas.md) (tablas distintas: pedido / dashboard / innovación).
