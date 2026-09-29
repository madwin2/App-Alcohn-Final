# Pedidos

> Ruta: `/pedidos` · Página: `src/app/pedidos/index.tsx` · Servicio: `src/lib/supabase/services/orders.service.ts` · Estado compartido: `src/lib/context/OrdersProvider.tsx`
> Workflows: [WF-01 alta manual](../../03-workflows/WF-01-alta-manual-de-pedido.md), [WF-05 foto y cobro](../../03-workflows/WF-05-foto-y-cobro.md), [WF-06 Correo](../../03-workflows/WF-06-envio-correo-argentino.md), [WF-08 rehacer](../../03-workflows/WF-08-rehacer.md)
> Subdocumentos: [rehacer.md](rehacer.md) · [fotos-y-seguimientos.md](fotos-y-seguimientos.md)

## Propósito

✅ Panel central de gestión de ventas: cada **fila** es una orden (`ordenes`) y al expandirla muestra sus **ítems** (`sellos`). Desde acá se crean pedidos, se editan montos y estados (fabricación, venta, envío), se suben archivos (base, vector, foto), se cargan números de seguimiento y se disparan los mensajes de WhatsApp al cliente.

## Usuarios

🔶 Principalmente Ventas (alta, fotos, cobro) y Logística (seguimientos). Sin restricción por área en el código.

## Conceptos principales

Orden, ítem/sello, cliente, seña, restante, estados de fabricación/venta/envío, prioridad, fecha límite, tareas, cargos de rehacer. Ver [05-data](../../05-data/README.md) y [glosario](../../15-glossary/README.md).

## Qué órdenes se ven

✅ `getOrders` (`orders.service.ts`):
- **Operativo** (por defecto): órdenes con `fecha` de los **últimos 6 meses** + (en segundo plano) órdenes más viejas con envío abierto (`estado_envio` nulo, `Sin envio`, `Hacer Etiqueta`, `Error de Etiqueta`, `Etiqueta Lista`), hasta 400.
- **Catálogo completo**: toggle "buscar en toda la base" (`searchAcrossDatabase`) → pagina todas las órdenes.
- **Siempre ocultas**: órdenes web (`origen='Web'`) que no tienen `estado_pago_web='pagado'` (BR-WEB-001).
- Tiempo real: suscripción a `ordenes`, `sellos`, `tareas` con debounce de 1,5 s; refresco al volver a la pestaña (si pasaron ≥45 s).

## UI

- **Header** (`OrdersHeader`): Nuevo pedido · Filtros · Orden · **Subir fotos** · **Cargar seguimientos** · Exportar ventas (CSV: fecha, teléfono, nombre, valor, mail) · chips de filtro por estado de fabricación · buscador.
- **Tabla** (`OrdersTable`, columnas en `columns.tsx`): indicadores, fecha, cliente (abre perfil), contacto, tipo, diseño, empresa de envío, seña, valor, restante, prioridad, fabricación, venta, estado de envío, seguimiento, base, vector, foto, tareas, cargos de rehacer. Columnas redimensionables; configuración guardada por usuario en `vistas_tabla` (`tabla='pedidos'`).
- **Fila expandida** (`ExpandableRow`): un renglón por ítem, con las mismas celdas editables por ítem. Menú contextual con acciones (agregar ítem, eliminar, hoja de fabricación de abecedario, etc.).
- **Diálogos**: `NewOrderDialog` (3 pasos), `AddStampDialog` (agregar ítem), `UploadPhotosDialog`, `UploadTrackingDialog`, `RehacerDialog`, `ClienteProfileDialog`, `FiltersDialog` (rango de fechas/mes, estados de fabricación/venta/envío, tipos, canales, quién cargó), `SorterDialog` (criterios y prioridad de estados de fabricación), `AddTaskModal`.

## Acciones

