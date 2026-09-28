# WF-02 · Pedido de la tienda web

| | |
|---|---|
| **Inicio** | Un visitante de la tienda web (otro sistema) arma un carrito, a menudo después de generar un mockup en el generador web. |
| **Actores** | Cliente; tienda web; equipo de Ventas (si paga por transferencia); sistema. |
| **Módulos** | Tienda web (externa), Comercial Web, Pedidos, Envíos, Meta |
| **Resultado** | Orden visible en Alcohn AI, con sellos `Sin Hacer`/`Señado` y WhatsApp de confirmación. |

## Pasos

1. 🔶 (Tienda web) Crea/reutiliza `clientes` (`medio_contacto='Web'`), crea `ordenes` con `origen='Web'`, `estado_pago_web='pendiente'`, `metodo_pago`, `carrito_json`, `notas_web`, dirección de envío validada contra `correo_sucursales` y posiblemente `mockup_solicitud_id`.
2. ✅ Mientras `estado_pago_web ≠ 'pagado'`, la orden está **oculta** en Pedidos/Producción/Envíos, pero **visible en Comercial Web → Potenciales** (prioridad "caliente").
3. Pago:
   - **Openpay (tarjeta/link)**: 🔶 la web actualiza `estado_pago_web='pagado'` al confirmar el pago.
   - **Transferencia**: el cliente sube comprobante (bucket `comprobantes`, `esperando_comprobante`). ❓ Un usuario verifica que el dinero entró → [FR-06](../10-operational-boundaries/README.md#fr-06) y en Comercial Web → **Confirmar pago** (monto de seña, nombre del diseño). ✅ `confirmWebOrderPayment` crea los sellos desde el carrito y marca `pagado`.
4. ✅ Trigger (`trg_confirm_web_order_on_pago_confirmado` / `_on_insert` / `_on_sellos_insert`) → edge **`confirm-web-order`** (idempotente):
   - normaliza sellos desde el carrito (uno por unidad; precio transferencia o ×1,15; seña repartida; medidas del `variantSize` o del mockup; base = imagen del mockup);
   - `estado_orden='Señado'`, `pago_confirmado_at`;
   - Andreani → asigna link del pool;
   - WhatsApp `pedido_registrado`.
5. ✅ Trigger Meta: evento **Purchase** (Conversions API) para la orden pagada.
6. La orden entra al flujo normal (WF-03 en adelante). En Envíos se marca como "datos de checkout pendientes de confirmar" hasta que alguien guarde los datos.

## Estados

`estado_pago_web`: `pendiente` → (`pago_fallido` | `esperando_comprobante` | `abandonado`) → `pagado` (no puede volver atrás). Ver [06-state-machines/pago-web.md](../06-state-machines/pago-web.md).

## Excepciones

- Carrito sin ítems con precio: `confirm-web-order` no crea sellos pero **igual** manda el WhatsApp y registra el error en `web_pedido_confirm_log`.
- Si ya había sellos creados por la web con totales distintos, se **borran y recrean**.
- `skip_pedido_registrado` en `notas_web` evita el WhatsApp.

## Preguntas

[Q-WEB-001…Q-WEB-005](../14-open-questions/comercial-web.md).
