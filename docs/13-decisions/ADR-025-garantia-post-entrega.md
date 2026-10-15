# ADR-025 — Rehacer post-entrega crea orden `Garantía`

- **Fecha**: 2026-10-15
- **Estado**: implementada (2026-10-15; migración aplicada en producción)
- **Contexto**: Rehacer in-place sobre un pedido ya entregado reabría el ciclo comercial (envío, foto, historial) y ensuciaba la cola. Se necesitaba un contenedor operativo nuevo que no sume a ventas del mes.
- **Decisión** (Q-PED-006 / POL-086):
  1. Si `estado_envio` ∈ {`Despachado`, `Seguimiento Enviado`} (= ya entregado), `registrar_rehacer` crea una orden `tipo_pedido='Garantía'` con ítem **clonado**; el original queda intacto.
  2. Pre-entrega sigue el Rehacer in-place.
  3. `Garantía` no cuenta como venta (`ordenCuentaComoVenta` / `itemCuentaComoVenta`).
  4. Foto / WhatsApp `pedido_listo`: pide el cargo adicional o **$0** (`valor` del clon).
  5. Economía: gasto = fabricación + envío imputado; Andreani con link = 0 (BR-COS-006).
- **Alternativas descartadas**:
  - Reutilizar `Prueba`: cliente interno y sin WhatsApp.
  - Solo flag en el mismo pedido: no resuelve foto/envío/historial.
- **Consecuencias**: migración `migration_garantia_post_entrega.sql`; badge/filtro Garantía; línea de gasto en Economía; docs WF-08 / rehacer.
- **Fuente**: conversación de producto 2026-10-15.
