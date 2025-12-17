# Guía de Implementación de Webhooks para Notificaciones de Pedidos

Este documento describe los pasos necesarios para implementar webhooks que notifiquen automáticamente a los clientes vía WhatsApp cuando ocurren eventos específicos en sus pedidos.

---

## Eventos a Implementar

1. **Estado de Envío = "Despachado"** con número de seguimiento
2. **Subida de Foto del Sello** (foto_sello)

---

## 1. Información del Bot de WhatsApp

### Configuración Confirmada:

1. **URL del endpoint del bot:**
   - **URL:** `http://188.245.218.22:3000/webhook/pedido`
   - **Protocolo:** HTTP
   - **Puerto:** 3000
   - **IP del servidor:** 188.245.218.22

2. **Formato de datos esperado:**
   - **Formato:** JSON
   - **Headers requeridos:** `Content-Type: application/json`
   - **Header opcional (recomendado):** `x-webhook-token` para autenticación

3. **Manejo de números de teléfono:**
   - El bot acepta números en cualquier formato común
   - Normaliza automáticamente a formato WhatsApp: `5491123456789@c.us`
   - Puede recibir: `1123456789`, `+5491123456789`, `011-2345-6789`, etc.

4. **Envío de imágenes:**
   - Acepta URLs de imágenes desde Supabase Storage
   - El bot descarga la imagen temporalmente y la envía
   - Formatos aceptados: JPG, PNG, WebP

5. **Autenticación:**
   - Actualmente NO implementada, pero se recomienda agregar
   - Header sugerido: `x-webhook-token` con valor configurable

6. **Mensajes específicos:**
   - Ver sección 7 para los mensajes exactos

---

## 2. Estructura de Datos para el Bot

### Evento 1: Estado de Envío = "Despachado"

**Tipo de actualización:** `pedido_enviado`

```json
{
  "numero_telefono": "1123456789",
  "nombre": "Juan Pérez",
  "tipo_actualizacion": "pedido_enviado",
  "datos": {
    "numero_pedido": "uuid-del-pedido",
    "numero_seguimiento": "CA123456789AR",
    "url_seguimiento": "https://www.correoargentino.com.ar/formularios/ondnc",
    "fecha_envio": "2024-01-15",
    "empresa_envio": "Correo Argentino"
  }
}
```

### Evento 2: Foto del Sello Subida

**Tipo de actualización:** `pedido_listo`

```json
{
  "numero_telefono": "1123456789",
  "nombre": "Juan Pérez",
  "tipo_actualizacion": "pedido_listo",
  "datos": {
    "numero_pedido": "uuid-del-pedido",
    "numero_seguimiento": "CA123456789AR",
    "url_seguimiento": "https://www.correoargentino.com.ar/formularios/ondnc",
    "imagen_url": "https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/[ruta-completa]",
    "diseno_nombre": "Sello Personalizado"
  }
}
```

---

## 3. Implementación en Supabase

### Paso 1: Crear Función para Enviar Webhook

```sql
-- Función para enviar webhook HTTP
CREATE OR REPLACE FUNCTION enviar_webhook_pedido(
  p_tipo_actualizacion TEXT,
  p_numero_telefono TEXT,
  p_nombre TEXT,
  p_datos JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url_webhook TEXT := 'http://188.245.218.22:3000/webhook/pedido';
  v_token_seguridad TEXT := 'CONFIGURAR_DESPUES_DE_IMPLEMENTAR'; -- Configurar cuando el bot tenga autenticación
BEGIN
  -- Enviar webhook usando pg_net (extensión de Supabase)
  PERFORM net.http_post(
    url := v_url_webhook,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
      -- 'x-webhook-token', v_token_seguridad  -- Descomentar cuando se implemente autenticación
    ),
    body := jsonb_build_object(
      'numero_telefono', p_numero_telefono,
      'nombre', p_nombre,
      'tipo_actualizacion', p_tipo_actualizacion,
      'datos', p_datos
    )::text
  );
END;
$$;
```

