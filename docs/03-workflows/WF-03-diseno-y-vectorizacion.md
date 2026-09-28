# WF-03 · Diseño y vectorización

| | |
|---|---|
| **Inicio** | Un ítem `SELLO` tiene archivo base (imagen del cliente, o imagen del mockup) y no tiene vector. |
| **Actor** | 🔶 Diseño/Producción. |
| **Módulos** | Vectorización, Pedidos/Producción (subida manual), Vectorizer.AI |
| **Resultado** | `estado_vectorizacion='VECTORIZADO'`, SVG en `archivo_vector_preview`, medida de fabricación guardada → el sello es **elegible para un programa**. |

## Camino A — Página Vectorización (principal desde 2026-09-15)

1. Vectorización → pestaña **Pedidos**: lista de pendientes (prioritarios primero, luego fecha límite). Toggle para incluir `Rehacer`/`Prioridad`.
2. ❓ Si la imagen es mala: copiarla, **retocarla en un editor externo**, y "reemplazar desde el portapapeles" → `archivo_base_mejorado` → [FR-02](../10-operational-boundaries/README.md#fr-02).
3. Seleccionar ítems → se preparan (recorte, margen, limpieza).
4. **Vectorizar** → confirmar costo en créditos (modo `production`).
5. Sistema: arma hojas, llama a Vectorizer.AI vía `/api/vectorize`, separa un SVG por ítem → cola de **Revisión** (en memoria; no cerrar la pestaña).
6. Revisión (decisión humana): **Confirmar** / Rechazar / Reemplazar con SVG propio.
7. Confirmar → el SVG se escala al tamaño pedido, se sube al bucket `vector`, `VECTORIZADO`. Si la medida medida difiere (tope de planchuela o ≥6 mm) → popup de **medida de fabricación** (ver [medida](../02-modules/vectorizacion/medida-de-fabricacion.md)).

## Camino B — Vector hecho por fuera

1. ❓ Alguien vectoriza con otra herramienta (🔶 "programa de escritorio", Illustrator: el gadget recomienda exportar SVG en mm desde Illustrator).
2. Subir en la celda Vector de **Pedidos** o **Producción**, o en masa en **Vectorización → Asignar SVG** (empareja por nombre de archivo).
3. No-SVG (EPS/PDF/AI) → advertencia; se guarda igual (EPS genera preview PNG). ⚠️ Esos vectores **no los importa el gadget de Aspire**.
4. SVG → cálculo de medida de fabricación automático / popup.

## Camino C — Automático (desactivado)

Al subir el base se encolaría un job en el vector-worker (`vector_jobs`) y el sello pasaría a `EN_PROCESO`; hoy apagado por flag.

## Cambios de estado

`estado_vectorizacion`: `BASE` → `VECTORIZADO` (o `EN_PROCESO` → `VECTORIZADO`/`ERROR` en el camino C). Reemplazar el base limpia el vector y vuelve a `BASE`. Ver [06-state-machines/vectorizacion.md](../06-state-machines/vectorizacion.md).

## Efectos en otros módulos

- Programas: el sello aparece en el panel **Vectores** si es `SELLO`, `VECTORIZADO`, sin programa, en `Sin Hacer`/`Prioridad`/`Rehacer` y entra en alguna máquina.
- Costos: la medida de fabricación recalcula el costo (trigger).
- Notificación p1 si se cambia el vector de un sello "en curso".

## Preguntas

[Q-VEC-001…](../14-open-questions/vectorizacion.md).
