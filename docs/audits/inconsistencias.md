# Auditoría — Inconsistencias

Hallazgos detectados durante la documentación (2026-09-27). **No se corrigió nada.** Cada ítem indica evidencia e impacto. Para decidir qué hacer, abrir una tarea y, si hay regla de negocio en juego, responder primero la pregunta vinculada.

<a id="aud-inc-001"></a>

### AUD-INC-001 · `estado_orden` mezcla venta, fabricación y envío
- **Evidencia**: CHECK de `ordenes.estado_orden` admite `Hecho`, `Hacer Etiqueta`, `Etiqueta Lista`, `Despachado`, `Seguimiento Enviado`; 2.048 órdenes tienen `Seguimiento Enviado`. La app solo escribe estados de venta.
- **Impacto**: reportes y vistas que filtran `estado_orden='Transferido'` (p. ej. recompra) excluyen órdenes históricas pagadas.

<a id="aud-inc-002"></a>

### AUD-INC-002 · Estado `'Prioridad'` legado
- **Evidencia**: 4 sellos; mappers lo convierten a `SIN_HACER`; `ELIGIBLE_FAB_STATES` y `fetchPendientes` lo incluyen; `updateOrder` tiene lógica especial para no pisarlo.

<a id="aud-inc-003"></a>

### AUD-INC-003 · Vocabulario de Producción con pérdida
- **Evidencia**: `mapToProductionState` (service) mapea `Retocar → EN_PROGRESO`; `CellFabricacionAspire` mapea `RETOCAR → REVISAR`. `Programado`/`Prioridad` → `PENDIENTE`; guardar escribe `Sin Hacer`.
- **Impacto**: un cambio en Producción puede transformar `Programado` en `Sin Hacer` sin sacar el sello del programa (ver AUD-INC-007).

<a id="aud-inc-004"></a>

