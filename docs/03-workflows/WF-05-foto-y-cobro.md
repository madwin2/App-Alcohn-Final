# WF-05 · Foto del sello y cobro del restante

| | |
|---|---|
| **Inicio** | Ítem en `Hecho` con venta `Señado` (cola "Enviar foto" del Inicio). |
| **Actores** | Juli B (fotos), Juli B y Cachi (cobros); cliente; bot de WhatsApp. |
| **Módulos** | Pedidos (foto, venta), Inicio (colas), WhatsApp, Envíos, cron de deudores |
| **Resultado** | Venta `Transferido` (o `Deudor` si no paga en 10 días). |

## Pasos

1. ❓ Sacar la foto del sello terminado → [FR-05](../10-operational-boundaries/README.md#fr-05).
2. Subirla: celda **Foto** o **Subir fotos** (masivo, asigna a ítems Hecho+Señado sin foto). Con Andreani, verifica que haya links en el pool.
3. ✅ Venta → `'Foto'`. Trigger → WhatsApp **`pedido_listo`** con foto y monto:
   - Último ítem con foto de la orden → **total restante de la orden** (incluye costo de envío si hay empresa). Andreani: solo producto + **link de envío** asignado del pool. Sin empresa: solo producto y se le pregunta Andreani o Correo. Correo: total con opciones sucursal/domicilio; **envío gratis con ≥3 sellos**.
   - No es el último → restante de ese ítem y aviso "estamos terminando el resto del pedido".
4. ❓ El cliente transfiere; alguien verifica el ingreso → [FR-06](../10-operational-boundaries/README.md#fr-06).
5. ✅ Pasa a `Transferido` por alguno de estos caminos:
   - a mano en la celda **Venta** (habilitada solo si el ítem está Hecho);
   - al **guardar datos de envío** en Envíos (automático, toda la orden);
   - al **cargar seguimientos de Correo** (automático, toda la orden);
   - panel Andreani: selector Venta pendiente/transferido.
6. ✅ Si en 10 días no pasó a Transferido (todos los ítems en `Foto`), el cron lo marca **Deudor** (WF-12).

## Estados

Venta: `Señado` → `Foto` → `Transferido` (o → `Deudor`). Ver [06-state-machines/venta.md](../06-state-machines/venta.md).

## Decisiones humanas

Cuándo dar por pagado; si mandar la foto antes de terminar todos los ítems; cómo se cobra el envío.

## Excepciones

- Reemplazar la foto reenvía el WhatsApp.
- Un pedido "Retiro en persona" recibe mensaje con restante del producto.
- Si faltan links de Andreani, se puede asignar igual: el WhatsApp sale **sin link** (log "pool vacío").

## Preguntas

[Q-VEN-002…Q-VEN-005](../14-open-questions/ventas-cobros.md).