### Paso 2: Trigger para Estado de Envío = "Despachado"

```sql
-- Función que se ejecuta cuando cambia el estado de envío
CREATE OR REPLACE FUNCTION trigger_envio_despachado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente RECORD;
  v_url_seguimiento TEXT;
BEGIN
  -- Solo procesar si el nuevo estado es "Despachado" y tiene número de seguimiento
  IF NEW.estado_envio = 'Despachado' 
     AND OLD.estado_envio IS DISTINCT FROM NEW.estado_envio
     AND NEW.seguimiento IS NOT NULL 
     AND NEW.seguimiento != '' THEN
    
    -- Obtener datos del cliente
    SELECT 
      c.nombre,
      c.apellido,
      c.telefono
    INTO v_cliente
    FROM clientes c
    WHERE c.id = NEW.cliente_id;
    
    -- Construir URL de seguimiento según la empresa
    IF NEW.empresa_envio = 'Correo Argentino' THEN
      v_url_seguimiento := 'https://www.correoargentino.com.ar/formularios/ondnc';
    ELSIF NEW.empresa_envio = 'Andreani' THEN
      v_url_seguimiento := 'https://www.andreani.com/#!/envios/' || NEW.seguimiento;
    ELSIF NEW.empresa_envio = 'Via Cargo' THEN
      v_url_seguimiento := 'https://www.viacargo.com.ar/seguimiento';
    ELSE
      v_url_seguimiento := NULL;
    END IF;
    
    -- Si encontramos el cliente y tiene teléfono, enviar webhook
    IF v_cliente.telefono IS NOT NULL AND v_cliente.nombre IS NOT NULL THEN
      PERFORM enviar_webhook_pedido(
        'pedido_enviado',
        v_cliente.telefono,
        v_cliente.nombre || ' ' || COALESCE(v_cliente.apellido, ''),
        jsonb_build_object(
          'numero_pedido', NEW.id::text,
          'numero_seguimiento', NEW.seguimiento,
          'url_seguimiento', COALESCE(v_url_seguimiento, ''),
          'fecha_envio', TO_CHAR(NEW.updated_at, 'YYYY-MM-DD'),
          'empresa_envio', COALESCE(NEW.empresa_envio, '')
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger en la tabla ordenes
CREATE TRIGGER trigger_envio_despachado
AFTER UPDATE OF estado_envio, seguimiento ON ordenes
FOR EACH ROW
EXECUTE FUNCTION trigger_envio_despachado();
```

### Paso 3: Trigger para Foto del Sello Subida

