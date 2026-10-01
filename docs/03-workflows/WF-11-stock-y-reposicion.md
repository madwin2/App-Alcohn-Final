# WF-11 · Stock y reposición

| | |
|---|---|
| **Inicio** | Una orden pasa a `Seguimiento Enviado` / un usuario responsable abre el Inicio. |
| **Actores** | Sistema; responsables de ítems de stock. |
| **Módulos** | Stock, Inicio, Notificaciones, Envíos |

## Pasos

1. ✅ **Descuento**: `Seguimiento Enviado` → `consume_stock_for_order` descuenta la BOM completa de cada ítem (una sola vez por orden; **puede dejar negativo**). Soldadores: primero el adaptado, después el crudo; lo que no alcanza queda negativo en el adaptado.
2. ✅ **Demanda**: al abrir el Inicio, para cada ítem del que el usuario es responsable se calcula faltante = (BOM de órdenes no enviadas ≤60 días o deudores, sin `OUT` previo) − stock.
3. ✅ Si falta → tarea `[STOCK_REPLENISH]` en el Inicio + notificación p6. Si ya no falta → se borra la tarea.
4. ❓ Comprar/producir el insumo; adaptar soldadores → [FR-11](../10-operational-boundaries/README.md#fr-11).
5. ✅ En la tarjeta de reposición: cargar la cantidad recibida → RPC `add_stock_inbound` (movimiento `IN`), tarea cerrada.
6. ✅ **Conteo físico** en `/stock`: ingresar la cantidad contada → **Guardar conteo** → RPC `adjust_stock_count` (movimiento `ADJUSTMENT`).

## Preguntas

[Q-STK-*](../14-open-questions/stock.md).
