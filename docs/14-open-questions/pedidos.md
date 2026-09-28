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