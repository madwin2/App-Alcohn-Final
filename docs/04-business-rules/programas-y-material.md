# Reglas — Programas, máquinas y material

## Preparación visual por ejecución (2026-10-15)

✅ POL-079–085/087/088: soporte fijo por máquina; carga parcial sobre planchuelas completas; medidas/receta de fabricación independientes de la venta; conservar geometría de Aspire y consultar conflictos de la misma propiedad; primera fresa configurada 0,6 mm/15°; fina física 0,1/configurada 0,2 mm, 30°, tope 0,6 mm también en Alimento. Alimento usa principales 3MM y Corte Forma con inicio 3,5/pasada 5,5 después del fino. Se exige pertenencia completa, apoyo, largo, separación de 8 mm y material declarado antes del manifest. Las referencias de profundidad no crean una nueva política de bloqueo de fresa (Q-VEC-009).

La implementación devuelve a pendientes mediante la acción existente antes de excluir definitivamente de la corrida; no permite fabricar en cascada un sello omitido. Los controles por revisión y el repaso automático conservador están detallados en [preparación visual](../02-modules/programas/preparacion-visual.md); requieren migración y despliegue.

| ID | Regla | Dónde | Hace cumplir |
|---|---|---|---|
| BR-PROG-001 | Solo pueden entrar a un programa ítems `SELLO`, `VECTORIZADO`, con vector, en `Sin Hacer`, `Prioridad` o `Rehacer`. | `getEligibleStamps`, `addStampsToProgram`, `ELIGIBLE_FAB_STATES` | Servicio |
| BR-PROG-002 | Un ítem pertenece a lo sumo a un programa; para moverlo hay que quitarlo primero. | `addStampsToProgram` | Servicio |
| BR-PROG-003 | Planchuelas por máquina: C {12, 19, 25, 38}; G {12, 38}; XL {63}. ABC acepta solo ítems tipo `ABC` (cualquier medida). | `MACHINE_SIZE_ELIGIBILITY`, `isEligibleStampForMachine` | Servicio |
| BR-PROG-004 | Por cada planchuela, la suma de (lado mayor + pérdida de corte) de los sellos no puede superar el largo máximo de la máquina (C 400 mm, G 250, XL 250; configurable en `fabricacion_parametros`). | `validatePlanchuelaLengthLimit` en `createProgram`/`addStampsToProgram`; `suggestStampSelection` | Servicio |
| BR-PROG-005 | Nombre automático `"D MMM xN M"`; se actualiza al cambiar cantidad o fecha solo si el nombre actual tiene formato automático. | `programName.ts`, `maybeRenameProgram` | Servicio |
| BR-PROG-006 | Editar un programa (agregar, quitar, cambiar fecha) lo marca `dirty` y lo devuelve de `LISTO` a `BORRADOR`. Además cualquier UPDATE de un ítem que sigue en el mismo programa (incluido un cambio de estado) hace lo mismo. | `markProgramDirtyAfterEdit`; trigger `mark_programa_dirty_on_sello_relevant_update` | Servicio + DB |
| BR-PROG-007 | Con candado no se puede agregar, quitar ni borrar; sí cambiar estados de fabricación. | `assertProgramEditable`, `deleteProgram`, `ProgramsGrid` | Servicio/UI |
| BR-PROG-008 | Descargar el paquete **no** bloquea el programa (decisión F3 #10). | `usePrograms.downloadPackage` | Servicio |
| BR-PROG-009 | Sincronizar (gadget o archivo) no bloquea, no verifica ni cambia `estado_programa`; subir el `.crv3d` desde el gadget sí pasa `BORRADOR → LISTO`. | `syncProgramFromAspireFile`, edge `programa-sync` | Servicio/Edge |
| BR-PROG-010 | Estado derivado: todos `Hecho`/`Verificar` → `FINALIZADO`; alguno `Haciendo`/`Retocar` → `EN_FABRICACION`; candado → `BLOQUEADO`. | `deriveLifecycleFromStamps` | Servicio (se persiste al leer) |
| BR-PROG-011 | Agregar a un programa: el ítem pasa a `Programado`, guarda su estado previo, recibe la máquina y `estado_aspire='Aspire <máquina>'`. Quitarlo restaura el previo (o uno elegido) y limpia máquina y Aspire. | `addStampsToProgram`, `removeStampFromProgram` | Servicio |
| BR-PROG-012 | Programas de máquina ABC no generan paquete Aspire. | `canDownloadPackage` | Servicio |
| BR-PROG-013 | Verificar un programa pasa sus ítems a `Aspire <máquina> Check`; desverificar los devuelve a `Aspire <máquina>`. | `updateProgram` | Servicio |
| BR-PROG-014 | Un sello que el operario borró en Aspire "por falta de material" sale del programa con `motivo_salida_programa='SIN_MATERIAL'` y vuelve a su estado previo. | edge `programa-sync` | Edge |
| BR-PROG-015 | El gadget solo importa SVG/DXF; otros formatos se reportan como "no importado" y se notifica a Producción (p7). | gadgets Lua, edge `programa-sync` | Gadget/Edge |
| BR-PROG-016 | El token de sincronización de un programa vence a los 30 días; se renueva al listar/generar el paquete. | `getOrCreateProgramSyncToken`, `ensureSyncToken` | Servicio/Edge |
| BR-PROG-017 | Al quitar un ítem de un programa o borrar el programa, se limpia `maquina` del ítem. | triggers `clear_maquina_when_sello_leaves_programa`, `clear_sellos_maquina_before_programa_delete` | DB |
| BR-PROG-018 | En programas preparados, el archivo confirmado debe pertenecer al último resultado nativo de la revisión: una subida o un reintento anterior no reemplazan otro resultado posterior. DB y edge v31 publicadas el 2026-10-16; gadget y prueba conectada pendientes. | `checkPreparationUpload`, `registrar_programa_preparacion_resultado`, `confirmar_programa_preparacion_archivo` | Edge + DB |
| BR-MAT-001 | Planchuela por lado menor (cm): ≤1,2→12; ≤1,8→19; ≤2,5→25; ≤4,0→38; >4,0→63. Si el ítem ya tiene `tipo_planchuela`, se usa ese. | `resolvePlanchuelaRef`; trigger `registrar_bronce_consumo_sello` | Servicio + DB |
| BR-MAT-002 | Largo consumido por un sello = (lado mayor + pérdida de corte, 0,8 cm por defecto) en la planchuela. | `stampLengthAlongMm`, triggers de costo y bronce | Servicio + DB |
| BR-MAT-003 | Para material y costo se usa la medida de fabricación si existe; si no, la pedida. | `effectiveStampDimsCm`, triggers | Servicio + DB |

### Preparación por revisión (implementación local, despliegue pendiente)

- El corte transversal exige separación entre sellos de una misma planchuela aun si sus cajas no se superponen lateralmente. Se incluye el espacio final de corte/acabado derivado del gadget actual.
- El plan geométrico se vuelve a evaluar con las posiciones observadas en Aspire antes de generar auxiliares. Cambiar planchuela actualiza el ancho del corte; el taladro conserva su diámetro físico al cambiar tamaño del diseño.
- Informe recalculado y auxiliares verificados con la versión de reglas vigente son condiciones para confirmar el archivo e iniciar. Esta comprobación no certifica por sí sola selección CAM ni resultado físico; ver [calificación](../02-modules/programas/preparacion-visual.md).
