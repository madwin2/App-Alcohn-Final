# Solución al Problema de Conectividad de Webhooks

## Problema Identificado

Supabase está enviando los webhooks correctamente (se ven en `webhook_logs` con `request_id`), pero el bot **NO está recibiendo** los webhooks cuando cambias el estado desde el frontend.

## Causa Probable

Supabase Cloud no puede alcanzar el bot en `http://188.245.218.22:3000` debido a:
- Firewall bloqueando conexiones entrantes
- IP privada o no accesible públicamente  
- Restricciones de red saliente de Supabase Cloud

## Soluciones

### Opción 1: Verificar Accesibilidad del Bot (Más Simple)

1. **Verificar que el bot esté accesible públicamente:**
   ```bash
   # Desde otra máquina o servicio online, probar:
   curl http://188.245.218.22:3000/webhook/pedido
   ```

2. **Verificar firewall:**
   - Asegurarse de que el puerto 3000 esté abierto en el firewall del servidor
   - Verificar reglas de firewall en el servidor (iptables, ufw, etc.)

3. **Verificar que el bot esté escuchando en todas las interfaces:**
   ```javascript
   // En el bot, asegurarse de que Express escuche en 0.0.0.0, no solo localhost
   app.listen(3000, '0.0.0.0', () => {
     console.log('Bot escuchando en puerto 3000');
   });
   ```

### Opción 2: Usar HTTPS (Recomendado)

Si Supabase requiere HTTPS, configurar un proxy reverso con nginx o usar un servicio como Cloudflare Tunnel.

### Opción 3: Usar Supabase Edge Function (Más Robusto)

Crear una Edge Function de Supabase que haga el webhook. Las Edge Functions tienen mejor conectividad de red.

**Pasos:**
1. Crear Edge Function `enviar-webhook-pedido`
2. Modificar los triggers para llamar a la Edge Function en lugar de hacer HTTP directo
3. La Edge Function hará el webhook al bot

## Verificación Rápida

Para verificar si el problema es de conectividad, ejecutar desde el servidor del bot:

```bash
# Ver si el bot está escuchando
netstat -tuln | grep 3000

# Ver logs del bot en tiempo real
tail -f /ruta/al/log/del/bot.log
```

Luego cambiar el estado a "Despachado" desde el frontend y ver si aparece algo en los logs del bot.

## Próximos Pasos

1. Verificar accesibilidad del bot desde internet
2. Revisar firewall del servidor
3. Verificar logs del bot cuando se cambia el estado
4. Si no funciona, implementar Edge Function de Supabase




