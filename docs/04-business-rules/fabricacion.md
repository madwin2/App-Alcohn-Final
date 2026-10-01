# Reglas — Fabricación, vector y medida

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-FAB-001 | Un ítem que pasa a `Rehacer` queda prioritario (`es_prioritario=true`), por cualquier vía. | trigger `sellos_rehacer_auto_prioridad`; también `updateOrder`, `setFabricationStateForProgram`, `registrar_rehacer` | DB |
| BR-FAB-002 | Rehacer desde Pedidos/Producción exige motivo (lista cerrada); "Otro" exige descripción; el cobro adicional debe ser > 0. | `RehacerDialog`, `registrar_rehacer` | UI + DB (motivo) |
| BR-FAB-003 | Rehacer resetea: Aspire, foto (si venta era Foto → Señado), envío de la orden a `Sin envio` sin seguimiento. | `registrar_rehacer` | DB (RPC) |
| BR-FAB-004 | Si un ítem tiene `estado_aspire` y está en `Sin Hacer`/`Rehacer` (sin que se cambie explícitamente el estado), pasa a `Programado`. | trigger `detect_programado_state` | DB |
| BR-FAB-005 | Cada vez que un ítem `SELLO` entra a `Hecho` (desde otro estado) se registra el consumo de bronce (lado mayor + pérdida de corte) y se fija `tipo_planchuela`. | trigger `registrar_bronce_consumo_sello` | DB |
| BR-FAB-006 | Todo cambio de `estado_fabricacion`/`estado_venta`/`estado_vectorizacion` (ítem) y `estado_envio`/`estado_orden` (orden) queda en `estado_historial`. | triggers `trg_estado_historial_*` | DB |
| BR-PROD-001 | Cambiar el estado de fabricación desde Producción limpia `estado_aspire`. | `updateProductionItem` | Servicio |
| BR-PROD-002 | Elegir un estado Aspire desde Producción fuerza `Programado`; quitarlo vuelve a `Sin Hacer` si el ítem no está en un programa. | `updateProductionItem` | Servicio |
| BR-PROD-003 | El programa de un ítem solo se asigna/quita desde Programas (en Producción es solo lectura). | `CellPrograma`, `production.service.ts` | UI/Servicio |
| BR-PROD-004 | Cambios de tipo, archivo base, vector o medida en un ítem "en curso" notifican a Producción (p1). | `selloEnCurso`, `notifySelloModificado` | Servicio |
| BR-VEC-001 | Subir un vector no SVG requiere confirmación explícita ("es importante subir los vectores en SVG"). | `NonSvgVectorConfirmDialog`, `NewOrderDialog` | UI |
| BR-VEC-002 | Reemplazar el archivo base borra el vector y el error, y vuelve la vectorización a `BASE` (o `EN_PROCESO` con auto-vector). | `updateOrder` | Servicio |
| BR-VEC-003 | La base mejorada reemplaza al original para vectorizar y descargar, sin borrar el original. | `baseFileUtil`, `setArchivoBaseMejorado` | Servicio |
| BR-VEC-004 | Solo los vectores generados en modo `production` pueden guardarse en un ítem. | `saveSelloVector` | Servicio |
| BR-VEC-005 | Medida de fabricación: si el lado menor **pedido** supera el tope de su planchuela (12→11,5; 19→18; 25→24; 38→36,5 mm), el lado menor del vector se lleva al tope y el otro por proporción; se guarda sin popup salvo que el lado largo se desvíe ≥6 mm de lo pedido (decisión 2026-10-01). Si lo pedido ya entra en el tope, se guarda lo medido si no hay desvío ≥6 mm; si no, se pide confirmación conservando proporción. | `resolveFabricationSize`, `scaleMinorSideToTope` | Servicio |
| BR-VEC-006 | Al confirmar un vector de Vectorización se escala al tamaño pedido antes de guardarlo. | `applyPhysicalSize` | Servicio |
