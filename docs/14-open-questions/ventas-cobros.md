# Preguntas abiertas — Ventas y cobros

### Q-VEN-001
- **Módulo**: Pedidos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se cobra y verifica la seña de un pedido manual? ¿Hay un monto o porcentaje estándar?
- **Contexto**: la seña se carga como número; la web usa $20.000 por defecto.
- **Impacto**: medio.
- Respuesta: Monto estandar $20.000. Nos mandan comprobante por whatsapp. $30.000 para sellos XL.

### Q-VEN-002
- **Módulo**: Envíos · **Estado**: documentada (2026-09-28)
- **Pregunta**: Guardar los datos de envío pasa el pedido a **Transferido** automáticamente. ¿Es porque siempre se piden los datos después de cobrar? ¿Qué pasa si el cliente manda los datos antes de pagar?
- **Evidencia**: `handleSaveShippingData` (`needsTransfer`).
- **Por qué importa**: puede marcar como pagado algo que no se cobró y dispara la etiqueta paga.
- **Impacto**: alto.
- Respuesta: Claro, cargamos los datos una vez que nos pagan. Si no nos pagan no se carga.

### Q-VEN-003
- **Módulo**: venta · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué significa exactamente "Transferido": pago total verificado en la cuenta? ¿Incluye el envío? ¿Qué pasa con pagos en efectivo o Mercado Pago?
- **Impacto**: alto.
- Respuesta: Significa que pagaron todo lo que tenian que pagar (si incluia el envio, incluye el envio). Andreani lo pagan en la pagina de ellos asi que eso no lo contempla en esos casos.

### Q-VEN-004
- **Módulo**: Deudores · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué se hace con un Deudor (recordatorios, plazos, cancelación, retención del sello)? ¿Los 10 días son el criterio correcto?
- **Evidencia**: `marcar_ordenes_deudores_por_foto` (10 días fijos).
- **Impacto**: medio.
- Respuesta: La idea es que automaticamente se marca como deudor despes de 10 dias fijos desde que se le mando la foto y no pago. Y la idea es que cada x cantidad de tiempo se le mande un mensaje de recordatorio. Quisaz cada 15 dias.

### Q-VEN-005
- **Módulo**: Fotos · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se toma la foto del sello terminado y quién la sube? ¿Se manda por cada ítem o al terminar todo el pedido?
- **Impacto**: medio.
- Respuesta: Se manda por item. Las saca juli y las sube a la app y la automatizacion las envia a cada cliente.

### Q-VEN-006
- **Módulo**: Rehacer · **Estado**: documentada (2026-09-28)
- **Pregunta**: Todo Rehacer le manda un WhatsApp al cliente, incluso si el motivo es un error interno detectado en máquina. ¿Es intencional?
- **Evidencia**: `notifySellosRehacer` en `rehacer.service.ts` (sin condición por motivo).
- **Impacto**: medio (experiencia del cliente).
- Respuesta: Es intencional. Para que el cliente sepa que hubo un error. y se va a demorar mas. Mientras mas transparecnia mejor.

### Q-VEN-007
- **Módulo**: Rehacer · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cómo se cobra el cargo adicional de un Rehacer y cómo se integra al restante/economía? Hoy es informativo.
- **Impacto**: medio.
- Respuesta: Dependiendo del motivo se cobra o no. Se le dice el monto al cliente y el cliente lo paga. Si es error nuestro, del cliente, depende de eso.

### Q-VEN-008
- **Módulo**: Fotos · **Estado**: pendiente
- **Pregunta**: ¿Hay un estándar para la foto del sello (la pieza o la marca en cuero, fondo, encuadre)?
- **Impacto**: bajo (manual de empleados).

### Q-VEN-009
- **Módulo**: Cobros · **Estado**: pendiente
- **Pregunta**: ¿Quién verifica que la seña y el pago total ingresaron (mira la cuenta) y en qué cuenta se cobra?
- **Impacto**: medio (SOP de cobro).
