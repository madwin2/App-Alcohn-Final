# Notificaciones internas

> UI: campana flotante `src/components/notificaciones/NotificationBell.tsx` (en todas las pantallas autenticadas salvo FBTEST) · Hook: `useNotifications` · Emisión: `src/lib/notificaciones/events.ts` + RPC `emitir_notificacion` · Servicio: `notificaciones.service.ts`
> Especificación de diseño: `notificaciones-funcional.md`, `notificaciones-ui.md` (raíz) · Migración: `migration_notificaciones.sql`

## Propósito

✅ Avisar a cada persona, **según su área**, de cambios que hizo **otra persona o el sistema** y que afectan su trabajo. No son mensajes al cliente (esos van por WhatsApp).

## Modelo (✅)

- `notificaciones`: tipo, área, autor, título, cuerpo, entidad (`orden`/`sello`/`programa`…), `link_path`, severidad (`info`/`warning`/`urgent`), `dedup_key`, metadata.
- `notificacion_destinatarios`: una fila por usuario destinatario, con `leida_at`.
- RPC `emitir_notificacion`: si hay `dedup_key` ya emitida, no duplica; destinatarios = lista explícita **o** todos los usuarios del área (`usuario_area`), **excluyendo al autor**.
- Realtime sobre ambas tablas. RLS: cada usuario ve solo sus destinatarios.

## Catálogo de tipos

| Tipo | Área | Severidad | Disparador | Origen |
|---|---|---|---|---|
| `p1_sello_modificado` | producción | info | Cambio de tipo, archivo base, vector o medida en un sello "en curso" | TS (`updateOrder`, `updateProductionItem`) |
| `p2_rehacer` | producción | warning | Rehacer registrado | TS |
| `p3_prioridad` | producción | info | Sello marcado prioritario | TS |
| `p4_vencimiento_proximo` / `p4_vencimiento_vencido` | producción | warning / urgent | Fecha límite de un sello no `Hecho` a ≤3 días / vencida | **cron** 09:10 UTC |
| `p6_stock_bajo` | producción (responsables) | warning | Faltante de insumo vs pedidos pendientes | TS (al abrir Inicio) |
| `p7_sello_no_importado` | producción | warning | El gadget no pudo importar un sello en Aspire | Edge `programa-sync` / TS |
| `v1_items_pedido_pagado` | ventas | warning | Se agregó un ítem a una orden ya pagada o con foto enviada | TS |
| `v2_rehacer` | ventas | warning | Rehacer registrado | TS |
| `v3_sellos_hechos` | ventas | info | Sellos pasaron a `Hecho` (agrupado: "N sellos fueron terminados") | TS |
| `v4_deudor` | ventas | urgent | Orden pasó a Deudor (10+ días con foto sin pagar) | **cron** 09:00 UTC |
| `l1_direccion_post_etiqueta` | logística | warning | Se cambiaron datos de envío con la etiqueta ya generada/pagada | TS (Envíos) |
| `l2_despacho_proximo` / `l2_despacho_vencido` | logística | warning / urgent | La fecha límite de la orden está a ≤3 días / vencida y no se despachó | **cron** 09:10 UTC |
| `t1_tarea_asignada` | (usuario) | info | Un compañero te asignó una tarea | TS |

## Abrir una notificación

✅ Navega a `link_path` y, en Pedidos/Producción, deja el buscador con el **teléfono del cliente** (y en Pedidos activa "toda la base") para mostrar justo ese pedido (`prepararBusquedaDePedido`).

## Observaciones

- Las notificaciones emitidas desde TS dependen de que la acción ocurra en la app; cambios hechos por SQL o por workers no las generan (salvo las de cron/edge).
- `dedup_key` por sello/orden hace que un aviso de vencimiento se emita **una sola vez** por sello; se puede limpiar con `clear_notificacion_dedup`.
