# WF-08 · Rehacer

| | |
|---|---|
| **Inicio** | Se detecta un problema: error en máquina, error de medida/vector, reclamo del cliente antes o después de la entrega, daño en el envío. |
| **Actor** | 🔶 Producción o Ventas. |
| **Módulos** | Pedidos / Producción (diálogo), Programas, Envíos, Notificaciones, WhatsApp |
| **Resultado** | Ítem(s) de nuevo en cola como **prioritarios**, con motivo registrado y estado previo guardado. |

## Pasos

1. Fabricación → **Rehacer** en Pedidos (orden entera o un ítem) o Producción.
2. Diálogo: motivo (obligatorio), descripción, opcional **cobro adicional** (monto y concepto).
3. ✅ RPC `registrar_rehacer` (ver [rehacer.md](../02-modules/pedidos/rehacer.md)): snapshot en `sello_rehacer_eventos` (estados, medidas, programa); sello `Rehacer` + prioridad + sin Aspire; foto borrada y venta `Foto→Señado`; orden despachada vuelve a `Sin envio` y pierde el seguimiento; el cliente copia base/vector a `rehacer-snapshots/` (ver [errores](../02-modules/errores/README.md)).
4. ✅ Notificaciones p2 (Producción) y v2 (Ventas); WhatsApp `sello_rehacer` al cliente.
5. El ítem vuelve a Vectorización (si hace falta) y a Programas (elegible por estar en `Rehacer`) → WF-03/WF-04.
6. Cargos: se muestran en Pedidos; ❓ se cobran por fuera y se marcan "cobrado".

## Caminos alternativos que NO registran motivo

- Menú del programa → Rehacer, `DoneReviewDialog` (Retocar/Rehacer por sello). Ponen `Rehacer` + prioridad, sin evento ni WhatsApp.

## Efectos colaterales

- Stock descontado al enviar **no se devuelve**.
- `bronce_consumo` del primer intento queda; el segundo `Hecho` registra otro consumo (el trigger dispara cuando pasa de no-Hecho a Hecho).
- Si el sello seguía asociado a un programa (`programa_id`), sigue asociado. 🔶 → [Q-PROG-009](../14-open-questions/programas.md#q-prog-009).

## Preguntas

[Q-VEN-006, Q-VEN-007](../14-open-questions/ventas-cobros.md), [Q-PROD-004](../14-open-questions/produccion-fabricacion.md#q-prod-004).