### AUD-INC-004 · El canal de contacto del alta no se guarda
- **Evidencia**: `mapCustomerToCliente` fija `medio_contacto` en `Whatsapp` si hay teléfono; el canal elegido solo se pasa a `mapOrderItemToSello`, que no lo usa. Además, al reutilizar un cliente existente se sobreescribe su canal.
- **Pregunta**: [Q-PED-002](../14-open-questions/pedidos.md#q-ped-002).

<a id="aud-inc-005"></a>

### AUD-INC-005 · Tres fuentes para el costo de envío
- **Evidencia**: `costos_de_envio` (DB, usado en `restante`); variables `COSTO_ENVIO_SUCURSAL/DOMICILIO` con defaults 6.000/9.000 en `webhook-bot`; `getShippingCost` en TS. Regla "envío gratis con ≥3 sellos" solo en `webhook-bot`.
- **Impacto**: el monto del WhatsApp puede no coincidir con `ordenes.restante` y con Economía.

<a id="aud-inc-006"></a>

### AUD-INC-006 · "Despachado" en distinto momento según empresa — **no es un problema**
- Confirmado por el equipo (Q-ENV-001): la diferencia es operativa e intencional. Ver [BR-ENV-007](../04-business-rules/envios.md).

<a id="aud-inc-007"></a>

### AUD-INC-007 · Sellos en programa con estado que no es "Programado"
- **Evidencia**: `updateProductionItem` permite pasar a PENDIENTE (`Sin Hacer`) y limpia `estado_aspire`, pero no toca `programa_id`.
- **Impacto**: el sello sigue en la hoja del programa pero figura como pendiente; no aparece en el panel de Vectores (tiene programa).

<a id="aud-inc-008"></a>

### AUD-INC-008 · Trigger `mark_programa_dirty_on_sello_relevant_update` demasiado amplio
- **Evidencia**: se dispara ante **cualquier** UPDATE de un sello que sigue en el mismo programa (incluidos cambios de estado de fabricación, notas, foto).
- **Impacto**: marcar `Haciendo` un programa `LISTO` lo pasa a `BORRADOR` y `dirty=true` en la base (la UI lo tapa con el estado derivado, pero `dirty` puede mostrar "desactualizado" sin cambios de contenido).

<a id="aud-inc-009"></a>

### AUD-INC-009 · `update_programa_cantidad` al mover sellos entre programas
- **Evidencia**: usa `COALESCE(NEW.programa_id, OLD.programa_id)`: al mover de A a B solo recuenta B. (La app recalcula por su cuenta en `recalculateAndPersistLengths`, pero el edge `programa-sync` depende de `refreshProgramStampCount`.)

<a id="aud-inc-010"></a>

### AUD-INC-010 · Evento `ASPIRE_DESCARGADO` no permitido
- **Evidencia**: `downloadProgramAspireFile` registra `ASPIRE_DESCARGADO`; el CHECK de `programa_eventos.tipo` no lo incluye → el insert falla y solo se loguea en consola.

<a id="aud-inc-011"></a>

### AUD-INC-011 · Largo máximo de planchuela en tres lugares
- **Evidencia**: `fabricacion_parametros.params.largoMaximoPlanchuelaMm_*`; `LARGO_MAXIMO_PLANCHUELA_MM` en `material.ts`; `LARGO_MAXIMO_MM` hardcodeado en la edge `programa-sync`. Guardar parámetros desde Gastos (`variableCostsToParamsJson`) **no conserva** las claves de largo máximo.
- **Impacto**: si se cambia el largo en la base, el gadget sigue recibiendo el valor hardcodeado; un guardado desde Gastos lo borra.

<a id="aud-inc-012"></a>

### AUD-INC-012 · Rehacer por dos caminos con efectos distintos
- **Evidencia**: `RehacerDialog` → RPC con motivo, snapshot, reset de foto/venta/envío y WhatsApp; menú del programa y `DoneReviewDialog` → solo `estado_fabricacion='Rehacer'` + prioridad.
- **Impacto**: rehacer desde Programas no deja historial ni resetea envío/foto.

<a id="aud-inc-013"></a>

### AUD-INC-013 · Sellos rehechos siguen atados a su programa
- **Evidencia**: `registrar_rehacer` no limpia `programa_id`; `getEligibleStamps` exigía `programa_id IS NULL`.
- **Impacto**: el sello no volvía al panel de Vectores; el programa original lo seguía conteniendo. [Q-PROG-009](../14-open-questions/programas.md#q-prog-009).
- **Estado**: resuelta (2026-10-29) — elegibles incluyen `Rehacer` con `programa_id`; al agregar a un programa nuevo se transfiere y queda `SELLO_QUITADO` con `reason=transfer_rehacer` en el programa viejo (POL-017 / B-07).

<a id="aud-inc-014"></a>

### AUD-INC-014 · BOM de stock duplicada (TS y SQL)
- **Evidencia**: `requirementsForOrderItem` y `consume_stock_for_order` (el propio SQL dice "mismo criterio que TS"). Descuento disparado por trigger y por TS.
- **Impacto**: si cambia la BOM hay que tocar ambos.
- **Estado**: resuelta (2026-10-01) — BOM única en SQL (`stock_bom_for_item`); se eliminó el consumo TS desde Pedidos.

<a id="aud-inc-015"></a>

### AUD-INC-015 · Ajustes de stock sin movimiento
- **Evidencia**: `setStockQuantity` actualiza la cantidad sin insertar `ADJUSTMENT`.
- **Estado**: resuelta (2026-10-01) — reemplazado por RPC `adjust_stock_count` (conteo físico con movimiento `ADJUSTMENT`).

<a id="aud-inc-016"></a>

### AUD-INC-016 · Ruta de reseteo de contraseña inexistente
- **Evidencia**: `resetPassword` redirige a `/reset-password`; no hay ruta en `App.tsx`.

<a id="aud-inc-017"></a>

### AUD-INC-017 · Etiqueta Andreani por dos caminos
- **Evidencia**: RPC `asignar_etiqueta_andreani` exige link asignado y tracking único; "Cargar seguimientos" con PDF de Andreani en Pedidos escribe `seguimiento` + `Etiqueta Lista` sin esas validaciones.

<a id="aud-inc-018"></a>

### AUD-INC-018 · Método de origen del envío no se persiste
- **Evidencia**: el formulario tiene "Retiro en origen / Entrega en sucursal" (`ShippingOriginMethod`); `mapOrderToOrden` lo ignora; al leer se deriva de `tipo_envio` con una lógica que no coincide.

<a id="aud-inc-019"></a>

### AUD-INC-019 · "Otro" se guarda como "Retiro"
- **Evidencia**: `mapShippingCarrierToDB('OTRO') = 'Retiro'`; existen `Retiro` (15) y `Retiro en Persona` (3); `Retiro en Persona` no entra a Envíos pero `Retiro` (OTRO) sí.

<a id="aud-inc-020"></a>

### AUD-INC-020 · Mappers de estados duplicados
- **Evidencia**: `mappers.ts`, `programs.service.ts` (acepta `Verificado`), `production.service.ts`, `CellFabricacionAspire.tsx`, edge functions y workers repiten mapeos.

<a id="aud-inc-021"></a>

### AUD-INC-021 · Fecha límite de la orden tomada del primer sello sin ordenar
- **Evidencia**: `mapOrdenToOrder` usa `sellos[0]` del arreglo original (no el ordenado); los ítems pueden tener fechas distintas si se editaron desde Producción.

<a id="aud-inc-022"></a>

### AUD-INC-022 · Reglas de transición solo en la UI
- **Evidencia**: "venta solo si Hecho" (`CellVenta`), "envío solo si Transferido" (`CellEnvioEstado`), menú de Economía; la base no lo impide.

<a id="aud-inc-023"></a>

### AUD-INC-023 · `fecha` de sellos creados por la web
- **Evidencia**: `confirm-web-order` no envía `fecha`; el default de la columna es `CURRENT_DATE` en UTC (la app usa fecha argentina). Entre 21:00 y 24:00 AR la fecha queda un día adelantada.

<a id="aud-inc-024"></a>

### AUD-INC-024 · `ordenes.origen='App'` nunca se escribe
- **Evidencia**: 3.500 órdenes con `origen` nulo; el CHECK admite `App`.

<a id="aud-inc-025"></a>

### AUD-INC-025 · Guardas de arquitectura incumplidas
- **Evidencia**: `ARCHITECTURE_GUARDRAILS.md` pide archivos ≤250 líneas; `app/envios/index.tsx` 2.220, `ProgramCardDesign.tsx` 2.410, `programs.service.ts` 2.038, `orders.service.ts` 1.913, etc.

<a id="aud-inc-026"></a>

### AUD-INC-026 · RLS: DELETE/UPDATE “silencioso” (0 filas, sin error)
- **Origen**: [EQ-R03](../../REVISION_EQUIPO_LOGICA_DE_USO.md#eq-r03--acciones-que-funcionan-pero-no-hicieron-nada-rls-filtra-en-silencio) (revisión Mi perfil / Equipo, 2026-10-05).
- **Evidencia**: Con RLS, un `DELETE` o `UPDATE` sobre filas no permitidas **no falla**: PostgREST devuelve éxito con 0 filas afectadas. Varios servicios mostraban toast “Borrado” y la UI quitaba el ítem igual. Los `.update().select().single()` fallan con `PGRST116` (mensaje críptico).
- **Alcance**: confirmado en `equipo*.service.ts`; **probable** en otros módulos con el mismo patrón (`tareas_dashboard`, innovación, etc.).
- **Mitigación en curso**: helper `asegurarFilaAfectada` + `.select('id')` en writes del equipo; mapear `PGRST116` a mensaje legible; no optimizar la UI hasta confirmar en servidor.
- **Impacto**: el usuario cree que borró o cambió algo y no ocurrió; datos inconsistentes con lo mostrado.

<a id="aud-inc-027"></a>

### AUD-INC-027 · Cambiar el tipo en una fila expandida cambia todos los sellos del pedido
- **Evidencia** (2026-10-22): la fila expandida de Pedidos arma `{ ...order, items: [item] }`, pero `CellTipo` llama `onTipoChange(order.id, tipo)` sin `itemId`. Entonces `OrdersTable.handleTipoChange` busca el pedido real y actualiza **todos** sus ítems. El tipo Personalizado nuevo no tiene este problema: aplica a los ítems de la fila.
- **Impacto**: en un pedido con varios sellos, cambiar el tipo de uno solo los cambia a todos. No se corrigió de paso (AGENTS §4).

<a id="aud-inc-028"></a>

### AUD-INC-028 · En Vercel, abrir una ruta directo (o recargar) da 404
- **Evidencia** (2026-10-27): `GET https://app-alcohn-final.vercel.app/pedidos` responde 404; `/` responde 200. No hay `vercel.json` con la regla de SPA, así que solo funciona entrar por la raíz y navegar.
- **Alcance**: todas las rutas de React Router. `/extension/*` sí tiene la regla (necesaria para la ventana de la extensión de WhatsApp).
- **Impacto**: recargar la página en cualquier pantalla que no sea Inicio muestra 404. No se corrigió de paso (AGENTS §4): la regla general sería `/((?!api/).*)` → `/index.html`.

<a id="aud-inc-029"></a>

### AUD-INC-029 · Reasignar un link Andreani vencido no mira si el cliente ya lo completó
- **Evidencia** (2026-10-27): `asignar_link_andreani` reutiliza el link asignado solo si tiene ≤30 h; si tiene más, lo marca `descartado` y toma uno nuevo del pool, aunque el cliente ya lo haya completado y pagado (ahora se sabe por `envios_andreani_links.usado_en`).
- **Impacto**: si se vuelve a mandar la foto (o se reasigna) más de 30 h después, el cliente puede recibir un link nuevo y pagar el envío dos veces. No se corrigió de paso (AGENTS §4); posible arreglo: si `usado_en` no es NULL, devolver el mismo link.

<a id="aud-inc-030"></a>

### AUD-INC-030 · `npm run lint` no corre
- **Evidencia** (2026-10-27): `.eslintrc.cjs` extiende `'@typescript-eslint/recommended'`; ESLint 8.57 responde "couldn't find the config". El nombre válido es `'plugin:@typescript-eslint/recommended'`.
- **Impacto**: el lint de AGENTS §3 no se puede correr; los cambios se validan solo con `typecheck` y `test` (y `typecheck` ya tiene errores previos en archivos de Pedidos/Producción). No se corrigió de paso.
