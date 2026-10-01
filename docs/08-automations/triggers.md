# Triggers de Postgres (estado en vivo 2026-09-27)

> Para listar el estado actual: `select event_object_table, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema='public';` Para ver el código: `select prosrc from pg_proc where proname='<función>';`

## `sellos`

| Trigger | Momento | Función | Qué hace |
|---|---|---|---|
| `trigger_update_sello_restante` | BEFORE INS/UPD | `update_sello_restante` | `restante = valor − seña` |
| `trigger_calc_sello_fabrication_cost` | BEFORE INS/UPD | `calc_sello_fabrication_cost` | Costo y margen por tipo de ítem con parámetros vigentes a `created_at` |
| `trigger_detect_programado` | BEFORE INS/UPD | `detect_programado_state` | Con `estado_aspire` y fabricación `Sin Hacer`/`Rehacer` (sin cambio explícito) → `Programado` |
| `trigger_sellos_rehacer_auto_prioridad` | BEFORE INS/UPD | `sellos_rehacer_auto_prioridad` | Al entrar a `Rehacer` → `es_prioritario=true` |
| `trigger_sync_programa_nombre` | BEFORE INS/UPD | `sync_programa_nombre` | Copia `programa.nombre` en `programa_nombre` (o NULL) |
| `trigger_clear_maquina_when_sello_leaves_programa` | BEFORE UPD | `clear_maquina_when_sello_leaves_programa` | Sale del programa → `maquina=NULL` |
| `trigger_mark_programa_dirty_on_sello_relevant_update` | BEFORE UPD | `mark_programa_dirty_on_sello_relevant_update` | Cualquier UPDATE de un ítem que sigue en el mismo programa → programa `dirty`, `LISTO→BORRADOR` |
| `trigger_mark_programa_dirty_on_sello_delete` | BEFORE DEL | `mark_programa_dirty_on_sello_delete` | ídem al borrar |
| `trigger_sellos_updated_at` | BEFORE UPD | `update_updated_at_column` | `updated_at` |
| `trigger_update_orden_totals` | AFTER INS/UPD/DEL | `update_orden_totals` | Recalcula cantidad, seña, valor, restante (+ envío) de la orden |
| `trigger_refresh_orden_fabrication_totals` | AFTER INS/UPD/DEL | `trg_refresh_orden_fabrication_totals` | Costo y margen totales de la orden |
| `trigger_update_programa_cantidad` | AFTER INS/UPD/DEL | `update_programa_cantidad` | `programa.cantidad_sellos` (⚠️ solo del programa nuevo al mover) |
| `trigger_estado_historial_sellos` | AFTER INS/UPD OF fabricación, venta, vectorización | `trg_estado_historial_sellos` | Historial de fabricación, venta y vectorización |
| `trigger_foto_sello_subida` | AFTER UPD | `trigger_foto_sello_subida` | Foto nueva/cambiada → WhatsApp `pedido_listo` |
| `trigger_accesorio_listo` | AFTER UPD OF `estado_fabricacion` | `trigger_accesorio_listo` | Accesorio → `Hecho` → WhatsApp `accesorio_listo` (una vez) |
| `trigger_registrar_bronce_consumo` | AFTER INS/UPD | `registrar_bronce_consumo_sello` | Entrada a `Hecho` (SELLO, desde otro estado) → `bronce_consumo` + `tipo_planchuela` |
| `trigger_confirm_web_order_on_sellos_insert` | AFTER INS | `trg_confirm_web_order_on_sellos_insert` | Orden web pagada → edge `confirm-web-order` |

## `ordenes`

| Trigger | Momento | Qué hace |
|---|---|---|
| `trigger_ordenes_updated_at` | BEFORE UPD | `updated_at` |
| `trigger_update_orden_restante_on_shipping_change` | BEFORE UPD | Cambia empresa/servicio → recalcula `restante` con `get_shipping_cost` |
| `trigger_ordenes_stamp_seguimiento_enviado` | BEFORE INS/UPD | → `Seguimiento Enviado` → `seguimiento_enviado_at=now()` |
| `trigger_preserve_web_pago_confirmado` | BEFORE UPD | Web `pagado` no puede volver atrás; no borra `pago_confirmado_at` |
| `trigger_estado_historial_ordenes` | AFTER INS/UPD | Historial de envío y estado de orden |
| `trigger_envio_despachado` | AFTER UPD | → `Despachado` con seguimiento → WhatsApp `pedido_enviado` |
| `trigger_consume_stock_on_envio` | AFTER UPD | → `Seguimiento Enviado` → `consume_stock_for_order` (idempotente) |
| `trigger_confirm_web_order_on_insert` / `_on_pago_confirmado` | AFTER INS / UPD | Web + `pagado` → edge `confirm-web-order` |
| `trigger_meta_conversion_on_orden_insert` / `_on_pago_confirmado` | AFTER INS / UPD | → edge `meta-conversion` |

## `programa`

| Trigger | Qué hace |
|---|---|
| `trigger_programa_updated_at` | `updated_at` |
| `trigger_sync_programa_nombre_on_rename` | Renombrar → actualiza `sellos.programa_nombre` |
| `trigger_clear_sellos_maquina_before_programa_delete` | Borrar programa → `sellos.maquina=NULL` |

## Otros

`mockup_solicitudes`: `trg_mockup_schedule_contacto_comercial` (contacto a +10 min, web), `updated_at`. `innovation_tasks/subtasks`: progreso automático. `clientes`, `direcciones`, `costos_de_envio`, `correo_sucursales`, `economia_*`, `precios_config`, `stock_items`, `vector_jobs`, `vistas_tabla`, `innovation_*`: `updated_at`.

## Funciones RPC llamadas desde la app

`registrar_rehacer`, `emitir_notificacion`, `clear_notificacion_dedup`, `asignar_link_andreani`, `liberar_link_andreani`, `asignar_etiqueta_andreani`, `liberar_etiqueta_andreani`, `eliminar_etiqueta_andreani`, `marcar_etiqueta_andreani_erronea`, `restaurar_etiqueta_andreani_huerfano`, `get_shipping_cost`, `procesar_seguimientos_clientes_pendientes`, `add_es_prioritario_column`/`apply_restante_envio_migration` (legado, pueden no existir).
