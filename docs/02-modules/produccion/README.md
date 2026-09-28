# Producción

> Ruta: `/produccion` · Página: `src/app/produccion/index.tsx` · Servicio: `src/lib/supabase/services/production.service.ts` · Hook: `src/lib/hooks/useProduction.ts` · Store: `src/lib/state/production.store.ts`

## Propósito

✅ Vista **por ítem** (una fila por `sellos`) orientada al taller: qué hay que fabricar, con qué archivos, medidas, prioridad, fecha límite, estado de vectorización, programa y máquina. Permite cambiar el estado de fabricación, subir/descargar base y vector, confirmar medidas de fabricación, marcar prioridad, tareas y notas.

Diferencia con Pedidos: Pedidos agrupa por orden y mira venta/envío; Producción lista ítems y mira fabricación. Diferencia con Programas: Producción **no** asigna programas (columna solo lectura desde el 2026-09-22).

## Usuarios

🔶 Producción/diseño. Sin restricción en código.

## Qué ítems muestra

✅ **Todos** los `sellos` de la base (sin filtro de fecha), unidos a su orden y cliente, excepto los de órdenes web no pagadas. Incluye tareas con `contexto='PRODUCCION'`. Filtros y orden en el cliente (`ProductionFiltersDialog`, `ProductionSorterDialog`, chips por estado, buscador por diseño/cliente/teléfono).

## Estados (vocabulario propio)

✅ Producción usa un vocabulario **distinto** al de fabricación (`ProductionState`), con mapeo con pérdida:

| `estado_fabricacion` (DB) | Producción muestra | Al guardar desde Producción se escribe |
|---|---|---|
| `Sin Hacer`, `Programado`, `Prioridad` | PENDIENTE | `Sin Hacer` |
| `Haciendo` | EN_PROGRESO | `Haciendo` |
| `Retocar` | EN_PROGRESO (servicio) / REVISAR (celda) | — (no se puede elegir) |
| `Verificar` | REVISAR | `Verificar` |
| `Hecho` | COMPLETADO | `Hecho` |
| `Rehacer` | REHACER | `Rehacer` (abre diálogo de motivo) |

⚠️ Elegir PENDIENTE sobre un sello `Programado` lo escribe como `Sin Hacer` y **limpia `estado_aspire`**, pero el sello sigue con `programa_id` (queda asociado al programa en otro estado). Ver [AUD-INC-007](../../audits/inconsistencias.md#aud-inc-007).

## Columnas y acciones

| Columna | Acción | Efecto |
|---|---|---|
| Tarea / uploader | Tareas por orden (`tareas` contexto PRODUCCION); quién cargó el pedido | — |
| Fecha / Fecha límite | Editar fecha límite | `sellos.fecha_limite` (solo ese ítem) |
| Tipo, Diseño, múltiples ítems | Ver; info del pedido (`OrderInfoDialog`); hoja de abecedario | — |
| Medida | Ver pedido vs fabricación (largo × corto) | — |
| Notas | Editar | `sellos.nota` |
| Prioridad | Toggle | `es_prioritario` + notificación p3 |
| **Fabricación + Aspire** (`CellFabricacionAspire`) | Cambiar estado; elegir estado Aspire manual (`Aspire G/C/XL` y `… Check`) | Cambiar fabricación → limpia Aspire. Elegir Aspire → fuerza `Programado`. Quitar Aspire → `Sin Hacer` si no está en un programa. |
| Vectorizado | Cambiar `estado_vectorizacion` a mano | — |
| Programa | **Solo lectura**; chip navega a Programas si hay `programa_id`; texto gris = programa histórico sin vínculo | — |
| Máquina | Ver | — |
| Archivo base | Descargar (usa base mejorada si existe) | — |
| Vector | Subir (advertencia si no es SVG; EPS genera preview), descargar, borrar | SVG → cálculo de medida de fabricación ([medida-de-fabricacion.md](../vectorizacion/medida-de-fabricacion.md)) |

Alertas en la fila del diseño: `motivo_salida_programa` (p. ej. salió por falta de material) y `no_importado_motivo` (no entró al Aspire).

## Reglas

- BR-PROD-001 Cambiar el estado de fabricación desde Producción limpia `estado_aspire` (comentario: "Aspire solo aplica cuando está Programado").
- BR-PROD-002 Poner un estado Aspire fuerza `Programado` (también por trigger `detect_programado_state` si el sello estaba `Sin Hacer`/`Rehacer`).
- BR-PROD-003 El programa se asigna solo en Programas.
Ver [04-business-rules/fabricacion.md](../../04-business-rules/fabricacion.md).

## Legado: estado Aspire manual

🔶 Antes del módulo Programas (2026-09), el estado `Aspire G/C/XL` (y `Check`) se marcaba a mano para indicar en qué máquina se programó el sello y si se verificó. Hoy lo escribe Programas automáticamente, pero la edición manual sigue disponible en Producción. ✅ Confirmado: ya no se usa a mano; lo hace Programas (Q-PROD-003). Candidato a quitar de la UI.

## Verificación

✅ En la barra lateral hay un ítem **"Verificación"** deshabilitado (`/verificacion`), sin ruta ni código. Existe el estado de fabricación `Verificar` (1 sello en la base) y el flag `programa.verificado`. ✅ Por ahora no hay proceso ni módulo de Verificación (Q-PROD-006). `Verificar` = Producción duda y lo chequea Ventas; `Retocar` = detalle corregible.

## Rendimiento (observación)

`updateProductionItem` vuelve a cargar **todos** los ítems de producción en cada guardado para leer el estado actual ([AUD-ARQ-006](../../audits/observaciones-de-arquitectura.md#aud-arq-006)).

## Implementación relacionada

`src/app/produccion/index.tsx`, `src/components/produccion/Table/ProductionTable.tsx`, `columns.tsx`, `cells/CellFabricacionAspire.tsx`, `cells/CellVector.tsx`, `cells/CellPrograma.tsx`, `src/lib/supabase/services/production.service.ts`.
