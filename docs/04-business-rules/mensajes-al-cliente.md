# Reglas — Mensajes de WhatsApp al cliente

Todos pasan por la edge `webhook-bot` hacia el **bot externo** (ver [07-integrations/whatsapp-bot.md](../07-integrations/whatsapp-bot.md)). El texto final lo arma el bot (no está en este repo).

| ID | `tipo_actualizacion` | Cuándo se envía | Disparador | Hace cumplir |
|---|---|---|---|---|
| BR-WA-001 | `pedido_registrado` | Alta manual (salvo "no enviar"); confirmación de pedido web | `NewOrderDialog` → `notifyOrderRegistered`; edge `confirm-web-order` | UI / Edge |
| BR-WA-002 | `pedido_actualizado` | Se agrega o borra un ítem de una orden (no en el alta) | `OrdersProvider.addStampToOrder/deleteStamp` | Servicio |
| BR-WA-003 | `pedido_listo` | Se carga/cambia la foto de un ítem | trigger `trigger_foto_sello_subida` | DB |
| BR-WA-004 | `pedido_enviado` | La orden pasa a `Despachado` con seguimiento | trigger `trigger_envio_despachado` | DB |
| BR-WA-005 | `sello_rehacer` | Se registra un Rehacer (cualquier motivo) | `registrarRehacer` | Servicio |
| BR-WA-006 | `mockups_listos` | Mockup completado en la app | `MockupSlotCard` → `notifyMockupsReadyWhatsApp` | UI/Servicio |
| BR-WA-007 | `generador_muestras_contacto` | 10 min después de un mockup web sin compra (cooldown 7 días por teléfono, no excluido); o manual desde Comercial | trigger + cron `procesar_contactos_comerciales_pendientes` | DB |
| BR-WA-008 | `seguimiento_cliente_recompra` | Cliente con 1 orden cerrada hace ≥2 meses, una vez | cron `procesar_seguimientos_clientes_pendientes` | DB |

<a id="reglas-monto-pedido-listo"></a>

## Reglas de monto en `pedido_listo` (✅ edge `webhook-bot`)

Solo cuando es el **último ítem** con foto (o tipo "completado/finalizado"):

| Empresa de la orden | Mensaje | Monto |
|---|---|---|
| Andreani | `restante_producto` + **link de envío** (asignado del pool) | saldo de productos (el envío lo paga en Andreani) |
| Sin empresa | `restante_sin_empresa`, `pedir_empresa_envio=true` | saldo de productos; se le pregunta Andreani o Correo |
| Retiro | `restante_producto` | saldo de productos |
| Correo / otra | `total_orden` + opciones | `ordenes.restante` y alternativas sucursal/domicilio (costos por variable de entorno, por defecto 6.000/9.000; **0 si ≥3 sellos**) |

Si no es el último ítem: sin monto global, con texto "Estamos terminando el resto del pedido…".

## Reintentos y confirmación (✅)

- Cada envío se registra en `webhook_logs` (`success` nulo hasta confirmar).
- `confirmar_webhooks_pendientes` (cada 2 min): lee la respuesta de `pg_net`; sin respuesta a los 15 min → fallido; éxito de `pedido_enviado` → `Seguimiento Enviado`; éxito de contacto comercial → marca el mockup.
- `reintentar_webhooks_fallidos` (cada 5 min): hasta 3 reintentos, solo para logs de la última hora, enviando **directo** al bot (sin pasar por la edge, o sea sin enriquecer el payload).
