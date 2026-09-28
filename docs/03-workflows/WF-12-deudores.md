# WF-12 · Deudores

| | |
|---|---|
| **Inicio** | Cron `auto-deudor-foto-enviada` diario 09:00 UTC (🔶 06:00 Argentina). |
| **Actor** | Sistema; luego Ventas. |
| **Resultado** | Orden y sus ítems en `Deudor`; notificación urgente a Ventas. |

## Regla (✅ `marcar_ordenes_deudores_por_foto`)

Una orden pasa a `Deudor` si:
- `estado_orden` es nulo, `Señado`, `Hecho` o `Foto`;
- tiene ítems y **todos** tienen `estado_venta='Foto'`;
- la fecha más reciente en que algún ítem pasó a `Foto` (según `estado_historial`; si no hay, `updated_at`) es de hace **≥ 10 días**.

Efectos: ítems `Foto → Deudor`, `ordenes.estado_orden='Deudor'`, notificación **v4_deudor** (urgent, área ventas, una por orden).

## Consecuencias

- La orden sale de la cola de Envíos (no se despachan deudores).
- Aparece en "Deudores" del Inicio y en el pendiente de cobro de Economía.
- Política deseada: **recordatorio cada ~15 días** mientras siga deudor (POL-008). **No implementado.**
- Salir de `Deudor`: a mano (celda Venta → Transferido). 🔶 No hay automatización inversa.
