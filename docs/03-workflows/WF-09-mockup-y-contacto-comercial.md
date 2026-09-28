# WF-09 · Mockup y contacto comercial

| | |
|---|---|
| **Inicio** | (a) Un potencial cliente manda su logo por WhatsApp/redes; (b) un visitante usa el generador de muestras de la tienda web. |
| **Actores** | 🔶 Ventas (a); visitante web (b); cron; bot. |
| **Módulos** | Mockups, Comercial Web, Precios, WhatsApp |
| **Resultado** | Cliente recibe imágenes del sello en cuero/madera con precios; si no compra, recibe un contacto comercial automático. |

## Camino (a) — desde la app

1. Mockups → nueva tarjeta: imagen del logo (archivo o pegar), WhatsApp, ancho (o alternativas 4/6/8 cm), materiales.
2. ✅ Sistema: crea la solicitud, valida la imagen, optimiza con IA (OpenAI) o localmente, sugiere nombre, mide el trazo, cotiza con la tabla de Precios → `pendiente_aprobacion`.
3. Decisión humana: revisar; opcional "Simplificar con IA"; elegir qué medidas van en el mensaje.
4. Generar mockups → `completado` → WhatsApp `mockups_listos` con imágenes y precios.
5. ❓ Seguir la conversación por WhatsApp; si compra → WF-01 (el pedido puede vincularse al mockup).

## Camino (b) — desde la tienda web

1. 🔶 El generador web crea `mockup_solicitudes` `origen='web'` y (si hay datos) cliente con WhatsApp/email.
2. ✅ Al quedar `completado`/`pendiente_aprobacion`, trigger programa `contacto_comercial_eligible_at = ahora + 10 min`.
3. ✅ Cron cada 2 min (`procesar_contactos_comerciales_pendientes`, hasta 15 por corrida): si el mockup sigue sin orden, no está excluido y el teléfono **no** fue contactado en los últimos 7 días → WhatsApp `generador_muestras_contacto`; si fue contactado → marca "omitido (cooldown 7 días)".
4. Comercial Web → Potenciales muestra estos casos con prioridad; se puede contactar a mano o excluir.
5. Si compra → WF-02.

## Preguntas

[Q-MOCK-*, Q-COM-*](../14-open-questions/comercial-web.md), [Q-WA-003](../14-open-questions/whatsapp-bot.md#q-wa-003) (volumen anómalo de envíos).
