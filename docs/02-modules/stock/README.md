# Stock

> Ruta: `/stock` · Página: `src/app/stock/index.tsx` · Servicio: `src/lib/supabase/services/stock.service.ts`, `bronceConsumo.service.ts` · En el Inicio: `src/components/home/StockReplenishSection.tsx`
> Workflow: [WF-11](../../03-workflows/WF-11-stock-y-reposicion.md) · Migraciones: `migration_add_stock_management.sql`, `migration_auto_consume_stock_on_seguimiento_enviado.sql`, `migration_stock_consumo_completo.sql`

## Propósito

✅ Llevar las cantidades de **insumos de armado** (no el bronce): mangos, tubos, tuercas, varillas, prisioneros, soldadores, bases, cajas/soportes de abecedario. Descontarlos automáticamente cuando un pedido se despacha, calcular cuánto hace falta para los pedidos pendientes y generar **tareas de reposición** para los responsables. Además muestra el **consumo de bronce** (planchuela) por mes.

## Ítems de stock (✅ 15 claves en `stock_items`)

`MANGO`, `TUERCA`, `PRISIONERO`, `VARILLA`, `TUBO_80MM`, `TUBO_125MM`, `SOLDADOR_100W`, `SOLDADOR_200W`, `SOLDADOR_ADAPTADO_100W`, `SOLDADOR_ADAPTADO_200W`, `MANGO_GOLPE`, `BASE_REMACHADORA`, `ALUMINIO_PARA_BASE`, `CAJA_ABECEDARIO`, `SOPORTE_ABECEDARIO`. Se crean solos si faltan (`ensureDefaultStockItems`). `min_quantity` existe pero está en 0 para todos. Las cantidades **pueden ser negativas** (faltante a cargar/contar).

## Lista de materiales por ítem (BOM) — BR-STK-001

✅ Única fuente en SQL (`stock_bom_for_item`), usada por consumo y demanda:

| Ítem del pedido | Consume |
|---|---|
| `SELLO` | 1 tubo 80 mm, 1 prisionero, 1 varilla, 1 mango, 1 tuerca |
| `ABECEDARIO` (o tipo `ABC`) | 1 tubo 125 mm, 1 mango, 1 varilla, 1 prisionero, 1 tuerca, 1 soporte, 1 caja |
| `SOLDADOR` 100 W / 200 W | 1 soldador **adaptado** de esa potencia; si no hay, 1 soldador sin adaptar |
| `MANGO_GOLPE` | 1 mango de golpe |
| `BASE_REMACHADORA` | 1 base remachadora + 1 aluminio para base |

✅ "Adaptar" un soldador = cortarle la punta y hacerle una rosca M6 para enroscar el sello (Q-STK-002).

## Descuento automático — BR-STK-002

✅ Cuando `ordenes.estado_envio` pasa a `'Seguimiento Enviado'`:
- **Trigger** `trg_consume_stock_on_envio` → `consume_stock_for_order` (idempotente: si ya hay movimientos `OUT` de esa orden, no hace nada). **Siempre descuenta la BOM completa**; el stock puede quedar negativo (decisión 2026-10-01).
- Ya **no** hay llamada TS desde Pedidos: el descuento lo hace solo el trigger.
- Si una orden vuelve atrás (p. ej. Rehacer), el stock **no** se repone (y esa orden deja de contar como demanda si ya tuvo `OUT`).

## Demanda y reposición — BR-STK-003

✅ RPC `get_pending_stock_demand` (vía `getPendingShipmentStockDemand`): BOM de ítems de órdenes no enviadas, creadas hace ≤60 días **o** con ítems `Deudor`, sin descuento `OUT` previo (Q-STK-003 implementada 2026-10-01).
✅ `syncStockReplenishTasksForCurrentUser` (al abrir el Inicio): para cada ítem del que el usuario es **responsable** (`stock_alert_assignments`), si faltante = demanda − stock > 0 (stock negativo suma), crea/actualiza **una** tarea `[STOCK_REPLENISH]` en `tareas_dashboard` y emite notificación **p6** (stock bajo); si se resolvió, borra la tarea y la alerta.
✅ Desde la tarjeta del Inicio se registra el ingreso → RPC `add_stock_inbound` (movimiento `IN`) y cierre de la tarea (`applyStockInboundFromReplenishTask`).

## Pantalla

- Stock del sistema como texto (rojo + badge **Negativo** si < 0). Al lado, input **Conteo físico** + **Guardar conteo** → RPC `adjust_stock_count` (movimiento `ADJUSTMENT`, BR-STK-006).
- Responsables por ítem (multi-usuario).
- **Consumo de bronce** por mes y por planchuela (`bronce_consumo`: se registra al marcar un SELLO `Hecho`, con largo en cm y costo en pesos según `fabricacion_parametros`), navegación por mes.

## Tablas

`stock_items`, `stock_movements`, `stock_alert_assignments`, `bronce_consumo`, `tareas_dashboard`.

## Fronteras

❓ Compra y recepción física de insumos, adaptación de soldadores, stock de bronce/planchuelas y de packaging (no se trackean) → [FR-11](../../10-operational-boundaries/README.md#fr-11), [Q-STK-001](../../14-open-questions/stock.md#q-stk-001).
