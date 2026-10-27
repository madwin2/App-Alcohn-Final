# Andreani (`envios_andreani_links`, `envios_andreani_etiquetas`)

## `envios_andreani_links` — pool de links de envío (205 filas)

| Campo | Notas |
|---|---|
| `url` | Link `pymes.andreani.com/completa-tu-envio/...` (UNIQUE) |
| `estado` | `disponible` → `asignado` → (`descartado`) |
| `orden_id` | Orden que lo recibió (SET NULL al borrar la orden) |
| `creado_en`, `asignado_en`, `nota` | Frescura: 30 h desde `creado_en` |
| `revisado_en`, `usado_en` | Revisión de links (worker `check-links`): última consulta y primera vez que se vio completado (`usado_en` NULL = sin usar) |
| `pedido_andreani_id`, `destinatario`, `tracking` | Del link completado: id del pedido en Andreani, **nombre con el que lo completó** (puede no ser el cliente) y número de seguimiento. `tracking` se usa para emparejar la etiqueta (BR-AND-008) |

Creado por el **andreani-worker**. Asignado por `asignar_link_andreani` (edge `webhook-bot`/`confirm-web-order`). Liberado por `liberar_link_andreani` (si `usado_en` no es NULL, lo descarta en vez de devolverlo al pool). Revisado por el worker (`check-links`); migración [`migration_envios_andreani_links_revision.sql`](../../../migration_envios_andreani_links_revision.sql).

## `envios_andreani_etiquetas` — etiquetas descargadas del portal (133 filas)

| Campo | Notas |
|---|---|
| `tracking`, `nro_operacion` | Del portal |
| `destinatario`, `destino`, `fecha_portal`, `estado_portal` | Del portal (estado actualizado por `sync-tracking`) |
| `orden_id`, `estado` (`asignada`, `huerfano`, `erronea`), `asignado_en`, `nota` | |
| `pdf_path` | Bucket privado `etiquetas-andreani` |

RPCs: `asignar_etiqueta_andreani`, `liberar_etiqueta_andreani`, `eliminar_etiqueta_andreani`, `marcar_etiqueta_andreani_erronea`, `restaurar_etiqueta_andreani_huerfano`. Descargas registradas en `envio_eventos` (`meta.etiqueta_id`).
