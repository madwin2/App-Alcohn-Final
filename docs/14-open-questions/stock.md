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
- **Módulo**: Stock · **Estado**: documentada (2026-09-28)
- **Pregunta**: La demanda pendiente incluye 108 pedidos históricos sin estado de envío y pedidos no fabricados. ¿Es la demanda correcta para reponer?
- **Evidencia**: `getPendingShipmentStockDemand`.
- **Impacto**: medio (faltantes inflados).
- Respuesta: Pareceria que no. Si son de hace mas de dos meses estan mal, ya deben haber sido entregados y demas. (salvo que sean deudores, pero no hay ningun pedido de hace mas de dos meses que no se haya fabricado)

### Q-STK-004
- **Módulo**: Stock · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Los mínimos (`min_quantity`, todos en 0) se van a usar? ¿Se necesita registrar ajustes de inventario?
- **Impacto**: bajo.
- Respuesta: No se bien de que son, pero supongo que en algun momento si, debe ser minimo que se necesita? por ahora no se usa, aunque me gustaria que en un futuro si.
