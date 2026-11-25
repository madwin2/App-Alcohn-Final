# Reglas — Mensajes de WhatsApp al cliente

Todos pasan por la edge `webhook-bot` hacia el **bot externo** (ver [07-integrations/whatsapp-bot.md](../07-integrations/whatsapp-bot.md)). El texto final lo arma el bot (no está en este repo).

| ID | `tipo_actualizacion` | Cuándo se envía | Disparador | Hace cumplir |
|---|---|---|---|---|
| BR-WA-001 | `pedido_registrado` | Alta manual (salvo "no enviar"); confirmación de pedido web | `NewOrderDialog` → `notifyOrderRegistered`; edge `confirm-web-order` | UI / Edge |
| BR-WA-002 | `pedido_actualizado` | Se agrega o borra un ítem de una orden (no en el alta), o al editar cambia de verdad el diseño, el valor o la seña de un ítem. Cambiar el archivo base o el vector **no** manda mensaje (2026-11-13): valor/seña vacíos en BD cuentan como 0 y diseño vacío como «Sin diseño», que es como los muestra la app. **Desde 2026-11-25 no sale solo**: aparece el cartel «¿Enviar WhatsApp al cliente?» y se manda únicamente con «Sí, enviar» (`requestNotifyOrderUpdated` → `ConfirmarWhatsappActualizadoHost`). Varias ediciones seguidas del mismo pedido dan un solo cartel | `OrdersProvider.addStampToOrder/deleteStamp`; `updateOrder` (`montoIgual`/`disenoIgual`) | Servicio |
| BR-WA-003 | `pedido_listo` | Se carga/cambia la foto de un ítem | trigger `trigger_foto_sello_subida` | DB |
| BR-WA-004 | `pedido_enviado` | La orden pasa a `Despachado` con seguimiento | trigger `trigger_envio_despachado` | DB |
| BR-WA-005 | `sello_rehacer` | Se registra un Rehacer (cualquier motivo) | `registrarRehacer` | Servicio |
| BR-WA-006 | `mockups_listos` | Mockup completado en la app | `MockupSlotCard` → `notifyMockupsReadyWhatsApp` | UI/Servicio |
| BR-WA-007 | `generador_muestras_contacto` | 10 min después de un mockup web sin compra (cooldown 7 días por teléfono, no excluido); o manual desde Comercial | trigger + cron `procesar_contactos_comerciales_pendientes` | DB |
| BR-WA-008 | `seguimiento_cliente_recompra` | Cliente con 1 orden cerrada hace ≥2 meses, una vez | cron `procesar_seguimientos_clientes_pendientes` | DB |
| BR-WA-009 | `accesorio_listo` | Accesorio (soldador/mango/base) pasa a `Hecho` y **todavía falta** otro ítem | trigger `trigger_accesorio_listo` → edge deja el tipo | DB / Edge |
| BR-WA-010 | `accesorio_pedido_completo` | Accesorio pasa a `Hecho` y **cierra** el pedido (todos Hecho): cobro del restante (mismas reglas que último `pedido_listo`) | edge `webhook-bot` reescribe el tipo | Edge |
| BR-WA-011 | `link_andreani` | Tras `accesorio_pedido_completo` si la empresa es Andreani (plantilla Meta aparte) | edge `webhook-bot` pone el link en el payload; el bot manda la plantilla | Edge / bot |


<a id="reglas-monto-pedido-listo"></a>

## Reglas de monto en `pedido_listo` (✅ edge `webhook-bot`)

**Nunca se cobra si falta algo del pedido** (✅ decisión del dueño, 2026-11-16). Solo hay cobro cuando el pedido está **terminado**: todos los sellos/abecedarios con foto **y** todos los accesorios (soldador, mango de golpe, base) en `Hecho`. Lo calculan igual el trigger `trigger_foto_sello_subida` (`es_ultimo_sello`) y la edge (`pedido_terminado`, que pisa lo que venga en el payload). Si falta un sello o un accesorio, el bot manda la plantilla **`pedido_listo_en_proceso`** (foto + "el resto del pedido se está terminando", sin monto). Cuando el que termina el pedido es un accesorio, el cobro sale por `accesorio_pedido_completo`.

Con el pedido terminado (o tipo "completado/finalizado"):

| Empresa de la orden | Mensaje | Monto |
|---|---|---|
| Andreani | `restante_producto` + **link de envío** (si el que cierra es un accesorio, el bot lo manda aparte con la plantilla `link_andreani`) | saldo de productos (el envío lo paga en Andreani) |
| Sin empresa | `restante_sin_empresa`, `pedir_empresa_envio=true` | saldo de productos; se le pregunta Andreani o Correo |
| Retiro | `restante_producto` | saldo de productos |
| Correo / otra | `total_orden` + opciones | `ordenes.restante` y alternativas sucursal/domicilio (costos por variable de entorno, por defecto 6.000/9.000; **0 si ≥3 sellos**) |

Si falta cualquier ítem: `pedido_listo_en_proceso`, sin monto, con texto "Estamos terminando el resto del pedido…".

## Reintentos y confirmación (✅)

- Cada envío se registra en `webhook_logs` (`success` nulo hasta confirmar).
- `confirmar_webhooks_pendientes` (cada 2 min): lee la respuesta de `pg_net`; sin respuesta a los 15 min → fallido; éxito de `pedido_enviado` → `Seguimiento Enviado`; éxito de contacto comercial → marca el mockup.
- `reintentar_webhooks_fallidos` (cada 5 min): hasta 3 reintentos, solo para logs de la última hora, enviando **directo** al bot (sin pasar por la edge, o sea sin enriquecer el payload).