```sql
-- Función que se ejecuta cuando se sube una foto del sello
CREATE OR REPLACE FUNCTION trigger_foto_sello_subida()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente RECORD;
  v_orden RECORD;
  v_url_foto TEXT;
  v_url_seguimiento TEXT;
BEGIN
  -- Solo procesar si se agregó una nueva foto (antes era NULL o vacío)
  IF NEW.foto_sello IS NOT NULL 
     AND NEW.foto_sello != ''
     AND (OLD.foto_sello IS NULL OR OLD.foto_sello = '' OR OLD.foto_sello != NEW.foto_sello) THEN
    
    -- Obtener datos del cliente y orden
    SELECT 
      o.id as orden_id,
      o.seguimiento,
      o.empresa_envio,
      o.updated_at,
      c.nombre,
      c.apellido,
      c.telefono,
      s.diseno
    INTO v_orden
    FROM sellos s
    JOIN ordenes o ON o.id = s.orden_id
    JOIN clientes c ON c.id = o.cliente_id
    WHERE s.id = NEW.id;
    
    -- Construir URL completa de la imagen
    -- Supabase Storage URLs tienen formato: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
    -- Si foto_sello ya es una URL completa, usarla directamente
    -- Si es solo el path, construir la URL completa
    IF NEW.foto_sello LIKE 'http%' THEN
      v_url_foto := NEW.foto_sello;
    ELSE
      -- Extraer el path de la URL si está en formato completo de Supabase
      -- o construir la URL completa si es solo el path relativo
      IF NEW.foto_sello LIKE '%/storage/%' THEN
        v_url_foto := NEW.foto_sello;
      ELSE
        v_url_foto := 'https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/' || NEW.foto_sello;
      END IF;
    END IF;
    
    -- Construir URL de seguimiento si existe
    IF v_orden.seguimiento IS NOT NULL AND v_orden.seguimiento != '' THEN
      IF v_orden.empresa_envio = 'Correo Argentino' THEN
        v_url_seguimiento := 'https://www.correoargentino.com.ar/formularios/ondnc';
      ELSIF v_orden.empresa_envio = 'Andreani' THEN
        v_url_seguimiento := 'https://www.andreani.com/#!/envios/' || v_orden.seguimiento;
      ELSIF v_orden.empresa_envio = 'Via Cargo' THEN
        v_url_seguimiento := 'https://www.viacargo.com.ar/seguimiento';
      ELSE
        v_url_seguimiento := NULL;
      END IF;
    END IF;
    
    -- Si encontramos la orden y tiene teléfono, enviar webhook
    IF v_orden.telefono IS NOT NULL AND v_orden.nombre IS NOT NULL THEN
      PERFORM enviar_webhook_pedido(
        'pedido_listo',
        v_orden.telefono,
        v_orden.nombre || ' ' || COALESCE(v_orden.apellido, ''),
        jsonb_build_object(
          'numero_pedido', v_orden.orden_id::text,
          'numero_seguimiento', COALESCE(v_orden.seguimiento, ''),
          'url_seguimiento', COALESCE(v_url_seguimiento, ''),
          'imagen_url', v_url_foto,
          'diseno_nombre', COALESCE(v_orden.diseno, 'Sello')
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger en la tabla sellos
CREATE TRIGGER trigger_foto_sello_subida
AFTER UPDATE OF foto_sello ON sellos
FOR EACH ROW
EXECUTE FUNCTION trigger_foto_sello_subida();
```

---

## 4. Verificación de Extensión pg_net

Antes de ejecutar las funciones, verificar que la extensión `pg_net` esté habilitada:

```sql
-- Verificar si existe la extensión
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- Si no existe, habilitarla (requiere permisos de superusuario)
CREATE EXTENSION IF NOT EXISTS pg_net;
```

**Nota**: En Supabase Cloud, `pg_net` puede estar disponible o no. Si no está disponible, necesitarás usar una Edge Function de Supabase en su lugar.

---

## 5. Alternativa: Usar Supabase Edge Functions

Si `pg_net` no está disponible, crear una Edge Function que haga el webhook:

### Edge Function: `enviar-webhook-pedido`

```typescript
// supabase/functions/enviar-webhook-pedido/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const WEBHOOK_URL = Deno.env.get('WEBHOOK_BOT_URL') || 'http://TU_SERVIDOR:3000/webhook/pedido';
const WEBHOOK_TOKEN = Deno.env.get('WEBHOOK_TOKEN') || 'TU_TOKEN_AQUI';

serve(async (req) => {
  try {
    const { tipo_evento, numero_telefono, nombre_cliente, datos } = await req.json();
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-token': WEBHOOK_TOKEN,
      },
      body: JSON.stringify({
        tipo_evento,
        numero_telefono,
        nombre_cliente,
        datos
      })
    });
    
    return new Response(
      JSON.stringify({ success: response.ok }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

Y modificar las funciones SQL para llamar a la Edge Function:

```sql
-- Modificar función para usar Edge Function
CREATE OR REPLACE FUNCTION enviar_webhook_pedido(
  p_tipo_evento TEXT,
  p_numero_telefono TEXT,
  p_nombre_cliente TEXT,
  p_datos JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url_edge_function TEXT := 'https://dgbyrejfcqearevvzdmf.supabase.co/functions/v1/enviar-webhook-pedido';
  v_anon_key TEXT := 'TU_ANON_KEY_AQUI'; -- Reemplazar con tu anon key
BEGIN
  PERFORM net.http_post(
    url := v_url_edge_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'tipo_evento', p_tipo_evento,
      'numero_telefono', p_numero_telefono,
      'nombre_cliente', p_nombre_cliente,
      'datos', p_datos
    )::text
  );
