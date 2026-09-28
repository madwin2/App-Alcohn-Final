# Envíos

> Rutas: `/envios` (selector), `/envios/todos`, `/envios/correo`, `/envios/andreani`, `/envios/via-cargo`, `/envios/historial` · Página: `src/app/envios/index.tsx` (≈2.200 líneas) · Componentes: `src/components/envios/*`
> Workflows: [WF-06 Correo Argentino](../../03-workflows/WF-06-envio-correo-argentino.md), [WF-07 Andreani](../../03-workflows/WF-07-envio-andreani.md) · Integraciones: [MiCorreo](../../07-integrations/micorreo.md), [Andreani](../../07-integrations/andreani.md)
> Subdocumentos: [historial.md](historial.md) · [padron-y-datos-de-envio.md](padron-y-datos-de-envio.md)

## Propósito

✅ Cola de trabajo **post-fabricación** de logística: tomar las órdenes listas para despachar, conseguir y validar los datos de destino, generar/pagar la etiqueta con el transportista y dejar la orden lista para cargar el seguimiento.

## Usuarios

🔶 Logística. Las notificaciones de despachos próximos/vencidos (l2) y dirección cambiada después de la etiqueta (l1) van al área `logistica`.

## Qué órdenes entran (✅ `isEligibleForShipping`)

Todas estas condiciones:
1. Tiene ítems y **todos** están `Hecho`.
2. La empresa **no** es `Retiro en Persona`.
3. Ni la orden ni ningún ítem está en `Deudor`.
4. El envío **no** está en `Seguimiento Enviado`.

Fuente: las órdenes del `OrdersProvider` (últimos 6 meses + viejas con envío abierto).

## Colas (secciones)

| Sección | Criterio | Flujo |
|---|---|---|
| **Correo Argentino – Con datos** | Empresa ≠ Andreani/Vía Cargo (incluye **sin empresa**) y tiene `direccion_id` | Revisar/editar datos, estado de etiqueta MiCorreo, reintentar, CSV manual |
| **Correo Argentino – Pendientes de datos** | Ídem, sin dirección, y **todos** los ítems en `Foto` o `Transferido` | Cargar datos de envío |
| **Andreani** | Empresa Andreani | Pool de links + panel de etiquetas ([andreani](../../07-integrations/andreani.md)) |
| **Vía Cargo** | Empresa Vía Cargo | Solo listado (sin automatización) ❓ [Q-ENV-004](../../14-open-questions/envios.md#q-env-004) |

Contadores por empresa en el header (`EnviosHeader`, `EnviosHub`). Changelog #5: se elige la cola al entrar; secciones vacías plegadas.

⚠️ Una orden **sin empresa de envío** cae en la cola de Correo. ❓ [Q-ENV-003](../../14-open-questions/envios.md#q-env-003).

## Acciones principales

| Acción | Efecto | Detalle |
|---|---|---|
| **Cargar/editar datos de envío** | INSERT `direcciones` (nunca actualiza la anterior), `ordenes.direccion_id`, `tipo_envio`, auditoría (`envio_datos_cargado_por/at`, `envio_datos_editado`), email en `clientes.mail`. **Pasa la orden y todos los ítems a `Transferido`**. Dispara la subida a MiCorreo. | [padron-y-datos-de-envio.md](padron-y-datos-de-envio.md) |
| **Subida a MiCorreo** (automática, en segundo plano) | Cola **en la pestaña del navegador**; marca `micorreo_subiendo_at`; `etiqueta_estado` `generando` → `generada`/`pagada`/`error`; `estado_envio` `Hacer Etiqueta` → `Etiqueta Lista` / `Error de Etiqueta`. | [WF-06](../../03-workflows/WF-06-envio-correo-argentino.md) |
| **Generar CSV** (manual, respaldo) | Solo órdenes Correo con dirección en `Hacer Etiqueta`. Descarga `carga_correo_AAAA-MM-DD.csv` (formato de carga masiva MiCorreo, separador `;`). Las que no generan fila válida pasan a `Error de Etiqueta`. Evento `csv_generado`. | `correoArgentinoCsv.ts` |
| **Cambiar Domicilio/Sucursal** | `tipo_envio`. | — |
| **Cambiar estado de envío** | `estado_envio` manual. | Mismos efectos en cadena que en Pedidos. |
| **Quitar datos de envío** | `direccion_id = NULL`. | — |
| **Reiniciar "Sin envío"** (masivo) | Todas las órdenes de la tabla vuelven a `Sin envio` ("si hubo error en el CSV"). | — |
| **Copiar teléfono** | Portapapeles. | 🔶 Para contactar al cliente por fuera. |
| **Andreani**: generar links, traer etiquetas, actualizar seguimientos, asignar/liberar/marcar errónea, descargar PDF unido (100×152) | Ver [07-integrations/andreani.md](../../07-integrations/andreani.md). | `AndreaniPoolCard`, `AndreaniLabelsPanel` |

## Pedidos web

✅ Una orden web con dirección cargada desde el checkout pero **sin** `envio_datos_cargado_at` se marca como "pendiente de confirmación de datos" (`isWebPendingShippingConfirmation`): los datos los cargó el cliente y el equipo aún no los confirmó.

## Reglas

Ver [04-business-rules/envios.md](../../04-business-rules/envios.md): elegibilidad (BR-ENV-001), nueva dirección y auditoría (BR-ENV-003), validación contra padrón (BR-ENV-004), Andreani solo descarga con Transferido (BR-AND-004), significado de "Despachado" por empresa (BR-ENV-007). Guardar datos = Transferido está en [pedidos-y-venta](../../04-business-rules/pedidos-y-venta.md) (BR-VEN-005).

## Estados

`estado_envio` y `etiqueta_estado`: ver [06-state-machines/envio.md](../../06-state-machines/envio.md).

## Fronteras

[FR-07 impresión y despacho Correo](../../10-operational-boundaries/README.md#fr-07) · [FR-08 Andreani](../../10-operational-boundaries/README.md#fr-08) · [FR-09 pedir datos al cliente](../../10-operational-boundaries/README.md#fr-09).

## Implementación relacionada

`src/app/envios/index.tsx`, `src/components/envios/{EnviosHub,EnviosHeader,AndreaniPoolCard,AndreaniLabelsPanel,EnviosHistorialTable,EnviosHistorialDetailDialog}.tsx`, `src/lib/utils/{micorreoBackgroundUpload,micorreoUpload,correoArgentinoCsv,correoCsvPackageFromOrder,correoSucursalesPadron,correoSucursalesCatalogCache,enviosAddressCatalog,enviosSucursalSnap,shippingNormalization,parseShippingText,enviosEmail}.ts`, `api/parse-shipping.js`, `api/micorreo-upload.js`, `src/lib/supabase/services/{andreani,andreaniEtiquetas,enviosHistorial,enviosHistorialTabla}.service.ts`. Documentos previos: `PROPUESTA_PAGINA_ENVIOS_CORREO.md`, `PLAN_MEJORAS_ENVIOS_PEDIDOS_PRODUCCION.md`, `PLAN_TABLA_HISTORIAL_ENVIOS.md`, `GUIA_CURSOR_ANDREANI_LINKS.md`, `PROPUESTA_AUTOMATIZACION_ANDREANI.md`.
