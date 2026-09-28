# WF-10 · Seguimiento de recompra

| | |
|---|---|
| **Inicio** | Cron `comercial-seguimientos-clientes` — lunes a viernes 15:26 UTC (🔶 12:26 hora Argentina). También botón "enviar lote" en Comercial Web. |
| **Actor** | Sistema. |
| **Resultado** | WhatsApp `seguimiento_cliente_recompra` a clientes elegibles; registro en `comercial_cliente_seguimientos`. |

## Elegibilidad (✅ vista `v_comercial_clientes_seguimiento_elegibles`)

- El cliente tiene **exactamente una** orden (la más reciente).
- Esa orden está `estado_orden='Transferido'` y `estado_envio='Seguimiento Enviado'`.
- Fue creada hace **≥ 2 meses**.
- Tiene teléfono.
- No recibió antes este seguimiento.
- No está excluido (cliente u orden en `comercial_exclusiones`).

## Pasos

1. `procesar_seguimientos_clientes_pendientes(10, 'cron')`: toma hasta 10 elegibles **al azar**.
2. Por cada uno: `enviar_webhook_pedido('seguimiento_cliente_recompra', …)` con el primer nombre, e INSERT en `comercial_cliente_seguimientos` (una vez por cliente y tipo).
3. ❓ Qué dice el mensaje y qué pasa con la respuesta → lo define el bot externo → [Q-WA-002](../14-open-questions/whatsapp-bot.md#q-wa-002).

## Observación

Hay 640 seguimientos registrados y 660 webhooks de este tipo. Clientes con más de una orden nunca son elegibles.
