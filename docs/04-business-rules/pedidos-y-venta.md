# Reglas — Pedidos y venta

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-PED-001 | Toda orden creada manualmente nace con `estado_orden='Señado'` y `fecha` = hoy en hora Argentina. | `createOrder` (`orders.service.ts`), `todayArgentinaDateKey` | Servicio |
| BR-PED-002 | El cliente se identifica por teléfono (tolerando variantes `+54`/`549`/`9`) y, si no hay match, por email; si existe se reutiliza y se actualizan sus datos. | `findCustomer`, `phoneSearchVariants` | Servicio |
| BR-PED-003 | Si todos los ítems de una orden quedan con el mismo estado de venta, ese valor se copia a `ordenes.estado_orden`. | `updateOrder`, `registrar_rehacer` | Servicio / DB (RPC) |
| BR-PED-004 | `ordenes.cantidad_sellos`, `senia_total`, `valor_total`, `restante` se recalculan desde los ítems en cada cambio. | trigger `update_orden_totals` | DB |
| BR-PED-005 | La fecha límite se edita a nivel orden y se copia a **todos** sus ítems (Pedidos); en Producción se edita por ítem. | `updateOrder` (`deadlineAt`), `updateProductionItem` | Servicio |
| BR-PED-006 | Las medidas se guardan y muestran siempre como lado largo × lado corto; `ancho_*` = mayor, `largo_*` = menor. | `ordenMedidaLargoCortoMm`, mappers | Servicio |
| BR-PED-007 | Una orden está "cerrada" cuando todos sus ítems están `Hecho` y el envío está `Despachado` o `Seguimiento Enviado`. | `orderLifecycle.ts` | Servicio (solo lectura) |
| BR-PED-008 | La vista operativa muestra órdenes de los últimos 6 meses más las viejas con envío abierto. | `getOrders` | Servicio |
| BR-PED-009 | Agregar un ítem a una orden ya pagada o con foto enviada notifica a Ventas (v1). | `addStampToOrder` | Servicio |
| BR-PED-010 | Crear un pedido avisa al cliente por WhatsApp salvo que se marque lo contrario; agregar/borrar ítems avisa "pedido actualizado". | `NewOrderDialog`, `OrdersProvider` | UI/Servicio |
| BR-PED-011 | `ordenes.tipo_pedido` ∈ {Venta, Prueba, Regalo}. Default `Venta`. No se puede cambiar después del INSERT (D8). | columna + trigger `trg_ordenes_tipo_pedido_immutable` | DB |
| BR-PED-012 | `sellos.es_regalo`: ítem sin cargo. En órdenes Regalo todos van true; en Venta puede haber mezcla. No se puede cambiar después del INSERT. | constraint + trigger `trg_sellos_es_regalo_immutable` | DB |
| BR-PED-013 | Prueba y Regalo (y ítems `es_regalo`) nacen con valor/seña = 0. Regalo aparte nace `Transferido`. Prueba usa el cliente interno `es_interno` y no genera WhatsApp/Meta. | `createOrder`, triggers de integridad | Servicio / DB |
| BR-PED-014 | Un ítem cuenta como venta solo si la orden es `Venta` y `NOT es_regalo`. Toda métrica (Inicio, Economía, CSV, Meta) usa esta regla. | `itemCuentaComoVenta` / `ordenCuentaComoVenta` | Servicio |
| BR-PED-015 | La sincronización `estado_orden` (BR-PED-003) se calcula solo sobre ítems no regalo; los regalos de una venta acompañan ese estado. | `updateOrder` | Servicio |
| BR-VEN-001 | Subir la foto de un ítem con venta `Señado` (o nula) la pasa a `'Foto'`. | `updateOrder`, `assignPhotoToStamp`, `assignPendingPhotoToStamp` | Servicio |
| BR-VEN-002 | La venta de un ítem solo se puede cambiar a mano si está `Hecho`. | `CellVenta` (`isEnabled`) | **UI** |
| BR-VEN-003 | El estado de envío solo se puede cambiar a mano si la venta está `Transferido`. | `CellEnvioEstado` | **UI** |
| BR-VEN-004 | `sellos.restante = valor − seña`; `ordenes.restante = Σ(valor − seña) + costo de envío vigente` (0 si Retiro, sin empresa, **o tipo_pedido = Regalo**). | triggers `update_sello_restante`, `update_orden_totals`, `update_orden_restante_on_shipping_change`, `get_shipping_cost` | DB |
| BR-VEN-005 | Guardar datos de envío en Envíos marca la orden y todos sus ítems como `Transferido`. | `handleSaveShippingData` (`app/envios/index.tsx`) | UI/Servicio |
| BR-VEN-006 | Cargar el seguimiento de **Correo** desde el PDF marca todos los ítems `Transferido`; con **Andreani** no se toca la venta. | `app/pedidos/index.tsx` (`onApply`) | UI/Servicio |
| BR-VEN-007 | Si todos los ítems **no regalo** de una orden **Venta** llevan ≥10 días en `'Foto'`, la orden y sus ítems pasan a `'Deudor'`. Órdenes Prueba/Regalo excluidas. | `marcar_ordenes_deudores_por_foto` (cron 09:00 UTC) | DB |
| BR-VEN-008 | Los cargos de rehacer son informativos: no se suman al restante. | tipo `ReworkCharge`, `CellRehacerCargo` | Servicio |
| BR-WEB-001 | Una orden web (`origen='Web'`) no aparece en Pedidos, Producción ni Envíos hasta `estado_pago_web='pagado'`. | `INTERNAL_ORDERS_VISIBILITY_OR`, `isWebOrderHiddenFromInternalApp`, filtro en `getProductionItems` | Servicio |
| BR-WEB-002 | Un pago web confirmado no puede volver a estados pendientes; `pago_confirmado_at` no se borra. | trigger `trg_preserve_web_pago_confirmado` | DB |
| BR-WEB-003 | Al confirmarse el pago web se crean/normalizan los sellos desde el carrito y se avisa al cliente, una sola vez por orden. | edge `confirm-web-order`, `web_pedido_confirm_log` | Edge |
| BR-WEB-004 | Seña web por defecto: $20.000 si no viene informada (y no es pago total por link). | `confirm-web-order`, `webOrderPayment.service.ts` | Edge/Servicio |
| BR-WEB-005 | Solo se pueden confirmar manualmente pagos de órdenes web en `pendiente`, `pago_fallido`, `esperando_comprobante` o `abandonado`. | `confirmWebOrderPayment` | Servicio |
