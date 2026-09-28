# Fotos del sello y carga de seguimientos

Dos acciones de Pedidos que conectan la producción con el cobro y el envío.

## 1. Foto del sello terminado

### Qué es
🔶 Una foto del sello ya fabricado que se le envía al cliente como prueba de que está listo y para pedirle el pago del restante. ✅ Se guarda en `sellos.foto_sello` (bucket público `foto`).

### Formas de subirla
1. **Celda Foto** de un ítem (`CellFoto`) → `updateOrder` con `files.photoUrl`.
2. **Subir fotos** (`UploadPhotosDialog`), carga masiva:
   - Se suben varias imágenes; cada una se guarda primero como **foto pendiente** (`fotos_pendientes`, carpeta `pendientes/` del bucket `foto`).
   - Para cada foto se elige el ítem destino entre los **disponibles**: `estado_fabricacion='Hecho'`, venta `Señado` o nula, sin foto (`getAvailableStampsForPhoto`).
   - Antes de asignar, si alguna orden es **Andreani**, se verifica que haya **links frescos** en el pool para todas las órdenes que van a recibir su última foto (`checkAndreaniLinksForPhotoAssignment`). Si faltan, se ofrece esperar (las fotos quedan en el modal) o asignar igual.
   - Asignar copia la foto al path final del ítem y marca la pendiente como asignada.

### Efectos (✅)
- Venta `Señado`/nula → `'Foto'` ("Foto enviada").
- **Trigger** `trigger_foto_sello_subida` (AFTER UPDATE en `sellos`, cuando cambia `foto_sello` a un valor no vacío) → `enviar_webhook_pedido('pedido_listo', …)` con: número de pedido, URL de la foto, diseño, restante calculado, costo de envío, si es el último ítem con foto, cantidad de ítems con foto.
  - Último ítem con foto de la orden → `tipo_mensaje_restante='total_orden'` y monto = `ordenes.restante`.
  - Si no es el último y hay empresa de envío → restante del ítem + costo de envío.
  - Si no → restante del ítem.
- La edge function `webhook-bot` **recalcula** las reglas de cobro antes de mandarlo al bot (ver [07-integrations/whatsapp-bot.md](../../07-integrations/whatsapp-bot.md#reglas-de-cobro-pedido_listo)): Andreani → cobra solo producto y **asigna un link de Andreani** del pool; sin empresa → pide elegir Andreani o Correo; Correo → total con opciones sucursal/domicilio; **envío gratis si hay ≥3 ítems tipo SELLO**.
- ⚠️ Reemplazar la foto por otra URL **vuelve a disparar** el mensaje.

## 2. Cargar seguimientos (`UploadTrackingDialog`)

### Qué es
✅ Se sube el **PDF de etiquetas** generado por el transportista; Alcohn AI extrae número de seguimiento y destinatario de cada etiqueta, los empareja con órdenes y aplica el seguimiento en bloque. Además genera un **PDF de etiquetas enriquecido** para imprimir.

### Pasos
1. Elegir origen: **Correo Argentino** o **Andreani**.
2. Subir el PDF → `parseTrackingPdf` / `parseAndreaniTrackingPdf` (pdf.js).
3. Emparejado automático por **nombre normalizado** del destinatario contra el nombre de la dirección de envío de la orden (o el del cliente). Resultados: coincidencias exactas, ambiguas, sin coincidencia, y órdenes que ya tenían otro seguimiento.
4. Asignación manual de las que no coincidieron.
5. **Aplicar**: por cada coincidencia:
   - **Correo**: `seguimiento`=TN, `estado_envio='Despachado'` y, si algún ítem no estaba `Transferido`, **todos pasan a `Transferido`**.
   - **Andreani**: `seguimiento`, empresa Andreani, `estado_envio='Etiqueta Lista'`; **no** cambia la venta ("el sello puede seguir sin pagar").
6. Descarga el PDF enriquecido: etiquetas recortadas a **100 × 152 mm**, sin el encabezado del correo, con logos de Alcohn/cliente y datos del pedido en el pie (`enrichShippingLabelsPdf`, `enrichAndreaniLabelsPdf`).

### Efectos en cadena (Correo)
`Despachado` con seguimiento → trigger `trigger_envio_despachado` → WhatsApp `pedido_enviado` con link de seguimiento → al confirmar el bot → `Seguimiento Enviado` → descuento de stock.

### Fronteras
- ✅ Cachi descarga el PDF del portal MiCorreo (chequeo manual) y lo sube **justo antes de ir al correo** (Q-COR-003, Q-ENV-001).
- ✅ Impresora Zebra ZD220, papel 100×152 (Q-ENV-006).
