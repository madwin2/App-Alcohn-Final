# Programas

> Ruta: `/programas` · Página: `src/app/programas/index.tsx` · Servicio: `src/lib/supabase/services/programs.service.ts`
> Reglas puras: `src/lib/programas/*` (material, elegibilidad, ciclo de vida, nombre, paquete, parser `.crv3d`)
> Integración con Aspire: [gadget-aspire.md](gadget-aspire.md) · Estados: [06-state-machines/programa.md](../../06-state-machines/programa.md) · Workflow: [WF-04](../../03-workflows/WF-04-programa-y-fabricacion-cnc.md)
> Verificado contra código al 2026-09-27 (commit `aa0604d`). Módulo nuevo: primer commit 2026-09-05; 4 programas en la base.

## Propósito

✅ Un **programa** es un **lote de sellos que se mecanizan juntos en una máquina CNC** en una corrida de Vectric Aspire. Alcohn AI lo usa para:

1. Elegir qué sellos (ya vectorizados) se fabrican y en qué máquina.
2. Controlar que entren en las planchuelas de bronce de esa máquina (largo máximo por planchuela).
3. Generar el material para Aspire (vectores + `manifest.lua` + archivo base `.crv3d`) o dejar que el gadget de Aspire lo baje solo.
4. Saber qué se armó **realmente** en Aspire (reporte del gadget / parseo del `.crv3d`) y detectar divergencias (sellos que no entraron, que se sacaron por falta de material, que cayeron en otra planchuela).
5. Marcar el avance de fabricación de todos los sellos del lote de una vez.

🔶 Existe porque el armado de la corrida en Aspire era manual y el programa real divergía de lo que la app creía (ver `PLAN_PROGRAMAS_FASE_3.md` §0 y §1.4, donde se documenta un programa con 7 sellos en la app y 6 en Aspire).

## Usuarios

✅ **Fede** (operario): arma los programas, corre el gadget en la PC de cada CNC (dos PCs, dos CNC) y marca los estados. Criterio de armado: prioritarios → más viejos → aprovechar la planchuela; un programa por día por máquina (POL-014, POL-015).

## Conceptos principales

