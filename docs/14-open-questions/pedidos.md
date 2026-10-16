# Preguntas abiertas — Pedidos

### Q-PED-001
- **Módulo**: Pedidos (alta) · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿En qué casos se tilda "no enviar confirmación por WhatsApp" al crear un pedido? ¿Qué requisitos tiene que cumplir un pedido antes de cargarlo (seña cobrada, diseño aprobado)?
- **Evidencia**: `skipConfirmationWebhook` en `NewOrderStepForm`.
- **Impacto**: medio.
- Respuesta: Cuando necesitamos por algun motivo no mandarle mensaje al cliente, como el mensaje es fijo y dice que acabamos de subir el pedido, y capaz q el cliente lo habia pedido hace mas dias. Para evitar inconventientes. Nose, es el uso que cada uno quiera darle. El unico requisito es la seña. Despues el resto se pueden obviar (aunque no es lo ideal). Pero sin seña no se toman trabajos.

### Q-PED-002
- **Módulo**: Pedidos · **Estado**: documentada (2026-09-28)
- **Pregunta**: El canal de contacto elegido en el alta (Instagram, Facebook…) no se guarda: siempre queda "Whatsapp". ¿El canal importa para el negocio (métricas, cómo contactar)?
- **Evidencia**: `mapCustomerToCliente` fija `Whatsapp` si hay teléfono.
- **Por qué importa**: métricas de canal en `clientes.medio_contacto` están sesgadas.
- **Impacto**: medio.
- Respuesta: Es que la gran mayoria son de whatsapp. Es desde donde nos contacto. Pero casi siempre es whatsapp.

### Q-PED-003
- **Módulo**: Pedidos (alta) · **Estado**: documentada (2026-09-28)
- **Pregunta**: En pedidos con varios diseños, solo se toman el envío y la fecha límite del primero. ¿Es lo esperado (un envío por pedido) o hay casos de ítems con envíos/fechas distintas?
- **Evidencia**: `handleFinalSubmitWithDesigns` en `NewOrderDialog.tsx`.
- **Impacto**: medio.
- Respuesta: Si, un envio por pedido. Si necesitan envios distintos son ordenes distintas.

### Q-PED-004
- **Módulo**: Pedidos/Producción · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué representa la "fecha límite" (compromiso de entrega al cliente, de despacho o de fabricación)? Los avisos la usan para ambos (p4 producción y l2 despacho).
- **Evidencia**: `emitir_notificaciones_vencimientos`.
- **Impacto**: medio.
- Respuesta: Es la fecha en la que tiene que estar listo y despacharse. Se usa para todo el equipo.

### Q-PED-005
- **Módulo**: Pedidos · **Estado**: parcial (falta revisar el uso real)
- **Pregunta**: ¿Para qué se usan las "tareas" de pedido (48 de producción, 1 de pedidos) y los post-its globales (0 usos)? ¿Se mantienen?
- **Impacto**: bajo.
- Respuesta: Los post its globales son para anotaciones rapidas. Las tareas son para cosas referidas a pedidos y cosas asi. Acciones necesarias. Supongo. Hay que chequear me parece.

### Q-PED-006
- **Módulo**: Pedidos / Rehacer · **Estado**: documentada (2026-10-15)
- **Pregunta**: Cuando se rehace un sello de un pedido **ya entregado** (o ya despachado), ¿debería nacer una **orden nueva** de tipo no-venta (p. ej. `Rehacer`/`Garantía`, similar a Prueba en métricas pero con cliente real, foto y envío), en vez de reabrir la orden original?
- **Evidencia**: Hoy `registrar_rehacer` muta el mismo sello/orden: fabricación → `Rehacer`, envío → `Sin envio` (borra seguimiento), y solo si venta estaba `Foto` vuelve a `Señado`. Si ya estaba `Transferido`, la foto/venta no se reinician → el flujo de foto automática (`getAvailableStampsForPhoto` exige `Señado` sin foto) no encaja. La orden sale del historial de despachados. Prueba/Regalo ya tienen `tipo_pedido` + `ordenCuentaComoVenta` / `itemCuentaComoVenta`. Andreani ya no imputa envío en Economía cuando el cliente paga el link (BR-COS-006).
- **Por qué importa**: organiza mejor cola, estados, foto y reenvío; evita ensuciar un pedido cerrado del mes anterior; no debe inflar la meta de ventas del mes.
- **Impacto**: alto (modelo de datos + WF-08 + Economía + WhatsApp).
- **Respuesta**:
  1. **Corte**: solo **post-entrega**. En el sistema eso es `estado_envio` ∈ {`Despachado`, `Seguimiento Enviado`} (equivalente a “ya se entregó”). Pre-entrega sigue el Rehacer in-place actual.
  2. **Tipo**: `Garantía` (no-venta; no suma a stats/meta). Cliente real (no el interno de Prueba).
  3. **Ítem**: el original **queda** en la orden vieja; nace un **ítem nuevo clonado** en la orden Garantía.
  4. **Foto / cobro**: el WhatsApp de listo pide el **cargo adicional** si hay; si no, **$0**.
  5. **Economía**: gasto = **fabricación + envío**, salvo que el envío lo pague el cliente por **Andreani** (mismo criterio que BR-COS-006: nosotros no lo tomamos).
  - Política: [POL-086](../04-business-rules/politicas-confirmadas.md). ADR: [ADR-025](../13-decisions/ADR-025-garantia-post-entrega.md). Implementada; migración aplicada en producción.
