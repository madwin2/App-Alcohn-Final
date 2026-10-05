# Tareas programadas (pg_cron)

> Horarios en **UTC** (🔶 Argentina = UTC−3). Consultar: `select jobname, schedule, command, active from cron.job;`

| Job | Horario | Función | Qué hace |
|---|---|---|---|
| `auto-deudor-foto-enviada` | `0 9 * * *` (06:00 AR) | `marcar_ordenes_deudores_por_foto()` | Órdenes con todos los ítems en `Foto` hace ≥10 días → `Deudor` + notificación v4 ([WF-12](../03-workflows/WF-12-deudores.md)) |
| `notificaciones-vencimientos` | `10 9 * * *` (06:10 AR) | `emitir_notificaciones_vencimientos()` | p4 (ítems no Hecho con fecha límite ≤3 días o vencida) y l2 (órdenes no despachadas) |
| `comercial-contacto-pendientes` | `*/2 * * * *` | `procesar_contactos_comerciales_pendientes()` | Hasta 15 mockups web elegibles → WhatsApp de contacto (cooldown 7 días por teléfono) |
| `comercial-seguimientos-clientes` | `26 15 * * 1-5` (12:26 AR) | `procesar_seguimientos_clientes_pendientes(10,'cron')` | Hasta 10 clientes para recompra ([WF-10](../03-workflows/WF-10-recompra.md)) |
| `confirmar-webhooks-pendientes` | `*/2 * * * *` | `confirmar_webhooks_pendientes()` | Lee respuestas de `pg_net` de los últimos 48 h (50 por corrida): marca éxito/fallo; `pedido_enviado` OK → `Seguimiento Enviado`; contacto comercial OK → marca mockup |
| `reintentar-webhooks-fallidos` | `*/5 * * * *` | `reintentar_webhooks_fallidos()` | Reenvía (máx. 3, solo < 1 h, 10 por corrida) **directo** al bot |
| `gastos-sync-diario` | `0 10 * * *` (07:00 AR) | edge `gastos-sync` vía `pg_net` | Cotización blue → recurrentes del mes → Meta Ads → OpenAI ([gastos-automaticos](../07-integrations/gastos-automaticos.md)) |

## No existe (pero se sugiere en documentación)

- Refill automático del pool de Andreani (`POST /refill`, "cron sugerido cada 6–12 h" en el README del worker). ❓ [Q-AND-002](../14-open-questions/envios.md#q-and-002)
- Actualización automática de tracking de Andreani (hoy es un botón).
