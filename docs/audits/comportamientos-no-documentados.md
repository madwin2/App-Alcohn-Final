# Auditoría — Comportamientos no documentados / sorprendentes

Comportamientos reales que un usuario o un agente probablemente no espera.

<a id="aud-und-001"></a>

### AUD-UND-001 · Guardar datos de envío marca el pedido como pagado
`handleSaveShippingData` pasa la orden y todos los ítems a `Transferido` y dispara la etiqueta **paga** en MiCorreo. ✅ Es intencional: los datos se cargan solo cuando el cliente ya pagó (Q-VEN-002, POL-007).

<a id="aud-und-002"></a>

### AUD-UND-002 · Cargar el PDF de Correo marca Despachado y Transferido
"Cargar seguimientos" (Correo) pone `Despachado` y `Transferido` en bloque, lo que dispara WhatsApp y descuento de stock.

<a id="aud-und-003"></a>

### AUD-UND-003 · Volumen de WhatsApp de contacto comercial
`webhook_logs`: 92.179 `generador_muestras_contacto` vs ~2.400 mockups web completados. Datos agregados (2026-09-27):

| Mes | Registros | Teléfonos distintos | Mockups distintos | Marcados fallidos |
|---|---|---|---|---|
| 2026-06 | 7.823 | 199 | 214 | 7.633 |
| 2026-07 | **83.199** | 567 | 604 | 82.703 |
| 2026-08 | 636 | 627 | 636 | 343 |
| 2026-09 | 523 | 516 | 523 | 271 |

- ✅ El pico fue un **incidente de junio–julio 2026** (≈140 registros por mockup); desde agosto hay ~1 registro por mockup (coincide con `migration_comercial_contacto_cooldown.sql`). ❓ Si los clientes recibieron mensajes repetidos en ese período → [Q-WA-003](../14-open-questions/whatsapp-bot.md#q-wa-003).
- ✅ **Hoy**, en los últimos 30 días, entre 30 % y 50 % de los webhooks de todos los tipos quedan marcados como **fallidos**, la mayoría por "Timeout of 10000 ms" (el timeout de los reintentos directos al bot) y algunos "HTTP 500". 🔶 Un timeout no implica que el mensaje no se haya enviado (el bot puede tardar más de 10–15 s, p. ej. al subir la foto), por lo que el registro de éxito no es confiable y los reintentos pueden **duplicar** mensajes. Ver [whatsapp-bot.md](../07-integrations/whatsapp-bot.md#riesgos-observados).

<a id="aud-und-004"></a>

### AUD-UND-004 · Cambiar la foto reenvía el WhatsApp
El trigger dispara cuando `foto_sello` cambia a otro valor, no solo la primera vez.

<a id="aud-und-005"></a>

### AUD-UND-005 · Rehacer siempre avisa al cliente
Incluso con motivo "error detectado en máquina". ✅ Intencional (transparencia, Q-VEN-006).

<a id="aud-und-006"></a>

### AUD-UND-006 · Leer Programas escribe en la base
`getPrograms()` persiste `EN_FABRICACION`/`FINALIZADO` derivados cada vez que alguien carga la página.

<a id="aud-und-007"></a>

### AUD-UND-007 · Colas que dependen de la pestaña abierta
Subida a MiCorreo y revisión de vectores viven en memoria del navegador. 10 órdenes quedaron con `etiqueta_estado='generando'`.

<a id="aud-und-008"></a>

### AUD-UND-008 · Reintentos de WhatsApp sin enriquecer
`reintentar_webhooks_fallidos` postea directo al bot con el payload original (sin ítems, montos recalculados ni link Andreani).

<a id="aud-und-009"></a>

### AUD-UND-009 · Evento a Meta de pedidos de la app al insertar la orden
El trigger corre al insertar `ordenes`, antes de que existan los ítems; `value` puede ir en 0. [Q-WEB-004](../14-open-questions/comercial-web.md#q-web-004).

<a id="aud-und-010"></a>

### AUD-UND-010 · `confirm-web-order` borra y recrea ítems
Si los ítems existentes no coinciden con el carrito (cantidad o totales), se **borran** y se recrean (se pierden archivos o cambios hechos a esos ítems).

<a id="aud-und-011"></a>

### AUD-UND-011 · Stock: demanda inflada por históricos
La demanda pendiente cuenta órdenes con envío nulo (108 históricas). [Q-STK-003](../14-open-questions/stock.md#q-stk-003).

<a id="aud-und-012"></a>

### AUD-UND-012 · El alta actualiza datos de un cliente existente
Si el teléfono coincide, el nombre/apellido/email del cliente se reemplazan por los del formulario (aunque sea otra persona con el mismo teléfono).
