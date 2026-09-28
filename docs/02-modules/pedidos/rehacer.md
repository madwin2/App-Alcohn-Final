# Rehacer

> UI: `src/components/shared/RehacerDialog.tsx` (desde Pedidos y Producción) · Servicio: `src/lib/supabase/services/rehacer.service.ts` · RPC: `public.registrar_rehacer` (en la base) · Plan: `PLAN_REHACER_ITEMS.md`
> Workflow: [WF-08](../../03-workflows/WF-08-rehacer.md)

## Propósito

✅ Volver a fabricar uno o más ítems (por error de máquina, de medida/vector, reclamo del cliente o daño en el envío), dejando **registro del motivo**, del estado previo y de un eventual **cobro adicional**.

## Cómo se dispara

✅ Al elegir **Rehacer** en el selector de Fabricación (Pedidos: fila de orden = todos los ítems; fila de ítem = uno) o en Producción. Setear `Rehacer` desde el menú de un **programa** o desde la revisión de "Hecho" **no** abre este diálogo: cambia el estado sin motivo (ver [AUD-INC-012](../../audits/inconsistencias.md#aud-inc-012)).

## Diálogo

- Motivo (obligatorio): `ERROR_DETECTADO_EN_MAQUINA`, `ERROR_MEDIDA_O_VECTOR`, `RECLAMO_CLIENTE_PRE_ENTREGA`, `DANIO_O_ERROR_EN_ENVIO`, `RECLAMO_CLIENTE_POST_ENTREGA`, `OTRO` (descripción obligatoria si es Otro).
- Descripción (opcional).
- "Corresponde cobrar algo al cliente" → monto (>0) y concepto.

## Qué hace `registrar_rehacer` (✅ SQL en la base)

Por cada ítem:
1. Inserta `sello_rehacer_eventos` con la **foto de estado previo**: fabricación, venta, foto, estado de envío, seguimiento, empresa y fecha de seguimiento enviado de la orden, y el cobro adicional.
2. Actualiza el sello: `estado_fabricacion='Rehacer'`, `es_prioritario=true`, `estado_aspire=NULL`; si la venta estaba `'Foto'` → borra la foto y vuelve a `'Señado'`.

Por cada orden afectada:
3. Si el envío no estaba en `Sin envio` → `estado_envio='Sin envio'`, borra `seguimiento` y `seguimiento_enviado_at`.
4. Si todos los ítems de la orden quedan con el mismo estado de venta, lo copia a `estado_orden`.

Además (desde el navegador):
5. Refuerza `es_prioritario=true`.
6. Notificaciones internas **p2** (Producción) y **v2** (Ventas) con motivo y cobro.
7. **WhatsApp al cliente** tipo `sello_rehacer` con los ítems afectados — se envía **siempre**, sin importar el motivo. ✅ Intencional: transparencia con el cliente (Q-VEN-006).

Trigger adicional: `sellos_rehacer_auto_prioridad` pone prioridad cada vez que un sello entra a `Rehacer` por cualquier camino.

## Cargos de rehacer

✅ `cobro_adicional_*` en `sello_rehacer_eventos`. Se muestran en Pedidos (celda de cargos) y se pueden marcar como **cobrados**. **No se suman al restante** de la orden (comentario en `ReworkCharge`). ✅ Se cobra o no según de quién fue el error; se le informa el monto al cliente (Q-VEN-007).

## Efectos sobre otros módulos

- **Programas**: `estado_aspire` limpio; el sello vuelve a ser elegible (estado `Rehacer`). Si seguía con `programa_id`, sigue asociado a ese programa (el RPC no lo quita) y **no reaparece** en el panel de Vectores. Política confirmada: debe quedar registrado en el programa donde falló pero poder asignarse a uno nuevo (POL-017) → **pendiente de implementar** (AUD-INC-013).
- **Envíos**: la orden vuelve a no despachada; desaparece del historial de despachados.
- **Stock**: si ya se había descontado stock al enviarse, **no** se devuelve.
- **Vectorización**: si el motivo es de vector, 🔶 el operario debe re-vectorizar; el sistema no borra el vector.
