# Stock y bronce

| Tabla | Qué representa | Notas |
|---|---|---|
| `stock_items` | Un insumo (15 claves fijas en `item_key`) con `quantity` y `min_quantity` (≥0) | Ver [stock](../../02-modules/stock/README.md) |
| `stock_movements` | Movimiento `IN`/`OUT`/`ADJUSTMENT` (cantidad > 0), opcionalmente ligado a `order_id`; `created_by` default `auth.uid()` (o UUID cero si lo hizo el trigger sin sesión) | 4.927 filas; la nota `[auto]` identifica consumos automáticos |
| `stock_alert_assignments` | Qué usuarios son responsables de reponer cada ítem | |
| `bronce_consumo` | Consumo de planchuela de bronce por sello al marcar `Hecho`: `tipo_planchuela_ref`, `largo_cm` (lado mayor + pérdida), `costo_pesos` | 737 filas; lo inserta un trigger |
| `bronce_compras` | Una compra recibida (fecha, nota) | `migration_bronce_stock_piezas.sql` (aplicada 2026-10-22) |
| `bronce_piezas` | Pieza física: `ancho_ref`, `largo_mm` actual, `largo_inicial_mm`, `estado` (`disponible`/`retazo`/`baja`) | Escritura solo por RPC/trigger |
| `bronce_movimientos` | `INGRESO`/`CONSUMO`/`AJUSTE`/`RETAZO`/`BAJA`/`CONTEO`, con `pieza_id`, `programa_id`, `sobresale`, `sin_pieza` | Único `CONSUMO` por `(programa_id, ancho_ref)` |

Stock de bronce por pieza: [propuesta e implementación](../../02-modules/stock/propuesta-stock-bronce.md). El stock arranca con el conteo inicial; hasta entonces terminar un programa no registra nada. ❓ [Q-STK-001](../../14-open-questions/stock.md#q-stk-001).
