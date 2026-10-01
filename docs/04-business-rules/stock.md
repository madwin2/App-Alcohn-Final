# Reglas — Stock

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-STK-001 | Lista de materiales por ítem: SELLO → tubo 80, prisionero, varilla, mango, tuerca; ABECEDARIO/ABC → tubo 125, mango, varilla, prisionero, tuerca, soporte, caja; SOLDADOR → soldador adaptado de su potencia (si no hay, uno sin adaptar); MANGO_GOLPE → mango de golpe; BASE_REMACHADORA → base + aluminio. La BOM vive **solo en SQL** (`stock_bom_for_item`). | `stock_bom_for_item` | DB |
| BR-STK-002 | El stock se descuenta una sola vez por orden al pasar a `Seguimiento Enviado`, **siempre completo; el stock puede quedar negativo** (decisión 2026-10-01). Solo lo hace el trigger. | trigger `trg_consume_stock_on_envio` → `consume_stock_for_order` | DB |
| BR-STK-003 | Demanda pendiente = ítems de órdenes no enviadas, creadas hace ≤60 días o con ítems `Deudor`, sin descuento previo (`get_pending_stock_demand`). Excluye pruebas ya cerradas (todos Hecho). | RPC `get_pending_stock_demand` / `getPendingShipmentStockDemand` | DB + Servicio |
| BR-STK-004 | Si faltante = demanda − stock > 0 (stock negativo suma al faltante), cada responsable asignado ve una única tarea de reposición y recibe notificación p6; se borra al resolverse. | `syncStockReplenishTasksForCurrentUser` | Servicio (al abrir el Inicio) |
| BR-STK-005 | Movimientos: cantidad > 0; tipo `IN`/`OUT`/`ADJUSTMENT`; `created_by` = usuario actual. | CHECKs y RLS de `stock_movements` | DB |
| BR-STK-006 | Ajustes manuales = conteo físico vía `adjust_stock_count` (movimiento `ADJUSTMENT`); ingresos vía `add_stock_inbound` (movimiento `IN`). Ambos atómicos. | RPCs `adjust_stock_count`, `add_stock_inbound` | DB |
| BR-STK-007 | Orden `Prueba`: al quedar **todos** sus ítems en `Hecho`, se llama `consume_stock_for_order` una vez (misma idempotencia que el envío). | trigger `trg_consume_stock_on_prueba_cerrada` | DB |