END;
$$;
```

---

## 6. Checklist de Implementación

### En Supabase:
- [ ] Verificar si `pg_net` está disponible o usar Edge Functions
- [ ] Crear función `enviar_webhook_pedido`
- [ ] Crear trigger `trigger_envio_despachado` en tabla `ordenes`
- [ ] Crear trigger `trigger_foto_sello_subida` en tabla `sellos`
- [ ] Probar triggers con datos de prueba
- [ ] Configurar variables de entorno (URL del bot, token)

### En el Bot de WhatsApp:
- [ ] Confirmar URL del endpoint
- [ ] Confirmar formato de datos esperado
- [ ] Implementar endpoint `/webhook/pedido`
- [ ] Manejar evento `envio_despachado`
- [ ] Manejar evento `foto_sello_subida`
- [ ] Implementar descarga y envío de imágenes desde URLs
- [ ] Implementar normalización de números de teléfono
- [ ] Configurar mensajes específicos para cada evento
- [ ] Agregar logging para debugging

---

## 7. Mensajes para el Bot

### Mensaje para "pedido_enviado" (Despachado):
```
Hola {nombre}! 📮

Tu pedido ha sido enviado por Correo Argentino.

📦 Número de seguimiento: {numero_seguimiento}
🔗 Rastrear: {url_seguimiento}

Fecha de envío: {fecha_envio}
```

### Mensaje para "pedido_listo" (con foto):
```
Hola {nombre}! 🎉

¡Tu sello está listo! 

📦 Número de seguimiento: {numero_seguimiento}
🔗 Rastrear: {url_seguimiento}

📸 Te enviamos una foto de tu sello terminado!
```

**Mensaje que acompañará la imagen (caption):**
```
Tu sello está listo! 📸
```

---

## 8. Pruebas

### Probar Trigger de Despachado:
```sql
-- Actualizar una orden a "Despachado" con número de seguimiento
UPDATE ordenes 
SET estado_envio = 'Despachado', 
    seguimiento = 'CA123456789AR'
WHERE id = 'uuid-de-una-orden-existente';
```

### Probar Trigger de Foto:
```sql
-- Actualizar un sello con una foto
UPDATE sellos 
SET foto_sello = 'ruta/a/foto.jpg'
WHERE id = 'uuid-de-un-sello-existente';
```

---

## 9. Troubleshooting

### Si el webhook no se envía:
1. Verificar logs de Supabase (Dashboard → Logs)
2. Verificar que `pg_net` esté habilitado o usar Edge Functions
3. Verificar que la URL del bot sea accesible desde internet
4. Verificar formato de número de teléfono
5. Verificar que el token de seguridad coincida

### Si el bot no recibe el webhook:
1. Verificar que el endpoint esté escuchando en el puerto correcto
2. Verificar logs del bot
3. Verificar firewall/red del servidor
4. Probar con curl/Postman directamente

---

## 10. Seguridad

- [ ] Usar HTTPS si es posible
- [ ] Implementar token de autenticación
- [ ] Validar datos recibidos en el bot
- [ ] Limitar rate limiting para evitar spam
- [ ] Logging de eventos para auditoría

---

## Notas Finales

- Los triggers se ejecutan automáticamente cuando ocurren los eventos
- Los webhooks son asíncronos (no bloquean la operación principal)
- Considera agregar reintentos si el webhook falla
- Los números de teléfono deben estar en formato argentino (con código de país 54)
- Las URLs de imágenes deben ser accesibles públicamente desde Supabase Storage

