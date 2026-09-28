# Estados y máquinas de estado

## Principio clave para agentes

> **La base de datos valida los valores posibles (CHECK), pero casi nunca las transiciones.** Salvo los pocos casos marcados como "DB", cualquier cliente autenticado puede pasar cualquier estado a cualquier otro. Las transiciones "válidas" de abajo son las que **produce** el sistema; las "inválidas" son las que la UI evita pero la base acepta.

## Mapa de estados

| Máquina | Entidad.campo | Doc |
|---|---|---|
| Fabricación | `sellos.estado_fabricacion` (+ `es_prioritario`, `estado_fabricacion_previo`) | [fabricacion.md](fabricacion.md) |
| Venta | `sellos.estado_venta`, `ordenes.estado_orden` | [venta.md](venta.md) |
| Envío | `ordenes.estado_envio` (+ `etiqueta_estado`, `micorreo_subiendo_at`) | [envio.md](envio.md) |
| Vectorización | `sellos.estado_vectorizacion` | [vectorizacion.md](vectorizacion.md) |
| Aspire (sello) | `sellos.estado_aspire` | [fabricacion.md](fabricacion.md#estado-aspire) |
| Programa | `programa.estado_programa` (+ `bloqueado`, `dirty`, `verificado`) | [programa.md](programa.md) |
| Pago web | `ordenes.estado_pago_web` | [pago-web.md](pago-web.md) |
| Andreani | `envios_andreani_links.estado`, `envios_andreani_etiquetas.estado` | [andreani.md](andreani.md) |
| Mockup | `mockup_solicitudes.estado` | [../02-modules/mockups](../02-modules/mockups/README.md#flujo-) |
| Registro de usuario | `solicitudes_registro.estado` (`PENDIENTE`→`APROBADO`/`RECHAZADO`) | [../02-modules/configuracion-usuarios](../02-modules/configuracion-usuarios/README.md) |
| Vector job | `vector_jobs.estado` (`PENDING`→`PROCESSING`→`DONE`/`ERROR`) | [../07-integrations/vector-worker.md](../07-integrations/vector-worker.md) |
| Tarea | `tareas.estado` (`PENDING`,`IN_PROGRESS`,`COMPLETED`) | — |
| Innovación | proyectos/tareas (`Pendiente`…`Cancelado`) | [../02-modules/innovacion](../02-modules/innovacion/README.md) |
| Webhook | `webhook_logs.success` (`NULL`→`true`/`false`, reintentos ≤3) | [../08-automations/cron.md](../08-automations/cron.md) |

## Combinación de estados de un ítem a lo largo del ciclo

| Momento | Fabricación | Vector | Venta | Envío (orden) |
|---|---|---|---|---|
| Recién cargado | Sin Hacer | BASE | Señado | Sin envío |
| Vectorizado | Sin Hacer | VECTORIZADO | Señado | Sin envío |
| En programa | Programado | VECTORIZADO | Señado | Sin envío |
| Mecanizando | Haciendo | VECTORIZADO | Señado | Sin envío |
| Terminado | Hecho | VECTORIZADO | Señado | Sin envío |
| Foto enviada | Hecho | VECTORIZADO | Foto | Sin envío |
| Pagado + datos | Hecho | VECTORIZADO | Transferido | Hacer Etiqueta → Etiqueta Lista |
| Despachado | Hecho | VECTORIZADO | Transferido | Despachado → Seguimiento Enviado |
| Moroso | Hecho | VECTORIZADO | Deudor | (no entra a Envíos) |
