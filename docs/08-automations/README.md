# Automatizaciones

| Tipo | Dónde corre | Se ejecuta aunque nadie tenga la app abierta | Doc |
|---|---|---|---|
| Triggers de Postgres | Supabase | Sí (ante cualquier escritura) | [triggers.md](triggers.md) |
| pg_cron | Supabase | Sí | [cron.md](cron.md) |
| Edge Functions | Supabase | Sí (cuando las llaman) | [edge-functions.md](edge-functions.md) |
| Workers externos | VPS | Solo cuando la app (o alguien) los llama; no hay cron de workers en el repo | [07-integrations](../07-integrations/README.md) |
| Automatizaciones en el navegador | Pestaña de un usuario | **No** — dependen de la sesión abierta | [navegador.md](navegador.md) |

## Mapa rápido: evento → efectos automáticos

| Evento | Efectos |
|---|---|
| Se inserta/actualiza un ítem | restante, costo/margen, totales de la orden, historial, cantidad del programa, nombre del programa, dirty del programa |
| Ítem con estado Aspire en Sin Hacer/Rehacer | → `Programado` |
| Ítem → `Rehacer` | prioridad |
| Ítem SELLO entra a `Hecho` | consumo de bronce + `tipo_planchuela` |
| Foto cargada | WhatsApp `pedido_listo` (+ link Andreani vía edge) |
| Orden → `Despachado` con seguimiento | WhatsApp `pedido_enviado` → `Seguimiento Enviado` |
| Orden → `Seguimiento Enviado` | `seguimiento_enviado_at`, descuento de stock |
| Cambia empresa/servicio de envío | restante recalculado |
| Orden nueva / pago web confirmado | Meta Purchase; (web) confirm-web-order |
| Mockup web completado | contacto comercial programado a +10 min |
| Diario 09:00 UTC | Deudores |
| Diario 09:10 UTC | Vencimientos (producción/logística) |
| Cada 2 min | Contactos comerciales; confirmar webhooks |
| Cada 5 min | Reintentar webhooks |
| Lun–vie 15:26 UTC | Seguimientos de recompra |
