# Solución de Webhooks usando Supabase Edge Function

## Problema Identificado

Los webhooks enviados directamente desde los triggers de PostgreSQL en Supabase no estaban llegando al bot de WhatsApp debido a problemas de conectividad entre Supabase Cloud y el servidor del bot (188.245.218.22:3000).

## Solución Implementada

Se creó una **Supabase Edge Function** (`webhook-bot`) que actúa como intermediario entre los triggers de PostgreSQL y el bot de WhatsApp. Las Edge Functions tienen mejor conectividad saliente que los triggers de PostgreSQL.

## Arquitectura

```
Trigger PostgreSQL → enviar_webhook_pedido() → Edge Function → Bot WhatsApp
```

## Componentes Implementados

### 1. Edge Function (`webhook-bot`)

**Ubicación:** `https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/webhook-bot`

**Funcionalidad:**
- Recibe webhooks desde los triggers de PostgreSQL
- Reenvía los webhooks al bot de WhatsApp (`http://188.245.218.22:3000/webhook/pedido`)
- Maneja timeouts y errores de conexión
- Retorna respuestas del bot

**Código:** Ver `supabase/functions/webhook-bot/index.ts`

### 2. Función PostgreSQL Actualizada

La función `enviar_webhook_pedido()` ahora:
- Envía webhooks a la Edge Function en lugar de directamente al bot
- Usa el anon key de Supabase para autenticar la Edge Function
- Mantiene el logging en `webhook_logs`

### 3. Mecanismo de Reintento

Se creó la función `reintentar_webhooks_fallidos()` que:
- Reintenta webhooks fallidos hasta 3 veces
- Espera 5 minutos entre reintentos
- Solo reintenta webhooks de la última hora

## Configuración

### Variables de Entorno de la Edge Function

- `BOT_WEBHOOK_URL`: URL del bot (default: `http://188.245.218.22:3000/webhook/pedido`)
- `BOT_WEBHOOK_TIMEOUT`: Timeout en milisegundos (default: 10000)

### Autenticación

La Edge Function requiere autenticación con el anon key de Supabase:
```
Authorization: Bearer <anon_key>
```

El anon key está hardcodeado en la función `enviar_webhook_pedido()` por ahora.

## Pruebas

Para probar manualmente:

```sql
SELECT enviar_webhook_pedido(
  'pedido_enviado',
  '2234468196',
  'Test',
  jsonb_build_object(
    'numero_pedido', 'test-123',
    'numero_seguimiento', 'TEST-001',
    'url_seguimiento', 'https://test.com',
    'fecha_envio', '2025-12-15',
    'empresa_envio', 'Test'
  ),
  NULL,
  NULL
);
```

## Monitoreo

Los webhooks se registran en la tabla `webhook_logs` con:
- `request_id`: ID de la request HTTP
- `reintentos`: Número de reintentos realizados
- `ultimo_reintento`: Timestamp del último reintento
- `success`: Estado del webhook (NULL = pendiente, TRUE = éxito, FALSE = falló)

## Próximos Pasos

1. **Verificar que los webhooks lleguen al bot** - Confirmar con el otro Cursor que los webhooks de prueba (request_id 32, 33) llegaron al bot.

2. **Configurar cron job** (opcional) - Ejecutar `reintentar_webhooks_fallidos()` periódicamente:
   ```sql
   -- Ejecutar cada 5 minutos
   SELECT cron.schedule('reintentar-webhooks', '*/5 * * * *', 'SELECT reintentar_webhooks_fallidos()');
   ```

3. **Mejorar seguridad** (recomendado) - Mover el anon key a una variable de entorno o usar service_role key.

4. **Agregar logging adicional** - Registrar respuestas del bot en `webhook_logs`.

## Troubleshooting

### Los webhooks no llegan al bot

1. Verificar que la Edge Function esté activa:
   ```sql
   SELECT * FROM supabase_functions.functions WHERE name = 'webhook-bot';
   ```

2. Verificar logs de la Edge Function en Supabase Dashboard → Edge Functions → webhook-bot → Logs

3. Verificar que el bot esté accesible:
   ```bash
   curl http://188.245.218.22:3000/webhook/pedido
   ```

### Error 401 Unauthorized

- Verificar que el anon key en `enviar_webhook_pedido()` sea correcto
- Verificar que la Edge Function tenga `verify_jwt: true` (requiere autenticación)

### Timeout

- Aumentar el timeout en la Edge Function (`BOT_WEBHOOK_TIMEOUT`)
- Verificar conectividad entre Supabase y el bot




