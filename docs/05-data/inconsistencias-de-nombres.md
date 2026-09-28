# Inconsistencias de nombres y conceptos

Conceptos que tienen nombres distintos en distintas capas, o nombres que no dicen lo que son. **No se unificaron**: se documentan para no equivocarse.

## Entidades

| Concepto | Nombres en el código | Aclaración |
|---|---|---|
| Pedido | `ordenes` (DB), `Order` (TS), "pedido" (UI), "orden" (comentarios), `numero_pedido` (WhatsApp = id de la orden) | Mismo concepto |
| Ítem de un pedido | `sellos` (DB), `OrderItem` / `ProductionItem` / `ProgramStamp` (TS), "sello", "ítem", "diseño" (UI) | Un "sello" puede ser un **accesorio** (`item_type`). "Diseño" también es el **nombre** del ítem (`diseno`). |
| Orden en Producción | `ProductionItem.orderId` | — |
| Programa | `programa` (singular en DB), `Program` (TS), "hoja" (UI nueva), "programa" | La UI de 2026-09 habla de "hojas" y "bolsillos". |
| Link de pago de Andreani | "link de envío", "link de pago", `link_andreani` | El cliente paga el **envío** ahí. |

## Medidas

| Campo | Lo que sugiere | Lo que realmente guarda |
|---|---|---|
| `sellos.ancho_real` | ancho | **lado mayor** en **cm** |
| `sellos.largo_real` | largo | **lado menor** en **cm** |
| `sellos.ancho_fabricacion_mm` / `largo_fabricacion_mm` | ancho/largo | mayor / menor en **mm** |
| `requestedWidthMm` / `requestedHeightMm` (TS) | ancho/alto | mayor / menor |
| Planchuela 19 vs 20, 38 vs 40 | — | La misma planchuela: 19/38 en reglas y DB (`tipo_planchuela`), 20/40 en precios de parámetros (`planchuela20`, `planchuela40`) y en la UI de Gastos ("20 mm", "40 mm"). 19 = stock de 20 mm con 18 mm útiles. |
| `sellos.tipo_planchuela = 100` | — | Valor permitido por el CHECK sin uso actual (legado). |

## Estados

| Tema | Detalle |
|---|---|
| `ordenes.estado_orden` | Se llama "estado de la orden" pero es el **estado de venta resumido**. Históricamente también guardó estados de envío (`Hacer Etiqueta`, `Etiqueta Lista`, `Despachado`, `Seguimiento Enviado`) y de fabricación (`Hecho`); el CHECK todavía los admite y 2.048 filas tienen `Seguimiento Enviado`. |
| `'Foto'` vs `FOTO_ENVIADA` vs "Foto enviada" | Mismo estado de venta (DB / TS / UI). |
| `'Señado'` vs `SEÑADO` | Con eñe en ambos. |
| `'Sin envio'` | Sin tilde en la DB; "Sin envío" en la UI. |
| `'Prioridad'` | Antes era un **estado de fabricación**; hoy la prioridad es el flag `es_prioritario`. Quedan 4 sellos con `Prioridad`; se muestra como `Sin Hacer`. |
| Estados de producción | Producción usa `PENDIENTE`/`EN_PROGRESO`/`COMPLETADO`/`REVISAR`/`REHACER` (no existen en la DB). |
| `Verificar` vs `Verificado` | El mapper de programas acepta `Verificado`, que no existe en el CHECK. |
| `RETIRO_EN_ORIGEN` / `ENTREGA_EN_SUCURSAL` (`ShippingOriginMethod`) | Se derivan de `tipo_envio` con una lógica que no coincide con sus nombres (Sucursal → "retiro en origen"). Parecen sin uso. |
| Transportista "Otro" | En TS `OTRO` se guarda como `'Retiro'` en la DB (y `'Retiro'` se lee como `OTRO`); "Retiro en Persona" es otro valor. |
| `origen` | `'Web'`/`'App'` en `ordenes` (la app nunca escribe `'App'`, deja nulo); `'web'`/`'app'` (minúsculas) en `mockup_solicitudes`. |
| Máquina `Circular` | Admitida por el CHECK de `programa.maquina`, se lee como `C`. |

## Tareas

"Tarea" designa tres cosas distintas: `tareas` (por orden), `tareas_pedidos_globales` (post-its de orden), `tareas_dashboard` (tareas entre compañeros y de stock). Ver [entidades/tareas.md](entidades/tareas.md).

## Varios

- `Program.version`, `status`, `category`, `createdBy`, `tags`, `settings` (TS): valores fijos sin respaldo en la DB (restos de una plantilla).
- `ProgramType` (`ILLUSTRATOR`, `PHOTOSHOP`, `COREL`, `AUTOCAD`) en `types/index.ts`: sin uso.
- "Aspire" designa a la vez el software (Vectric Aspire), el archivo `.crv3d` y el estado `estado_aspire` del sello.