| Concepto | Definición | Dónde |
|---|---|---|
| Programa | Fila de `programa`. Nombre automático `"D MMM xN M"` (p. ej. `17 SEP x7 C`). | [05-data/entidades/programa.md](../../05-data/entidades/programa.md) |
| Sello del programa | Fila de `sellos` con `programa_id` apuntando al programa. | [05-data/entidades/sello.md](../../05-data/entidades/sello.md) |
| Máquina | `C` (Chica), `G` (Grande), `XL`, `ABC`. | [01-product](../../01-product/README.md#23-máquinas-cnc-) |
| Planchuela | Barra de bronce 12/19/25/38/63 mm; se elige por el lado menor del sello. | [01-product](../../01-product/README.md#24-planchuela) |
| Carga | Largo usado por planchuela ÷ largo máximo de la máquina. | `computeProgramLoad` |
| Paquete | ZIP con vectores `NNN_<sello_id>.<ext>`, `manifest.lua` y el `.crv3d` base de la máquina. | `src/lib/programas/packageZip.ts` |
| Archivo base | `.crv3d` de plantilla por máquina (`programa_archivos_base`). | [gadget-aspire.md](gadget-aspire.md) |
| Aspire / `.crv3d` | Archivo de Vectric Aspire con el programa armado; se sube a Alcohn AI. | [07-integrations/aspire.md](../../07-integrations/aspire.md) |
| Sincronización | Comparar lo que dice el `.crv3d`/gadget contra los sellos asignados. | `syncProgramFromAspireFile`, edge `programa-sync` |
| `dirty` | "Cambió después de generar el paquete". | columna `programa.dirty` |
| Candado (`bloqueado`) | Bloqueo manual que impide agregar/quitar sellos y borrar. | `lockProgram` |
| Verificado | Flag histórico; cascada a `estado_aspire = 'Aspire X Check'`. 🔶 Casi en desuso en la UI nueva. | `updateProgram` |

## UI

✅ Dos vistas (store `programs.store.ts`, `viewMode`):

### Vista tablero (por defecto, "tarjetero")
- **Tres columnas** Chica / Grande / XL con los programas no finalizados de cada máquina como "hojas en bolsillos". Los programas `ABC` quedan fuera de las columnas.
- **Panel lateral "Vectores"** (`ProgramsSidePanel`): sellos elegibles sin programa, con badges de nota, prioridad (rojo) y máquinas donde entran. Se arrastran:
  - sobre un programa → se agregan;
  - sobre un bolsillo vacío → se crea un programa nuevo con ese sello (fecha de hoy, nombre automático).
- **Carpeta "Terminados"**: soltar un programa ahí = marcar **todos** sus sellos `Hecho`. Click abre el fichero de programas finalizados (`FinishedProgramsBrowse`).
- **Papelera**: soltar un programa = borrar (pide confirmación y qué estado devolverles a los sellos). Bloqueado si el programa tiene candado.
- **Hoja abierta** (`ProgramCardDesign`, formato A4): fecha, preview 2D del `.crv3d`, estado ("Borrador", "Listo para Fabricar", "En fabricación", "Finalizado", candado), alertas, lista de diseños (quitar con ✕, nota con "!", medida en hover), carga por planchuela, botón **+** para agregar desde un selector en línea (`HojaInlineStampPicker`: búsqueda, filtro por tipo y planchuela, botón **Sugerir**), botón **Descargar** (baja el Aspire subido si existe; si no, genera el paquete), candado.
- **Menú contextual** (clic derecho): Eliminar, Haciendo, Rehacer, Hecho.
- **Onboarding**: `ProgramasTourDialog` (textos en `src/lib/programas/onboarding.ts`).

### Vista lista (se elige en el diálogo de orden)
- Usa el componente anterior `ProgramCard`. ✅ Es el **único lugar** donde están: subir un `.crv3d` a mano y conciliar (`SyncReconcileDialog`), revisar "Hecho" sello por sello (`DoneReviewDialog`: Hecho/Retocar/Rehacer) y el diálogo clásico de selección de sellos. Ver [AUD-DEAD-003](../../audits/posible-codigo-muerto.md#aud-dead-003).

### Otros
- **Archivos base por máquina** (`ProgramBaseFilesUpload`, arriba de la página): subir/reemplazar el `.crv3d` base y el gadget `.lua` de cada máquina.
- **Filtros y orden** (`ProgramsFiltersDialog`, `ProgramsSorterDialog`).
- **Nuevo programa** (`NewProgramDialog`): nombre (autogenerado), máquina, fecha, descripción, selección de sellos.

## Flujo típico

1. Entrar a `/programas`. El panel Vectores muestra lo fabricable, primero prioritarios y luego por fecha de pedido más vieja.
2. Arrastrar sellos a un bolsillo vacío de la máquina (crea el programa) o a un programa existente. Alternativa: abrir la hoja → **+** → **Sugerir** (arma por prioridad y antigüedad hasta llenar las planchuelas).
3. Correr el gadget en Aspire (baja el programa solo) o **Descargar** el paquete. Ver [gadget-aspire.md](gadget-aspire.md).
4. El gadget reporta y sube el `.crv3d`: la hoja queda **Listo para Fabricar**, con preview y alertas si algo no entró.
5. Se fabrica fuera de Alcohn AI: trayectorias por pendrive a la CNC, Haciendo al dejarla corriendo, Hecho después de cortar y probar en cuero (FR-04).
6. Menú → **Haciendo** mientras se mecaniza; al terminar, arrastrar a **Terminados** (todo `Hecho`) o **Rehacer** si falló. El programa pasa a **Finalizado** solo cuando todos sus sellos están `Hecho`/`Verificar`.

## Estados

Resumen (detalle y transiciones en [06-state-machines/programa.md](../../06-state-machines/programa.md)):

| `estado_programa` | Etiqueta | Cómo se entra |
|---|---|---|
| `BORRADOR` | Borrador | Al crear; al editar un programa `LISTO`; al desbloquear. |
| `LISTO` | Listo para Fabricar | Al generar el paquete ZIP o cuando el gadget sube el `.crv3d` (si estaba en Borrador). |
| `BLOQUEADO` | candado | Candado manual. |
| `EN_FABRICACION` | En fabricación | **Derivado**: algún sello `Haciendo` o `Retocar`. |
| `FINALIZADO` | Finalizado | **Derivado**: todos los sellos `Hecho` o `Verificar`. |

⚠️ `EN_FABRICACION` y `FINALIZADO` se **calculan en el navegador** al leer (`deriveLifecycleFromStamps`) y `getPrograms()` los **escribe** en la base como efecto secundario de la lectura.

Estados que el módulo escribe en el **sello**: `estado_fabricacion` (`Programado`, `Haciendo`, `Hecho`, `Rehacer`, `Retocar`, o el previo al quitarlo), `estado_fabricacion_previo`, `estado_aspire`, `maquina`, `motivo_salida_programa`, `no_importado_motivo`.

## Acciones

| Acción | Precondiciones | Cambios | Side effects |
|---|---|---|---|
| **Crear programa** (`createProgram`) | Si trae sellos: no superar el largo máximo por planchuela. | INSERT `programa` (`BORRADOR`, `dirty=true`); luego agrega sellos. | Evento `CREADO`. |
| **Agregar sellos** (`addStampsToProgram`) | Programa sin candado; cada sello: sin otro programa, `VECTORIZADO` con vector, estado `Sin Hacer`/`Prioridad`/`Rehacer`, entra en la máquina por planchuela, no supera el largo máximo. | Sello: `programa_id`, `estado_fabricacion_previo`, `estado_fabricacion='Programado'`, `maquina`, `estado_aspire='Aspire X'`. Programa: `largo_usado_*`, `cantidad_sellos`, `dirty=true`, `LISTO→BORRADOR`, renombre automático. | Evento `SELLO_AGREGADO`. Triggers DB: `sync_programa_nombre`, `update_programa_cantidad`, `mark_programa_dirty…`. |
| **Quitar sello** (`removeStampFromProgram`) | Sin candado. Elegir: volver al estado previo o a uno nuevo. | Sello: sin programa, estado previo/nuevo, sin Aspire, sin máquina. Programa: recalcula largos, `dirty`, renombre. | Evento `SELLO_QUITADO`. |
| **Cambiar estado de todo el programa** (`setFabricationStateForProgram`) | Tener sellos. Permitido **aunque esté bloqueado**. | Todos los sellos al estado; `Rehacer` → prioritario. | Notificación v3 "sellos terminados" si `Hecho`. Evento `ESTADO_CAMBIADO`. Triggers de `Hecho` (bronce). |
| **Estado por sello** (`setStampFabricationStates`, vista lista) | — | Cada sello a Hecho/Retocar/Rehacer. | Igual que arriba. |
| **Generar/descargar paquete** (`generateAndDownloadProgramPackage`) | Máquina ≠ `ABC`; al menos un sello. | Sube ZIP a `programas-zip`; `archivo_zip_url`, `LISTO`, `dirty=false`. Crea/reusa token de sync (30 días). | Evento `DESCARGADO`. **Ya no bloquea** (decisión F3 #10). |
| **Descargar Aspire** (si hay `.crv3d` subido) | `archivo_aspire_url` | — | Intenta registrar evento `ASPIRE_DESCARGADO`, que **no está permitido por el CHECK** → falla en silencio ([AUD-INC-010](../../audits/inconsistencias.md#aud-inc-010)). |
| **Candado / desbloquear** | — | `bloqueado`, `bloqueado_at/por`, `BLOQUEADO`; desbloquear → `BORRADOR` + `dirty`. | Eventos `BLOQUEADO` / `DESBLOQUEADO`. |
| **Borrar programa** (`deleteProgram`) | Sin candado. | Libera cada sello (estado previo o nuevo), limpia máquina, borra ZIP, borra fila. | — |
| **Subir `.crv3d` y conciliar** (vista lista) | Archivo `.crv3d`/`.crv`/`.zip`. | Sube a `programas-aspire`, parsea, guarda `sync_payload`, preview, `sync_origen='ARCHIVO_SUBIDO'`. **No bloquea ni verifica.** | Evento `SINCRONIZADO`; sellos no importados → eventos + notificación p7. Diálogo para sacar/agregar sellos. |
| **Verificar / desverificar** (`updateProgram isVerified`) | — | `verificado`; sellos a `Aspire X Check` / `Aspire X`. | Eventos `VERIFICADO`/`DESVERIFICADO`. 🔶 Sin botón visible en la vista tablero. |
| **Cambiar fecha** | — | Renombre automático; `dirty`. | — |

## Reglas de negocio (implementadas)

Detalle con IDs en [04-business-rules/programas-y-material.md](../../04-business-rules/programas-y-material.md). Resumen:

- BR-PROG-001 Solo ítems `SELLO` vectorizados en `Sin Hacer`/`Prioridad`/`Rehacer` pueden entrar a un programa.
- BR-PROG-002 Un sello está en a lo sumo un programa.
- BR-PROG-003 Máquina ↔ planchuela: C {12,19,25,38}, G {12,38}, XL {63}; ABC solo tipo `ABC`.
- BR-PROG-004 Largo por planchuela ≤ máximo de la máquina (C 400, G 250, XL 250 mm), contando lado mayor + 0,8 cm por sello.
- BR-PROG-005 Nombre automático; se actualiza solo si nunca se editó a mano.
- BR-PROG-006 Editar un programa `LISTO` lo devuelve a `BORRADOR` y lo marca `dirty` (en la app y además por trigger ante **cualquier** update de un sello del programa).
- BR-PROG-007 Candado manual impide agregar, quitar y borrar; no impide cambiar estados de fabricación.
- BR-PROG-008 Descargar el paquete no bloquea el programa.
- BR-PROG-009 Sincronizar no es terminar: subir/recibir el `.crv3d` no bloquea ni verifica (el gadget sí pasa `BORRADOR → LISTO`).
- BR-PROG-010 Estado derivado: el programa se da por finalizado cuando todos sus sellos están `Hecho` o `Verificar`.
- BR-PROG-012 Programas `ABC` no generan paquete (se arman a mano).
- Lista completa (BR-PROG-001…017, BR-MAT-001…003) en el archivo de reglas.

## Validaciones

- **Frontend/servicio** (✅): todas las de arriba viven en el navegador (`programs.service.ts`, `material.ts`, `eligibility.ts`).
- **Base de datos** (✅): CHECKs de `estado_programa`, `maquina`, `sync_origen`, `programa_eventos.tipo`; triggers de nombre/cantidad/dirty/máquina. **No hay** validación de elegibilidad ni de largo en la DB.
- **Edge `programa-sync`** (✅): token por programa, clave de instalación, idempotencia por `evento_id`, programa no finalizado para `paquete`.

## Datos

`programa`, `programa_eventos`, `programa_archivos_base`, `programa_sync_token`, `programa_trayectorias` (vacía), `sellos` (columnas de programa), `fabricacion_parametros` (largos máximos y pérdida de corte). Buckets: `programas-zip`, `programas-aspire`, `programas-preview`, `programas-base`, `programas-trayectorias` (sin uso aún), `vector`. Ver [05-data](../../05-data/README.md).

## Dependencias

- **Vectorización**: sin vector no hay programa.
- **Pedidos/Producción**: origen de los sellos; Producción muestra el programa como solo lectura.
- **Aspire + gadget**: ver [gadget-aspire.md](gadget-aspire.md).
- **Notificaciones**: p7 (sello no importado), v3 (sellos terminados).
- **Sidebar**: badge de sellos urgentes (prioritarios o con fecha límite ≤ 3 días) sin programar.

## Casos límite contemplados

- Sello `.eps` (vectores viejos, `_preview.png → .eps`): el paquete lo incluye, el gadget lo rechaza y la hoja muestra "no entró al Aspire". Decisión explícita de no convertir automáticamente (PLAN F3 §3 #9).
- Sello que cae en otra planchuela en Aspire: alerta "en otra planchuela".
- Sello quitado del programa después de armar Aspire: alerta "sobrante en Aspire" hasta correr Actualizar.
- `.crv3d` grande: la edge function no genera preview (>18 MB o ZIP); el navegador lo genera al abrir (`ensureProgramAspirePreview`).
- Borrado de un sello del pedido: se libera del programa primero (`releaseStampFromAnyProgram`).
- Borrado del programa: trigger limpia `maquina` de sus sellos.

## Fronteras con el mundo real

[FR-03 (Aspire)](../../10-operational-boundaries/README.md#fr-03) · [FR-04 (mecanizado)](../../10-operational-boundaries/README.md#fr-04).

## Preguntas abiertas

[Q-PROG-001 … Q-PROG-012](../../14-open-questions/programas.md) y [Q-CNC-*](../../14-open-questions/produccion-fabricacion.md).

## Implementación relacionada

- Página y UI: `src/app/programas/index.tsx`, `src/components/programas/Grid/ProgramsGrid.tsx`, `ProgramCardDesign.tsx`, `ProgramsSidePanel.tsx`, `HojaInlineStampPicker.tsx`, `FinishedProgramsBrowse.tsx`, `ProgramCard.tsx` (vista lista), `SyncReconcile/SyncReconcileDialog.tsx`, `DoneReview/DoneReviewDialog.tsx`, `BaseFiles/ProgramBaseFilesUpload.tsx`.
- Hook: `src/lib/hooks/usePrograms.ts` (sin auto-lock al descargar).
- Servicio: `src/lib/supabase/services/programs.service.ts` (`addStampsToProgram`, `removeStampFromProgram`, `setFabricationStateForProgram`, `syncProgramFromAspireFile`, `applyProgramReconciliation`, `markProgramPackageReady`, `releaseStampFromAnyProgram`, `uploadVerifiedAspire` [deprecada]).
- Reglas: `src/lib/programas/material.ts`, `eligibility.ts`, `lifecycle.ts`, `programName.ts`, `fabricationSize.ts`, `packageZip.ts`, `crv3d.ts` (+ tests `*.test.ts`).
- Edge: `supabase/functions/programa-sync/index.ts`.
- Planes de diseño: `PLAN_PROGRAMAS.md`, `PLAN_PROGRAMAS_FASE_2.md`, `PLAN_PROGRAMAS_FASE_3.md`, `programas-correcciones.md`, `programas-mejoras.md` (raíz del repo).
