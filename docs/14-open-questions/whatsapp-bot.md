# Preguntas abiertas — WhatsApp y bot

### Q-WA-001
- **Módulo**: WhatsApp Bot · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Cuál es el plan con la conexión de WhatsApp Business por Meta (migrar el bot a la API oficial)? ¿Qué falta para "vincularla con el servidor del bot"?
- **Impacto**: medio.
- Respuesta: Esta vinculado pasa que debe haber algo mal en la app de meta y aparece que no. Pero logramos vincularlo y esta funcionando.

### Q-WA-002
- **Módulo**: bot · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿Dónde están y quién mantiene los textos de cada mensaje (`pedido_registrado`, `pedido_listo`, etc.) y el código del bot?
- **Por qué importa**: sin eso no se puede documentar qué recibe el cliente.
- **Impacto**: alto.
- Respuesta: El bot esta en hetzner y la app de meta tiene plantillas que cargue yo tambien (las de utilidad y marketing)

### Q-WA-003
- **Módulo**: bot / cron · **Estado**: pendiente (requiere análisis técnico, ver backlog)
- **Pregunta**: En junio–julio 2026 hubo ~91.000 registros de contacto comercial para ~800 mockups. ¿Los clientes recibieron mensajes repetidos? Y hoy, con 30–50 % de webhooks marcados "fallidos" por timeout, ¿los mensajes llegan (y a veces duplicados por los reintentos) o realmente fallan?
- **Evidencia**: AUD-UND-003 (tabla por mes y errores de los últimos 30 días).
- **Impacto**: alto (experiencia del cliente, confiabilidad de "Seguimiento Enviado", riesgo de bloqueo de la cuenta de WhatsApp).
- Respuesta: Nose. 

### Q-WA-004
- **Módulo**: bot · **Estado**: documentada (2026-09-28)
- **Pregunta**: ¿El bot responde conversaciones o solo envía? ¿Quién atiende las respuestas de los clientes y desde qué número/dispositivo?
- **Impacto**: medio.
- Respuesta: Por ahora solo envia las cosas de webhook desde la app. Hay un agente Francisco, pero por ahora lo desactivamos. Falta ajustar algunas cosas.
- Respuesta (2026-09-30, Q-AST-009): Francisco está pausado porque "todavía no lograba parecer un vendedor sumamente real y cometía errores". Es un proyecto separado del asistente interno, aunque tengan puntos en común.

<a id="q-wa-005"></a>
### Q-WA-005
- **Módulo**: bot · **Estado**: pendiente
- **Pregunta**: ¿Qué comandos con `!` entiende el bot? Para cada uno: qué escribe en la base (tabla, estado), quién lo usa, desde qué número y qué pasa si se equivoca.
- **Contexto**: Cachi y Juli B contaron (2026-09-30) que mandan mensajes con `!` más palabras clave y el bot ejecuta acciones, por ejemplo cambiar el estado de un pedido.
- **Por qué importa**: es un segundo camino que escribe en la base sin pasar por Alcohn AI. Puede cambiar estados sin disparar los efectos que dispara la app, y cualquier diseño del asistente tiene que convivir con él.
- **Impacto**: alto.

<a id="q-wa-006"></a>
### Q-WA-006
- **Módulo**: bot / cron · **Estado**: pendiente
- **Pregunta**: El recordatorio a deudores (`recordatorio-pago-pendiente`) corre todos los jueves y le escribe a **todas** las órdenes en `Deudor`, sin límite de antigüedad. ¿Es lo buscado? La política decía "cada ~15 días". Al 2026-09-30 hay 23 órdenes en `Deudor`, la más vieja de enero de 2026. ¿La plantilla `recordatorio_pago_pendiente` ya existe en el bot?
- **Evidencia**: `cron.job` (creado después del 2026-09-27, no está en el repo); nunca corrió hasta el 2026-09-30.
- **Impacto**: medio (experiencia del cliente, riesgo de bloqueo de la cuenta de WhatsApp si muchos lo marcan como spam).

<a id="q-wa-007"></a>
### Q-WA-007
- **Módulo**: bot / WhatsApp · **Estado**: pendiente
- **Pregunta**: ¿Están listas las plantillas Meta `regalo_registrado` y `regalo_listo`, y el bot entiende `es_regalo` / `tipo_pedido` en el payload?
- **Contexto**: Pedidos de regalo (PLAN_PEDIDOS_PRUEBA_Y_REGALO §5.6). Hasta que existan, el flag `VITE_REGALO_WHATSAPP_HABILITADO` (default apagado) evita enviar `regalo_*`. Los mensajes de ventas con un ítem regalo siguen saliendo con la plantilla actual (ítem en $0).
- **Por qué importa**: sin plantillas el cliente de un regalo aparte no recibe aviso; con plantillas mal armadas podría pedirle pago.
- **Impacto**: alto.
- **Dueño esperado**: Julián (plantillas Meta + bot en VPS).

