# Reglas — Stock

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-STK-001 | Lista de materiales por ítem: SELLO → tubo 80, prisionero, varilla, mango, tuerca; ABECEDARIO/ABC → tubo 125, mango, varilla, prisionero, tuerca, soporte, caja; SOLDADOR → soldador adaptado de su potencia (si no hay, uno sin adaptar); MANGO_GOLPE → mango de golpe; BASE_REMACHADORA → base + aluminio. | `requirementsForOrderItem` (TS) y `consume_stock_for_order` (SQL) | Servicio + DB (duplicado) |
| BR-STK-002 | El stock se descuenta una sola vez por orden, cuando el envío pasa a `Seguimiento Enviado`; nunca queda negativo. | trigger `trg_consume_stock_on_envio`; `consumeStockForOrderWhenTrackingSent` | DB + Servicio |
| BR-STK-003 | Demanda pendiente = BOM de todos los ítems de órdenes cuyo envío no es `Seguimiento Enviado` (incluye nulo). | `getPendingShipmentStockDemand` | Servicio |
| BR-STK-004 | Si demanda > stock para un ítem, cada responsable asignado ve una única tarea de reposición y recibe notificación p6; se borra al resolverse. | `syncStockReplenishTasksForCurrentUser` | Servicio (al abrir el Inicio) |
| BR-STK-005 | Movimientos: cantidad > 0; tipo `IN`/`OUT`/`ADJUSTMENT`; `created_by` = usuario actual. | CHECKs y RLS de `stock_movements` | DB |
