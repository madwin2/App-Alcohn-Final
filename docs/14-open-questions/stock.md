# Preguntas abiertas — Stock

### Q-STK-001
- **Módulo**: Stock · **Estado**: documentada (2026-10-22; bronce) · packaging pendiente
- **Pregunta**: ¿Se quiere controlar stock de bronce (planchuelas) y packaging? Hoy solo se registra consumo de bronce.
- **Impacto**: medio.
- Respuesta: Si, queremos hacerlo a futuro. Es el siguiente paso aunque es medio complejo.
- **Respuesta (usuario, 2026-10-21), bronce**: hay que saber cuánto se gasta, cuánto queda y cuánto queda **para mecanizar**: 400 mm en dos piezas no son 400 mm usables, porque una fila no se arma con dos piezas. Se compra por metro pidiendo el corte (p. ej. 1 m = 2 × 400 + 1 × 200). Máximo por fila: C 400, G 250, XL 250; se usan piezas más cortas y restos de otra máquina; en la G se evita que sobresalga salvo que no haya otra. No se pierde nada al principio ni al final de la pieza. Sirve hasta 25 mm. No unir piezas. El registro **no debe ser una tarea más** ni obligar a elegir la pieza. → POL-091…095, [propuesta](../02-modules/stock/propuesta-stock-bronce.md). Las medidas de referencia (19 → 20, 38 → 40) se mantienen.
- **Implementación (2026-10-22)**: `migration_bronce_stock_piezas.sql` aplicada el 2026-10-22, BR-STK-008…011. Falta el conteo inicial.

### Q-STK-002
- **Módulo**: Stock · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué es "adaptar" un soldador y quién lo hace?
- **Impacto**: bajo.
- Respuesta: Cortar la punta del soldador y hacerle un roscado m6 para que el sello se pueda enroscar.

### Q-STK-003
- **Módulo**: Stock · **Estado**: implementada (2026-10-01)
- **Pregunta**: La demanda pendiente incluye 108 pedidos históricos sin estado de envío y pedidos no fabricados. ¿Es la demanda correcta para reponer?
- **Evidencia**: `getPendingShipmentStockDemand`.
- **Impacto**: medio (faltantes inflados).
- Respuesta: Pareceria que no. Si son de hace mas de dos meses estan mal, ya deben haber sido entregados y demas. (salvo que sean deudores, pero no hay ningun pedido de hace mas de dos meses que no se haya fabricado)
- **Implementación**: RPC `get_pending_stock_demand` filtra ≤60 días o `Deudor`, y excluye órdenes con `OUT` previo.

### Q-STK-004
- **Módulo**: Stock · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Los mínimos (`min_quantity`, todos en 0) se van a usar? ¿Se necesita registrar ajustes de inventario?
- **Impacto**: bajo.
- Respuesta: No se bien de que son, pero supongo que en algun momento si, debe ser minimo que se necesita? por ahora no se usa, aunque me gustaria que en un futuro si.

### Q-STK-005
- **Módulo**: Stock · **Estado**: abierta
- **Pregunta**: Sellos `tipo` **3mm, Lacre, Alimento** hoy consumen la misma BOM que un sello clásico (tubo 80, mango, varilla, prisionero, tuerca). ¿Es correcto?
- **Evidencia**: `stock_bom_for_item` (rama else); ~67 ítems históricos.
- **Impacto**: medio (consumo incorrecto si no llevan esos insumos).

### Q-STK-006
- **Módulo**: Stock · **Estado**: abierta
- **Pregunta**: ¿Los pedidos que se **retiran en persona** llegan alguna vez a `Seguimiento Enviado`? Si no, nunca descuentan stock y cuentan como demanda 60 días.
- **Evidencia**: BR-STK-002/003; `empresa_envio` Retiro en Persona.
- **Impacto**: medio.

### Q-STK-007
- **Módulo**: Stock (bronce) · **Estado**: documentada (2026-10-22)
- **Pregunta**: ¿Cuándo se considera gastada la pieza de una fila: al terminar el programa, o al marcar cada sello `Hecho`? Un sello que se mecanizó y después va a `Rehacer`, ¿cuenta como gastado en esa corrida (físicamente sí se cortó)? ¿Hay sellos que se fabrican fuera de un programa (sin fila asignada) y de qué pieza salen?
- **Evidencia**: `bronce_consumo` registra por sello en cada paso a `Hecho` (Rehacer → Hecho cuenta de nuevo); la propuesta descuenta por fila del programa.
- **Por qué importa**: define el disparador del descuento automático y evita contar doble o no contar los sellos fallidos.
- **Impacto**: medio.
- **Respuesta (usuario, 2026-10-22)**: la pieza se descuenta **al terminar el programa**. Un sello que salió mal se marca `Rehacer` y se vuelve a fabricar como si fuera nuevo. No sabe qué debería pasar con un sello sin programa que se marca `Hecho`.
- **Contraste con el código** ✅: el usuario entiende que Rehacer genera una orden aparte; eso pasa **solo post-entrega** (orden `Garantía` con un clon). Antes de la entrega es **in-place**: el mismo sello vuelve a `Rehacer` y puede seguir con su `programa_id` viejo (AUD-INC-013, POL-017 pendiente). Con `deriveLifecycleFromStamps`, un sello en `Rehacer` impide que ese programa llegue a `FINALIZADO`, y el candado muestra `BLOQUEADO` aunque todo esté hecho. Por eso «terminar el programa» no puede leerse del estado mostrado (ver [propuesta §5.1](../02-modules/stock/propuesta-stock-bronce.md#51-cuándo-se-descuenta)).
- **Confirmado (usuario, 2026-10-22)**: programa terminado = **todos sus sellos en `Hecho`, `Verificar` o `Rehacer`**.
- **Confirmado (usuario, 2026-10-22)**: un sello `Hecho` **sin programa no descuenta pieza**; queda en `bronce_consumo` y la diferencia se corrige en el conteo.

### Q-STK-008
- **Módulo**: Stock (bronce) · **Estado**: documentada (2026-10-22)
- **Pregunta**: ¿Quién recibe el aviso de que hay que pedir bronce (los mismos responsables por ítem de Stock, o alguien fijo)? ¿Con cuánta anticipación conviene avisar, más allá de los 2–3 días de envío (FR-11)?
- **Por qué importa**: la compra sugerida necesita destinatario y margen.
- **Impacto**: bajo.
- **Respuesta (usuario, 2026-10-22)**: avisar a **Julián (dueño)** y a **Producción** (Fede). La anticipación no se definió: se arranca con la demora de envío de FR-11 y se ajusta con el uso.
