# Rehacer

> UI: `src/components/shared/RehacerDialog.tsx` (desde Pedidos y Producción) · Servicio: `src/lib/supabase/services/rehacer.service.ts` · RPC: `public.registrar_rehacer` (en la base) · Plan: `PLAN_REHACER_ITEMS.md`
> Workflow: [WF-08](../../03-workflows/WF-08-rehacer.md)

## Propósito

✅ Volver a fabricar uno o más ítems (por error de máquina, de medida/vector, reclamo del cliente o daño en el envío), dejando **registro del motivo**, del estado previo y de un eventual **cobro adicional**.

## Cómo se dispara

✅ Al elegir **Rehacer** en el selector de Fabricación (Pedidos: fila de orden = todos los ítems; fila de ítem = uno) o en Producción. Setear `Rehacer` desde el menú de un **programa** o desde la revisión de "Hecho" **no** abre este diálogo: cambia el estado sin motivo (ver [AUD-INC-012](../../audits/inconsistencias.md#aud-inc-012)).

## Diálogo

- Motivo (obligatorio): `ERROR_DETECTADO_EN_MAQUINA`, `ERROR_EN_LA_MEDIDA`, `ERROR_EN_EL_VECTOR`, `ERROR_EN_PROGRAMACION_ASPIRE`, `RECLAMO_CLIENTE_PRE_ENTREGA`, `DANIO_O_ERROR_EN_ENVIO`, `RECLAMO_CLIENTE_POST_ENTREGA`, `OTRO` (descripción obligatoria si es Otro). El motivo viejo `ERROR_MEDIDA_O_VECTOR` solo aparece en eventos históricos.
- Descripción (opcional).
- "Corresponde cobrar algo al cliente" → monto (>0) y concepto.

## Qué hace `registrar_rehacer` (✅ SQL en la base)

Migración: `migration_garantia_post_entrega.sql` (POL-086 / [ADR-025](../../13-decisions/ADR-025-garantia-post-entrega.md)).

### Rama A — post-entrega (`estado_envio` ∈ {`Despachado`, `Seguimiento Enviado`})

Por cada ítem (agrupando por pedido origen):
1. Crea (o reutiliza) una orden `tipo_pedido='Garantía'` con el mismo cliente, `orden_origen_id`, empresa/tipo de envío copiados, `estado_envio='Sin envio'`.
2. Clona el sello en esa orden (`sello_origen_id`, fabricación `Rehacer` + prioritario, venta `Señado`, sin foto/programa/Aspire). El **cargo adicional** (si hay) va como `valor` del primer clon de esa orden; si no, `valor=0`.
3. Inserta `sello_rehacer_eventos` sobre el **sello original** (el pedido entregado no se toca) con `sello_nuevo_id` / `orden_garantia_id`.
4. Devuelve `(evento_id, sello_id original, sello_activo_id=clon, orden_garantia_id, modo='garantia')`.

### Rama B — pre-entrega (resto)

Por cada ítem:
1. Inserta `sello_rehacer_eventos` con la **foto de estado previo**: fabricación, venta, foto, estado de envío, seguimiento, empresa y fecha de seguimiento enviado de la orden, cobro adicional, **medidas** y `programa_id` previos.
2. Actualiza el sello: `estado_fabricacion='Rehacer'`, `es_prioritario=true`, `estado_aspire=NULL`; si la venta estaba `'Foto'` → borra la foto y vuelve a `'Señado'`.
3. Si el envío no estaba en `Sin envio` (y no es post-entrega) → `estado_envio='Sin envio'`, borra `seguimiento` y `seguimiento_enviado_at`.
4. Si todos los ítems de la orden quedan con el mismo estado de venta, lo copia a `estado_orden`.
5. Devuelve `(…, modo='inplace')`.

Además (desde el navegador):
6. Copia **base**, **vector** y **base mejorada** a `rehacer-snapshots/{evento_id}/…` (desde el sello original).
7. Refuerza `es_prioritario=true` sobre el sello activo (clon o original).
8. Notificaciones internas **p2** / **v2** (orden activa = Garantía si aplica).
9. **WhatsApp** `sello_rehacer` al cliente — siempre (Q-VEN-006).

Trigger adicional: `sellos_rehacer_auto_prioridad` pone prioridad cada vez que un sello entra a `Rehacer` por cualquier camino.

## Snapshots de archivos

✅ Las URLs `archivo_base_snapshot` / `archivo_vector_snapshot` / `archivo_base_mejorado_snapshot` apuntan a copias inmutables. Borrar o reemplazar el archivo operativo del sello no las elimina. Se consultan en la [hoja de Errores](../errores/README.md).

## Cargos de rehacer

✅ `cobro_adicional_*` en `sello_rehacer_eventos`. Se muestran en Pedidos (celda de cargos) y se pueden marcar como **cobrados**. **No se suman al restante** de la orden (comentario en `ReworkCharge`). ✅ Se cobra o no según de quién fue el error; se le informa el monto al cliente (Q-VEN-007).

## Efectos sobre otros módulos

- **Programas**: `estado_aspire` limpio; el sello vuelve a ser elegible (estado `Rehacer`). Si seguía con `programa_id`, sigue asociado a ese programa (el RPC no lo quita) y **no reaparece** en el panel de Vectores. Política confirmada: debe quedar registrado en el programa donde falló pero poder asignarse a uno nuevo (POL-017) → **pendiente de implementar** (AUD-INC-013).
- **Envíos**: la orden vuelve a no despachada; desaparece del historial de despachados.
- **Stock**: si ya se había descontado stock al enviarse, **no** se devuelve.
- **Vectorización**: si el motivo es de vector, 🔶 el operario debe re-vectorizar; el sistema no borra el vector.
