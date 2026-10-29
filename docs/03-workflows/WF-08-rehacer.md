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
3. ✅ RPC `registrar_rehacer` (ver [rehacer.md](../02-modules/pedidos/rehacer.md)):
   - **Post-entrega** (`Despachado` / `Seguimiento Enviado`): orden nueva `Garantía` + ítem clonado; original intacto; no suma a ventas (POL-086).
   - **Pre-entrega**: snapshot + sello `Rehacer` + prioridad; foto `Foto→Señado`; envío vuelve a `Sin envio`.
   - Snapshots de archivos en `rehacer-snapshots/` (ver [errores](../02-modules/errores/README.md)).
4. ✅ Notificaciones p2 (Producción) y v2 (Ventas); WhatsApp `sello_rehacer` al cliente.
5. El ítem activo vuelve a Vectorización (si hace falta) y a Programas → WF-03/WF-04. En Garantía, la foto pide el cargo o $0 (WF-05).
6. Cargos: en pre-entrega siguen en el evento (informativos); en Garantía el cargo es el `valor` del clon (restante del pedido nuevo).

## Caminos alternativos que NO registran motivo

- Menú del programa → Rehacer, `DoneReviewDialog` (Retocar/Rehacer por sello). Ponen `Rehacer` + prioridad, sin evento ni WhatsApp.

## Efectos colaterales

- Stock descontado al enviar **no se devuelve**.
- `bronce_consumo` del primer intento queda; el segundo `Hecho` registra otro consumo (el trigger dispara cuando pasa de no-Hecho a Hecho).
- Si el sello seguía asociado a un programa (`programa_id`), sigue asociado hasta que lo agreguen a uno nuevo: entonces se transfiere (POL-017 / Q-PROG-009).

## Preguntas

[Q-VEN-006, Q-VEN-007](../14-open-questions/ventas-cobros.md), [Q-PROD-004](../14-open-questions/produccion-fabricacion.md#q-prod-004).
