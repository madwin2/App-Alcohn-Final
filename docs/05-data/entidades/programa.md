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

| Tabla | Qué guarda |
|---|---|
| `programa_eventos` | Historial: `CREADO`, `BLOQUEADO`, `DESBLOQUEADO`, `VERIFICADO`, `DESVERIFICADO`, `DESCARGADO`, `ESTADO_CAMBIADO`, `SELLO_AGREGADO`, `SELLO_QUITADO`, `ASPIRE_SUBIDO`, `SINCRONIZADO`, `SELLO_NO_IMPORTADO`, `SELLO_BORRADO_EN_MAQUINA`, `TRAYECTORIAS_SUBIDAS`; `detalle` JSON; `usuario_email` (nulo si vino del gadget) |
| `programa_sync_token` | Un token por programa para el gadget, vence a 30 días |
| `programa_archivos_base` | Por máquina C/G/XL: `.crv3d` base y gadget `.lua` |
| `programa_trayectorias` | Versiones de archivos de trayectorias (**sin uso**, 0 filas) |

## Relación con `sellos`

`sellos.programa_id` (FK sin cascada), `programa_nombre` (copia), `maquina`, `estado_aspire`, `estado_fabricacion_previo`, `motivo_salida_programa`, `no_importado_motivo`.

## Triggers

`update_programa_cantidad` (⚠️ al mover un sello de A a B solo recuenta B), `sync_programa_nombre(_on_rename)`, `mark_programa_dirty_on_sello_*`, `clear_*maquina*`, `update_updated_at_column`.
