# Preguntas abiertas — Comercial, mockups y tienda web

### Q-MOCK-001
- **Módulo**: Mockups · **Estado**: parcial (análisis de datos hecho; falta confirmar en el repo de la web)
- **Pregunta**: 6.271 solicitudes web quedaron en `procesando`. ¿Son abandonos del generador web, errores, o un estado que la web no actualiza?
- **Impacto**: medio (métricas del embudo).
- Respuesta: No sabria decirte. Puede ser abandonos, errores o desactualizado. Todo depende de en que momoento sucedieron y si tienen archivo asignado. Por ejemplo, si ninguno tiene archivo asignado es mas probable que sean abandonos. Ahora si tienen muestra o archivo asignado no deberian ser abandonos. Aunque pendiente puede ser pendiente de compra, no se si se refiere a eso. No estoy seguro, habria que investigar mejor.

### Q-MOCK-002
- **Módulo**: Mockups · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Quién usa el generador de la app, en qué momento de la venta, y qué pasa si el cliente acepta?
- **Impacto**: bajo.
- Respuesta: El generador de muestras de la app se usa para hacer muestras rapidas para mis vendedores. Por ejemplo un cliente manda un logo en vez de ellos usar phosotshop directamente lo suben ahi y el generador de muestras devuelve la muestra con medidas y precios. Y se lo manda directo al cliente una vez que se confirma. Es una opcion para ahorra tiempo.

### Q-COM-001
- **Módulo**: Comercial · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Qué hace el equipo con la lista de Potenciales (llamar, escribir, nada)? ¿La prioridad caliente/tibio/frío refleja su criterio?
- **Impacto**: medio.
- Respuesta: La prioridad parece media aleatoria, no la usamos ya que no se sabe porque uno tiene esa prioridad y otro otra. No hay nada que indique que sea real eso de caliente frio tibio. No se de donde saca para etiquetarlos de esa forma. No se hace nada con esa lista. Esta la automatizacion que les envia un mensaje a los 10 minutos de que hicieron la muestra y no compraron.

### Q-COM-002
- **Módulo**: Comercial · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Los tiempos del contacto automático (10 minutos después del mockup, cooldown 7 días) y de recompra (2 meses, solo clientes con 1 compra) son los deseados?
- **Impacto**: medio.
- Respuesta: Si, esos son los tiempos ideales.

### Q-WEB-001
- **Módulo**: Tienda web · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Dónde está el repositorio de la tienda web y quién lo mantiene? ¿Hay un contrato de datos acordado y vigente?
- **Impacto**: alto (cambios de esquema pueden romper la otra app).
- Respuesta: Esta en Github, tambien deployado en vercel. Y base de datos en Supabase.

### Q-WEB-002
- **Módulo**: Tienda web · **Estado**: pendiente (revisar en el repo de la tienda web)
- **Pregunta**: ¿Qué hace la web con `pago_fallido`, `esperando_comprobante` y `abandonado`? ¿Cuándo se marca abandonado?
- **Impacto**: medio.
- Respuesta: No se que hace. Creo que esperando comprobante va a pagos pendientes. Pero no estoy seguro. Con los otros dos no se.

### Q-WEB-003
- **Módulo**: Tienda web · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿El markup de 15 % para pago con link/tarjeta y la seña de $20.000 son políticas vigentes?
- **Impacto**: medio.
- Respuesta: Si. (en la web la seña esta marcada como $30.000 en vez de $20.000, $20.000 usamos para las compras por whatsapp)

### Q-WEB-004
- **Módulo**: Meta · **Estado**: documentada (verificado con datos: sí, llega de menos)
- **Pregunta**: ¿Los eventos Purchase de pedidos de la app llegan a Meta con el valor correcto? La orden se inserta antes que sus ítems.
- **Evidencia**: `trg_meta_conversion_on_orden_insert` + `createOrder`. Verificable en `meta_conversion_log.valor_total`.
- **Impacto**: medio (atribución publicitaria).
- Respuesta:  No estoy seguro yo pensaba que si. Vos decis que esta mal hecho?
- **Verificación con datos (2026-09-28)**: sí, llega de menos. De 638 eventos de pedidos de la app, 108 se enviaron con un valor menor al total real del pedido (3 en cero); en promedio Meta recibió ~16 % menos. Causa: el evento se dispara al crear la orden, antes de que se carguen todos los diseños. Ver backlog B-06.

### Q-WEB-005
- **Módulo**: Tienda web · **Estado**: pendiente (hay código nuevo por revisar)
- **Pregunta**: ¿Qué pasa con pedidos "Internacional" (5 órdenes)? ¿Tienen un flujo de envío/pago distinto?
- **Impacto**: bajo.
- Respuesta: Esto lo estuve trabajando, pronto se actualiza en esta pc y lo podes revisar.

### Q-WEB-006
- **Módulo**: Tienda web · **Estado**: pendiente
- **Pregunta**: La web cobra una seña de **$30.000**, pero `confirm-web-order` y "Confirmar pago" usan **$20.000** como valor por defecto cuando el checkout no informa la seña. ¿La web siempre informa la seña en `notas_web`? (Si no, los pedidos web quedan con seña y restante mal calculados.)
- **Evidencia**: `DEFAULT_WEB_SENIA = 20_000` en `supabase/functions/confirm-web-order/index.ts`; `webOrderPayment.service.ts`.
- **Impacto**: medio.
