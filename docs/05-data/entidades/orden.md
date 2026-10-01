# Orden (`ordenes`)

**Qué representa**: una compra de un cliente (el "pedido"). Agrupa uno o más ítems (`sellos`), define el envío y concentra los estados de **envío** y el estado de **venta resumido**. 3.676 filas; 176 web.

## Campos relevantes

| Grupo | Campos | Notas |
|---|---|---|
| Identidad | `id`, `cliente_id`, `fecha` (fecha de negocio), `created_at`, `taken_by` (usuario que la cargó) | `fecha` default `CURRENT_DATE` (UTC); la app manda la fecha argentina |
| Tipo | `tipo_pedido` (`Venta` default, `Prueba`, `Regalo`), `motivo_prueba` | Inmutable después del INSERT. Prueba/Regalo no cuentan como venta. |
| Totales (trigger) | `cantidad_sellos`, `senia_total`, `valor_total`, `restante` (incluye costo de envío **salvo** en `Regalo`, donde restante no suma envío), `costo_fabricacion_total`, `margen_fabricacion_total` | No editar a mano: los recalculan triggers |
| Venta | `estado_orden` | Valores: `Señado`, `Foto`, `Transferido`, `Deudor` (+ legados `Hecho`, `Hacer Etiqueta`, `Etiqueta Lista`, `Despachado`, `Seguimiento Enviado`). ⚠️ 2.048 filas históricas tienen `Seguimiento Enviado` acá. |
| Envío | `empresa_envio` (`Andreani`, `Correo Argentino`, `Via Cargo`, `Retiro`, `Retiro en Persona`), `tipo_envio` (`Domicilio`, `Sucursal`, `Retiro`), `direccion_id`, `seguimiento`, `estado_envio`, `seguimiento_enviado_at` | `estado_envio`: `Sin envio`, `Hacer Etiqueta`, `Error de Etiqueta`, `Etiqueta Lista`, `Despachado`, `Seguimiento Enviado` |
| Auditoría de envío | `envio_datos_cargado_por`, `envio_datos_cargado_at`, `envio_datos_editado` | |
| Etiqueta MiCorreo | `micorreo_subiendo_at/por`, `etiqueta_estado` (`pendiente`, `generando`, `generada`, `pagando`, `pagada`, `error`), `etiqueta_error_codigo/mensaje`, `etiqueta_generada_at`, `etiqueta_pagada_at`, `etiqueta_actualizada_at`, `error_etiqueta_mensaje` | |
| Web | `origen` (`Web`, `App` [nunca se escribe `App`]), `metodo_pago`, `estado_pago_web`, `web_checkout_ref`, `openpay_order_id`, `pago_error_*`, `ultimo_intento_pago_at`, `pago_confirmado_at`, `comprobante_*`, `notas_web`, `carrito_json`, `mockup_solicitud_id` | |

## Ciclo de vida

Ver [00-overview/ciclo-de-vida-del-pedido.md](../../00-overview/ciclo-de-vida-del-pedido.md) y [06-state-machines](../../06-state-machines/README.md).

## Quién la crea / modifica

| Actor | Operaciones |
|---|---|
| Pedidos (alta) | INSERT |
| Tienda web | INSERT, pagos |
| Pedidos/Envíos | estados, envío, dirección, seguimiento |
| `confirm-web-order` | `estado_orden`, `pago_confirmado_at` |
| `webhook-bot`, cron | `Seguimiento Enviado` |
| andreani-worker | `seguimiento`, `Etiqueta Lista`, `Despachado` |
| Triggers | totales, `restante`, `seguimiento_enviado_at`, historial |
| `registrar_rehacer` | vuelve a `Sin envio` |

## Automatizaciones asociadas

Triggers: `update_orden_restante_on_shipping_change`, `trg_ordenes_stamp_seguimiento_enviado`, `trg_preserve_web_pago_confirmado`, `trigger_envio_despachado` (WhatsApp), `trg_consume_stock_on_envio`, `trg_confirm_web_order_*`, `trg_meta_conversion_*`, `trg_estado_historial_ordenes`. Ver [08-automations/triggers.md](../../08-automations/triggers.md).

## Borrado

DELETE en cascada: `sellos`, `tareas`, `estado_historial`, `envio_eventos`, `meta_conversion_log`, etc. Los links/etiquetas Andreani quedan con `orden_id` nulo (por eso la app libera el link antes de borrar).
