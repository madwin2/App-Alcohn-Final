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
