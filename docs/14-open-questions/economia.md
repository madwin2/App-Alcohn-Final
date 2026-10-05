# Preguntas abiertas — Economía y gastos

### Q-ECO-001
- **Módulo**: Economía · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué es "Cyprea" (inversiones en Cyprea) y cómo se relaciona con Alcohn?
- **Evidencia**: `movement_type='INV_CYPREA'`, categoría de gastos.
- **Impacto**: bajo (glosario).
- Respuesta: Es una marca paralela que desarrollamos de sellos de lacre.

### Q-ECO-002
- **Módulo**: Economía · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Las cajas (efectivo, Mercado Pago, cuentas bancarias) se actualizan a mano? ¿Se concilian con las ventas "Transferido"?
- **Impacto**: medio.
- Respuesta: Se actualizan a mano, por lo que estan desactualizadas.

### Q-ECO-003
- **Módulo**: Gastos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Los costos de fabricación cargados (fresa, bronce por cm, insumos) están vigentes? ¿Cada cuánto se actualizan?
- **Evidencia**: una sola versión en `fabricacion_parametros` (fecha 1970).
- **Impacto**: medio (márgenes en Economía).
- Respuesta: Si, estan vigentes. Se actualizan cada vez que hay cambios significativos en los costos. Variable.

### Q-ECO-004
- **Módulo**: Economía / Gastos · **Estado**: documentada (2026-10-05)
- **Pregunta**: ¿Cómo se registra la publicidad y en qué moneda/cotización?
- Respuesta: Se pagaba con varias tarjetas (del dueño y familiares) y se cargaba el total del resumen en el mes. Meta y Google cobran en USD (sep-2026 ≈ 2.500 / 800 USD). Decidido: gasto por día desde las plataformas, valuado al blue del día del pago, gasto + IVA en la categoría y 2 % extra en impuestos; objetivo 25 % de rentabilidad. Ver [decisión](../13-decisions/control-de-gastos.md).

### Q-ECO-005
- **Módulo**: Gastos · **Estado**: abierta
- **Pregunta**: ¿Qué % exacto suman los recargos de los cargos en USD además del IVA (IIBB servicios digitales, sellos, etc.)? ¿Alguno es recuperable?
- **Impacto**: bajo-medio (hoy se estima 2 %, configurable en `control_gastos_config.otros_impuestos_usd_pct`).

### Q-ECO-006
- **Módulo**: Gastos · **Estado**: abierta
- **Pregunta**: ¿Dónde se factura el costo de conversaciones de WhatsApp Business (bot)? ¿Es la misma cuenta que la publicidad?
- **Impacto**: bajo (fuera de la Etapa 1).
