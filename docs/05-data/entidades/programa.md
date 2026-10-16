# Programa (`programa` y tablas asociadas)

**Qué representa**: un lote de sellos que se mecaniza junto en una máquina CNC (una corrida de Aspire). 4 filas (módulo nuevo). Ver [módulo Programas](../../02-modules/programas/README.md).

## `programa`

| Grupo | Campos |
|---|---|
| Identidad | `id`, `nombre`, `fecha` (de producción), `descripcion`, `maquina` (`C`,`G`,`XL`,`ABC`, legado `Circular`) |
| Ciclo de vida | `estado_programa` (`BORRADOR`,`LISTO`,`BLOQUEADO`,`EN_FABRICACION`,`FINALIZADO`), `bloqueado`, `bloqueado_at`, `bloqueado_por`, `dirty`, `verificado` |
| Material | `cantidad_sellos` (trigger), `largo_usado_63/38/25/19/12` (mm, calculado en la app), `material_real_por_planchuela` (del gadget) |
| Archivos | `archivo_zip_url`, `archivo_zip_generado_at`, `archivo_aspire_url`, `archivo_aspire_nombre`, `archivo_aspire_subido_at`, `preview_url` |
| Sincronización | `sync_at`, `sync_origen` (`GADGET`,`ARCHIVO_SUBIDO`), `sync_payload` (reporte crudo), `maquinado_minutos` |
| Legado | `estado_fabricacion` (siempre `Sin Hacer` al crear; no se usa para el ciclo), `tiempo_maximo` |

`maquinado_minutos` y `material_real_por_planchuela` se **guardan pero no se muestran** en la UI (decisión F3 #8: "sin costos en esta fase").

## Tablas asociadas

**Migración aplicada por el usuario y verificada en esquema el 2026-10-16** `migration_programas_preparacion_v2.sql`: `programa_preparacion` guarda `documento` v2, `revision`, `revision_sincronizada`, `archivo_revision`, `observacion`, autor/fecha; `programa_preparacion_revisiones` conserva documento e informe/evento por revisión. RLS: lectura autenticada, escritura de borrador mediante `guardar_programa_preparacion` (CAS); informe y archivo solo mediante RPC de service role. El documento separa tamaño/receta de ejecución de los campos comerciales de `sellos`. Edge v31 desplegada con autorización el mismo día; instalación operativa de gadgets y recorrido remoto completo pendientes. [Contrato y flujo](../../02-modules/programas/preparacion-visual.md).

| Tabla | Qué guarda |
|---|---|
| `programa_eventos` | Historial: `CREADO`, `BLOQUEADO`, `DESBLOQUEADO`, `VERIFICADO`, `DESVERIFICADO`, `DESCARGADO`, `ESTADO_CAMBIADO`, `SELLO_AGREGADO`, `SELLO_QUITADO`, `ASPIRE_SUBIDO`, `SINCRONIZADO`, `SELLO_NO_IMPORTADO`, `SELLO_BORRADO_EN_MAQUINA`, `TRAYECTORIAS_SUBIDAS`; `detalle` JSON; `usuario_email` (nulo si vino del gadget) |
| `programa_sync_token` | Un token por programa para el gadget, vence a 30 días |
| `programa_archivos_base` | Por máquina C/G/XL: `.crv3d` base y gadget `.lua` |
| `programa_trayectorias` | Versiones de archivos de trayectorias (**sin uso**, 0 filas) |

## Relación con `sellos`

`sellos.programa_id` (FK sin cascada), `programa_nombre` (copia), `maquina`, `estado_aspire`, `estado_fabricacion_previo`, `motivo_salida_programa`, `no_importado_motivo`.

## Triggers

✅ Ampliación local 2026-10-16: `programa_preparacion_revisiones.eventos_procesados text[]` registra atómicamente las identidades ya recibidas para impedir reintentos atrasados; `evento_id` señala el resultado más reciente de esa revisión. `confirmar_programa_preparacion_archivo` exige también `p_evento_id`; se retira la firma de cinco argumentos para no permitir confirmaciones que solo comparen revisión. No hay escritura directa desde el cliente ni nuevos permisos anónimos. [Validación](../../audits/programas-conexion-validacion-2026-10-16.md).

✅ Aplicada por el usuario y verificada en solo lectura (2026-10-16): `migration_programas_preparacion_descartar.sql` agrega `descartar_programa_preparacion(programa_id, revision_esperada)` (autenticado, CAS, rechaza programas bloqueados/en fabricación; borra la fila vigente, conserva `programa_preparacion_revisiones`, marca `dirty` y `LISTO` → `BORRADOR`) y reemplaza `guardar_programa_preparacion` para que la primera fila de una nueva preparación arranque desde la última revisión del historial.

El informe de preparación incorpora `execution`: versión de reglas, comprobación de auxiliares y cantidades de sellos/planchuelas. El servidor contrasta las cantidades con el armado observado; confirmación de archivo e inicio exigen comprobación vigente. No se almacena como medida vendida ni cambia el pedido.

En el JSON `documento.recipes`, `fineTemplates.full/internal` guarda nombre/ruta de los dos perfilados manuales; `ALIMENTO.perimeterTemplate`, los del perímetro. En `stamps.fine`, `scope` distingue habitual/interior y `analysisVersion` invalida parámetros anteriores. El SVG observado incluye `sourceUrl` opcional: la app solo lo reutiliza cuando corresponde a la fuente vigente. Las rutas de plantillas son inmutables y se comprueban otra vez al generar el manifest.

`update_programa_cantidad` (⚠️ al mover un sello de A a B solo recuenta B), `sync_programa_nombre(_on_rename)`, `mark_programa_dirty_on_sello_*`, `clear_*maquina*`, `update_updated_at_column`.
