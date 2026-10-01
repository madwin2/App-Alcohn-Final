# Preguntas abiertas — Stock

### Q-STK-001
- **Módulo**: Stock · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Se quiere controlar stock de bronce (planchuelas) y packaging? Hoy solo se registra consumo de bronce.
- **Impacto**: medio.
- Respuesta: Si, queremos hacerlo a futuro. Es el siguiente paso aunque es medio complejo.

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
