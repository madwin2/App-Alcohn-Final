# Registros, colas y auditoría

| Tabla | Qué registra | Escribe | Filas |
|---|---|---|---|
| `estado_historial` | Cada cambio de `estado_fabricacion`/`estado_venta`/`estado_vectorizacion` (ítem) y `estado_envio`/`estado_orden` (orden), con fecha. **No** guarda quién. Sirve para medir ciclos BASE→VECTORIZADO. | Triggers | 7.956 |
| `envio_eventos` | `csv_generado`, `etiqueta_descargada`, `etiqueta_reimpresa` con usuario y `meta` | Envíos | 107 |
| `sello_rehacer_eventos` | Cada Rehacer: motivo, descripción, snapshot de estados previos, medidas, `programa_id`, cobro adicional, y URLs de **base/vector/base mejorada** congeladas (`archivo_*_snapshot`) | RPC `registrar_rehacer` + cliente (copia Storage) | — |
| `webhook_logs` | Cada WhatsApp disparado desde la base (tipo, teléfono, datos, request `pg_net`, éxito, reintentos, respuesta) | `enviar_webhook_pedido`, cron | 94.943 |
| `meta_conversion_log` | Evento Purchase enviado a Meta por orden (idempotencia) | edge `meta-conversion` | 636 |
| `web_pedido_confirm_log` | Confirmación de pedido web procesada (sellos normalizados, WhatsApp enviado, error) | edge `confirm-web-order` | 64 |
| `web_analytics_events` | Eventos de navegación de la tienda web (UTM, visitante, sesión, IP, user agent) | Tienda web | 44.885 |
| `vector_jobs` | Cola del vector-worker (`PENDING`,`PROCESSING`,`DONE`,`ERROR`, intentos, lock) | App (encolar) + worker | 70 |
| `fotos_pendientes` | Fotos subidas en "Subir fotos" aún no asignadas | Pedidos | 47 |
| `programa_eventos` | Historial de programas | App, edge | 47 |
| `innovation_activity_log` | Historial de innovación | App/triggers | 1.245 |

⚠️ `webhook_logs` y `web_analytics_events` guardan datos personales (teléfonos, IP) con RLS **desactivado** en `webhook_logs` y `web_analytics_events`. Ver [audits/seguridad.md](../../audits/seguridad.md).
