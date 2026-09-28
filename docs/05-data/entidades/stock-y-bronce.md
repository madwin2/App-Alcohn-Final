# Stock y bronce

| Tabla | Qué representa | Notas |
|---|---|---|
| `stock_items` | Un insumo (15 claves fijas en `item_key`) con `quantity` y `min_quantity` (≥0) | Ver [stock](../../02-modules/stock/README.md) |
| `stock_movements` | Movimiento `IN`/`OUT`/`ADJUSTMENT` (cantidad > 0), opcionalmente ligado a `order_id`; `created_by` default `auth.uid()` (o UUID cero si lo hizo el trigger sin sesión) | 4.927 filas; la nota `[auto]` identifica consumos automáticos |
| `stock_alert_assignments` | Qué usuarios son responsables de reponer cada ítem | |
| `bronce_consumo` | Consumo de planchuela de bronce por sello al marcar `Hecho`: `tipo_planchuela_ref`, `largo_cm` (lado mayor + pérdida), `costo_pesos` | 737 filas; lo inserta un trigger |

🔶 El **bronce no tiene stock**: solo se registra consumo. ❓ [Q-STK-001](../../14-open-questions/stock.md#q-stk-001).
