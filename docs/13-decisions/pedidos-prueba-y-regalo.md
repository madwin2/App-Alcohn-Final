# ADR — Pedidos de prueba y regalo: tipo en la orden + marca por ítem

- **Fecha**: 2026-10-01
- **Estado**: aceptada
- **Contexto**: Hacía falta fabricar sellos que no son ventas (pruebas internas y regalos) sin ensuciar métricas, Meta, cobros ni WhatsApp de pago.
- **Decisión**:
  1. Columna `ordenes.tipo_pedido` ∈ {Venta, Prueba, Regalo} (default Venta).
  2. Columna `sellos.es_regalo` para ítems sin cargo dentro de una Venta (o todos los de una orden Regalo).
  3. Cliente interno `es_interno` para pruebas (sin teléfono).
  4. Una sola regla de conteo: `itemCuentaComoVenta` / `ordenCuentaComoVenta`.
  5. Tipo e `es_regalo` inmutables después del INSERT (si se cargó mal, borrar y recrear).
- **Alternativas descartadas**:
  - Solo flag por ítem sin tipo de orden: no alcanza para “Prueba nunca se envía” ni “Regalo nace Transferido”.
  - Órdenes en otra tabla: duplicaría producción/programas/stock.
- **Consecuencias**: migración en producción (`migration_pedidos_prueba_y_regalo.sql`); plantillas WhatsApp de regalo pendientes (Q-WA-007); Economía gana líneas de gasto Regalos/Pruebas.
- **Plan**: [`PLAN_PEDIDOS_PRUEBA_Y_REGALO.md`](../../PLAN_PEDIDOS_PRUEBA_Y_REGALO.md)
