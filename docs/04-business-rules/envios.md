# Reglas — Envíos

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-ENV-001 | Una orden entra a Envíos si todos sus ítems están `Hecho`, no es "Retiro en persona", no hay `Deudor` (orden o ítem) y el envío no es `Seguimiento Enviado`. | `isEligibleForShipping` (`app/envios/index.tsx`) | UI |
| BR-ENV-002 | Cola "Pendientes de datos" (Correo): sin dirección y **todos** los ítems en `Foto` o `Transferido`. | `isSaleReadyForShippingData` | UI |
| BR-ENV-003 | Guardar datos de envío crea una **nueva** dirección (no edita la anterior) y registra quién/cuándo la cargó o si fue editada. | `handleSaveShippingData` | UI/Servicio |
| BR-ENV-004 | Provincia, localidad y sucursal deben existir en el padrón `correo_sucursales` (o informarse el código de sucursal MiCorreo a mano); no se acepta texto libre. | `handleSaveShippingData`, `enviosAddressCatalog.ts` | UI |
| BR-ENV-005 | Email de la etiqueta: el del cliente → el del texto pegado → un email genérico de Alcohn (este nunca se guarda en el cliente). | `resolveEnvioEmail`, `emailToPersistOnCliente` | Servicio |
| BR-ENV-006 | Cambiar los datos de envío cuando la etiqueta ya estaba generada o pagada notifica a Logística (l1). | `notifyDireccionPostEtiqueta` | Servicio |
| BR-ENV-007 | "Despachado" (= se envió; diferencia de momento operativa, confirmada) se marca: en **Correo**, al aplicar el PDF de seguimientos en Pedidos; en **Andreani**, cuando el portal deja de mostrar "Pendiente de ingreso" (solo desde `Etiqueta Lista`). | `app/pedidos/index.tsx`; `andreani-worker` `markOrderDespachado` | UI / Worker |
| BR-ENV-008 | `Despachado` con número de seguimiento → WhatsApp `pedido_enviado`; si el bot confirma, la orden pasa a `Seguimiento Enviado` (solo desde `Despachado`). | trigger `trigger_envio_despachado`; edge `webhook-bot`; cron `confirmar_webhooks_pendientes` | DB/Edge |
| BR-ENV-009 | Cada vez que el envío entra a `Seguimiento Enviado` (desde otro estado) se sella `seguimiento_enviado_at = now()`. | trigger `trg_ordenes_stamp_seguimiento_enviado` | DB |
| BR-ENV-010 | Costo de envío vigente por empresa/servicio (tabla `costos_de_envio`, activo más reciente); Retiro o sin empresa = 0. | `get_shipping_cost` | DB |
| BR-COR-001 | La subida a MiCorreo se hace de a una orden, con pausa, y además paga la etiqueta. Resultado: ok → `Etiqueta Lista`; error de datos → `Error de Etiqueta`; error de sistema → `Hacer Etiqueta`. | `micorreoBackgroundUpload.ts`, `micorreoUpload.ts`, `micorreo-worker` | Servicio/Worker |
| BR-COR-002 | Medidas/peso declarados: con soldador 40×15×20 cm 1 kg; con abecedario o base 25×13×13 cm 1 kg; si no 25×8×8 cm 0,5 kg (1 kg con ≥2 sellos). Valor declarado 40.000, producto `CP`. | `correoCsvPackageFromOrder.ts`, `correoArgentinoCsv.ts` | Servicio |
| BR-COR-003 | El CSV manual incluye solo órdenes Correo con dirección en `Hacer Etiqueta`; las que no generan una fila válida pasan a `Error de Etiqueta`. | `handleGenerateCsv` | UI |
| BR-AND-001 | Un link de Andreani sirve 30 h desde su creación; se asigna el disponible más antiguo; los vencidos se purgan/descartan. | `asignar_link_andreani`, `purgar_links_andreani_viejos` | DB |
| BR-AND-002 | El link se asigna al enviar la foto del último ítem (o al confirmar un pedido web), no al crear el pedido. | edge `webhook-bot`, `confirm-web-order` | Edge |
| BR-AND-003 | Dejar de ser Andreani o borrar la orden devuelve el link al pool (o lo elimina si tiene >30 h). | `updateOrder`, `deleteOrder`, `liberar_link_andreani` | Servicio + DB |
| BR-AND-004 | La etiqueta Andreani solo se descarga si la venta de la orden está `Transferido`. | `AndreaniLabelsPanel` (`downloadable`) | UI |
| BR-AND-005 | Asignar una etiqueta exige que la orden tenga link asignado, que no tenga otro seguimiento y que el tracking no esté en otra orden; deja la orden en `Etiqueta Lista`. | `asignar_etiqueta_andreani` | DB |
| BR-AND-006 | Una etiqueta asignada no puede marcarse errónea sin liberarla antes; solo las erróneas se restauran a huérfano. | `marcar_etiqueta_andreani_erronea`, `restaurar_etiqueta_andreani_huerfano` | DB |
| BR-AND-007 | Al liberar/eliminar una etiqueta asignada se elige qué pasa con la orden: `Sin envio` o `Seguimiento Enviado` (con seguimiento manual). | `liberar_etiqueta_andreani`, `eliminar_etiqueta_andreani` | DB |