| Acción | Precondición | Cambios | Side effects / integraciones |
|---|---|---|---|
| **Crear pedido** ([WF-01](../../03-workflows/WF-01-alta-manual-de-pedido.md)) | Cliente + ≥1 diseño. Advierte si algún vector no es SVG. | Busca cliente por variantes de teléfono y luego email; si existe **actualiza** nombre/teléfono/email. INSERT `ordenes` (`estado_orden='Señado'`, `fecha`=hoy AR, `taken_by`=usuario, empresa/servicio del **primer** diseño; si es internacional: `notas_web.international` con país/moneda y DHL por defecto). INSERT un `sellos` por diseño (montos en moneda local si es internacional). Sube archivos (base→`base`, vector→`vector` con preview si EPS, foto→`foto`). | WhatsApp `pedido_registrado` (salvo checkbox "no enviar"). Vectorización automática si el flag está activo (hoy no). Triggers: totales, restante (+envío), costo de fabricación, historial de estados, Meta CAPI. |
| **Agregar ítem** | — | INSERT `sellos` + archivos. | WhatsApp `pedido_actualizado` (salvo `notifyCustomer:false`). Notificación **v1** a Ventas si la orden ya estaba pagada o con foto. |
| **Eliminar ítem** | — | Libera el sello de su programa; DELETE `sellos`. | WhatsApp `pedido_actualizado`. |
| **Eliminar pedido** | — | Devuelve el link Andreani al pool; DELETE `ordenes` (cascade a sellos, tareas, historial…). | — |
| **Cambiar fabricación** | — | `estado_fabricacion`; `Rehacer` abre [RehacerDialog](rehacer.md). A `Rehacer` → prioritario. | Notificaciones p1 (si cambian tipo/archivo/vector/medida en un sello en curso), p3 (prioridad), v3 (Hecho). |
| **Cambiar venta** | **Solo UI**: habilitado si el ítem está `Hecho`. | `sellos.estado_venta`; si todos los ítems quedan con el mismo valor, también `ordenes.estado_orden`. | — |
| **Cambiar estado de envío** | **Solo UI**: habilitado si la venta está `Transferido`. | `ordenes.estado_envio` (a nivel orden). | `Despachado` + seguimiento → WhatsApp `pedido_enviado` → `Seguimiento Enviado` (trigger + cron). Al pasar a `Seguimiento Enviado` → descuento de stock (DB + TS). |
| **Cambiar empresa/servicio de envío** | — | `empresa_envio`, `tipo_envio`. Salir de Andreani libera el link del pool. | Trigger recalcula `restante` con el costo de envío. |
| **Prioridad** | — | `sellos.es_prioritario`. | Notificación p3. |
| **Subir base / vector** | Vector no SVG → confirmación. | `archivo_base` (limpia vector y error si se reemplaza) / `archivo_vector_preview` + `estado_vectorizacion`. | Medida de fabricación (ver [vectorización](../vectorizacion/medida-de-fabricacion.md)). |
| **Subir foto** | — | `foto_sello`; si venta `Señado`/nula → `'Foto'`. | **Trigger** `trigger_foto_sello_subida` → WhatsApp `pedido_listo` con foto y restante. Ver [fotos-y-seguimientos.md](fotos-y-seguimientos.md). |
| **Subir fotos (masivo)** | Ítems `Hecho` + venta `Señado`/nula + sin foto. | Igual que arriba; fotos sin asignar quedan en `fotos_pendientes`. | Chequea que alcancen los links de Andreani del pool. |
| **Cargar seguimientos** | PDF de etiquetas (Correo o Andreani). | Correo: `seguimiento`, **`Despachado`**, venta → `Transferido`. Andreani: `seguimiento`, empresa Andreani, `Etiqueta Lista` (venta no cambia). | Descarga PDF enriquecido para imprimir. Ver [fotos-y-seguimientos.md](fotos-y-seguimientos.md). |
| **Fecha límite** | — | `sellos.fecha_limite` de **todos** los ítems de la orden. | Cron de vencimientos (p4, l2). |
| **Tareas** | — | `tareas` (`contexto='PEDIDOS'`), post-its globales (`tareas_pedidos_globales`). | — |
| **Hoja de fabricación de abecedario** | Ítem `ABECEDARIO`. | — | PDF generado desde la plantilla `public/abecedario/hoja-fabricacion.pdf`. |
| **Cargo de rehacer cobrado** | Hay cargo. | `sello_rehacer_eventos.cobro_adicional_cobrado`. | Informativo; no suma al restante. |

## Reglas de negocio

Ver [04-business-rules/pedidos-y-venta.md](../../04-business-rules/pedidos-y-venta.md). Claves: BR-PED-001 (orden nace Señado), BR-PED-003 (estado de venta de la orden = el de sus ítems si coinciden), BR-VEN-001 (foto → Foto), BR-VEN-004 (restante = valor − seña + costo de envío), BR-PED-006 (medidas siempre largo × corto).

## Validaciones

- ✅ Formulario (zod): nombre, teléfono, montos, medidas. Advertencia de vector no SVG.
- ✅ DB: CHECKs de estados, tipos, empresa, servicio, canal (`clientes.medio_contacto`), unicidad de `clientes.dni` y `clientes.mail`.
- ⚠️ Las reglas "venta solo si Hecho" y "envío solo si Transferido" son **solo UI** ([06-state-machines](../../06-state-machines/README.md)).

## Perfil de cliente

✅ `ClienteProfileDialog` (`clienteProfile.service.ts`): datos del cliente, historial de órdenes e ítems, direcciones de envío. Accesible desde la celda Cliente.

## Casos límite

- Estado `'Prioridad'` (legado) en `estado_fabricacion`: se muestra como `Sin Hacer` y el servicio evita pisarlo si no se cambia la prioridad explícitamente.
- `estado_venta` nulo se trata como `Señado`.
- `deadlineAt` de la orden se toma del **primer sello en el orden que devuelve la base** (no necesariamente el más antiguo) (`mapOrdenToOrder`).
- El canal elegido en el alta **no se persiste** ([AUD-INC-004](../../audits/inconsistencias.md#aud-inc-004)).
- Solo el envío y la fecha límite del **primer diseño** se usan para la orden.
- `runMigrations()` intenta verificar/crear columnas desde el navegador (legado).

## Implementación relacionada

- `src/app/pedidos/index.tsx`, `src/components/pedidos/**`
- `src/lib/supabase/services/orders.service.ts` (`getOrders`, `createOrder`, `updateOrder`, `addStampToOrder`, `deleteStamp`, `assignPhotoToStamp`, `savePendingPhoto`, `getShippingCost`)
- `src/lib/supabase/mappers.ts` (conversión DB ↔ TS de todos los estados)
- `src/lib/context/OrdersProvider.tsx`, `src/lib/hooks/useOrders.ts`, `src/lib/state/orders.store.ts`
- `src/lib/abecedario/*`, `src/lib/precios/cotizacionMedida.ts` (cotización automática en el alta)
- Documento previo: `info_de_pagina_pedidos.md` (raíz; 2025-11, parcialmente desactualizado)
