# Ítem / sello (`sellos`)

**Qué representa**: una línea de un pedido. A pesar del nombre de la tabla, puede ser un **sello** o un **accesorio** (`item_type`). Es la unidad que se vectoriza, programa, fabrica, fotografía y cobra. 3.873 filas.

## Campos relevantes

| Grupo | Campos | Notas |
|---|---|---|
| Identidad | `id`, `orden_id`, `fecha`, `created_at` | `fecha` = fecha del pedido |
| Producto | `item_type` (`SELLO`, `ABECEDARIO`, `SOLDADOR`, `MANGO_GOLPE`, `BASE_REMACHADORA`), `tipo` (`Clasico`, `3mm`, `Lacre`, `Alimento`, `ABC`), `diseno` (nombre), `item_config` (JSON: potencia, datos de abecedario; en web: origen, slug, colección, variante), `nota` | |
| Medidas | `ancho_real`, `largo_real` (**cm**, pedida; ancho = mayor), `ancho_fabricacion_mm`, `largo_fabricacion_mm` (**mm**, confirmada), `tipo_planchuela` (12/19/25/38/63, 100 legado) | Ver [medida](../../02-modules/vectorizacion/medida-de-fabricacion.md) |
| Dinero | `valor`, `senia`, `restante` (trigger), `costo_fabricacion`, `margen_fabricacion` (trigger) | |
| Estados | `estado_fabricacion`, `estado_fabricacion_previo`, `es_prioritario`, `estado_venta`, `estado_vectorizacion`, `estado_aspire` | Ver [06-state-machines](../../06-state-machines/README.md) |
| Archivos | `archivo_base` (bucket `base` o URL de mockup), `archivo_base_mejorado(_at)`, `archivo_vector_preview` (URL del **vector** SVG/PDF/AI, o del **preview PNG** si es EPS), `foto_sello` (bucket `foto`) | `vectorUrlFromPreview` convierte `_preview.png` → `.eps` |
| Programa | `programa_id`, `programa_nombre` (copia por trigger), `maquina`, `motivo_salida_programa`, `no_importado_motivo` | 1.535 ítems tienen `programa_nombre` sin `programa_id` (históricos) |
| Otros | `fecha_limite`, `tiempo` (sin uso visible), `mockup_solicitud_id`, `error_vectorizacion_mensaje` | |

## Estados en vivo (2026-09-27)

Fabricación: Hecho 3.797 · Programado 34 · Sin Hacer 22 · Haciendo 13 · Prioridad 4 (legado) · Rehacer 2 · Verificar 1.
Venta: Transferido 3.766 · Señado 48 · Deudor 22 · Foto 21 · nulo 16.
Vectorización: BASE 2.267 · VECTORIZADO 1.508 · DESCARGADO 15 (legado) · EN_PROCESO 1 · nulo 82.

## Automatizaciones (triggers)

`update_sello_restante`, `calc_sello_fabrication_cost`, `detect_programado_state`, `sellos_rehacer_auto_prioridad`, `sync_programa_nombre`, `clear_maquina_when_sello_leaves_programa`, `mark_programa_dirty_*`, `update_orden_totals`, `update_programa_cantidad`, `trg_estado_historial_sellos`, `trigger_foto_sello_subida` (WhatsApp), `trg_refresh_orden_fabrication_totals`, `registrar_bronce_consumo_sello`, `trg_confirm_web_order_on_sellos_insert`.

## Quién lo modifica

Pedidos, Producción, Programas, Vectorización, gadget (vía edge), `confirm-web-order`, `registrar_rehacer`, cron de deudores, triggers.
