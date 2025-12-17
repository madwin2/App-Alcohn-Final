# Integración de Webhooks para Notificaciones de Pedidos

## Arquitectura Propuesta

Este documento describe cómo integrar el bot de WhatsApp con Supabase para enviar notificaciones automáticas a clientes cuando hay cambios en sus pedidos.

---

## 1. Endpoint para Recibir Webhooks

Agregar un endpoint POST en Express que reciba los datos de Supabase:

```javascript
// En index.js, después de los otros endpoints
app.use(express.json()); // Para parsear JSON del webhook

app.post('/webhook/pedido', async (req, res) => {
  try {
    const { numero_telefono, nombre, tipo_actualizacion, datos } = req.body;
    
    // Validar datos recibidos
    if (!numero_telefono || !tipo_actualizacion) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Normalizar número (formato WhatsApp: 5491123456789@c.us)
    const numeroNormalizado = normalizarNumero(numero_telefono);
    
    // Seleccionar plantilla según tipo de actualización
    const mensaje = generarMensaje(tipo_actualizacion, { nombre, ...datos });
    
    // Enviar mensaje
    await client.sendMessage(numeroNormalizado, mensaje);
    
    // Si hay imagen (foto del sello), enviarla también
    if (datos.imagen_url) {
      const media = MessageMedia.fromFilePath(datos.imagen_url);
      await client.sendMessage(numeroNormalizado, media, { caption: 'Tu sello está listo!' });
    }
    
    res.json({ success: true, mensaje: 'Notificación enviada' });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## 2. Sistema de Plantillas de Mensajes

Crear un archivo `plantillas.js` con mensajes preestablecidos:

```javascript
// plantillas.js
const PLANTILLAS = {
  pedido_confirmado: (datos) => `
Hola ${datos.nombre}! 👋

✅ Tu pedido ha sido confirmado!

📦 Detalles:
- Número de pedido: ${datos.numero_pedido}
- Fecha estimada de entrega: ${datos.fecha_entrega}

Gracias por confiar en nosotros!
  `.trim(),

  pedido_en_produccion: (datos) => `
Hola ${datos.nombre}! 🎨

Tu sello está en producción. Te mantendremos informado del progreso.

📦 Pedido: ${datos.numero_pedido}
  `.trim(),

  pedido_listo: (datos) => `
Hola ${datos.nombre}! 🎉

¡Tu sello está listo! 

📦 Número de seguimiento: ${datos.numero_seguimiento}
🔗 Rastrear: ${datos.url_seguimiento}

${datos.imagen_url ? '📸 Te enviamos una foto de tu sello terminado!' : ''}
  `.trim(),

  pedido_enviado: (datos) => `
Hola ${datos.nombre}! 📮

Tu pedido ha sido enviado por Correo Argentino.

📦 Número de seguimiento: ${datos.numero_seguimiento}
🔗 Rastrear: ${datos.url_seguimiento || 'https://www.correoargentino.com.ar/formularios/ondnc'}

Fecha de envío: ${datos.fecha_envio}
  `.trim()
};

function generarMensaje(tipo, datos) {
  const plantilla = PLANTILLAS[tipo];
  if (!plantilla) {
    throw new Error(`Tipo de actualización desconocido: ${tipo}`);
  }
  return plantilla(datos);
}

module.exports = { generarMensaje };
```

---

## 3. Normalización de Números

Función para convertir números a formato WhatsApp:

```javascript
function normalizarNumero(numero) {
  // Eliminar espacios, guiones, paréntesis
  let num = numero.replace(/[\s\-\(\)]/g, '');
  
  // Si empieza con +, quitarlo
  if (num.startsWith('+')) num = num.substring(1);
  
  // Si empieza con 0, quitarlo
  if (num.startsWith('0')) num = num.substring(1);
  
  // Si no empieza con 54 (código Argentina), agregarlo
  if (!num.startsWith('54')) num = '54' + num;
  
  // Agregar sufijo de WhatsApp
  return num + '@c.us';
}
```

---

## 4. Configuración en Supabase

En Supabase, crear un webhook que se dispare cuando cambie el estado de un pedido:

```sql
-- Ejemplo de función en Supabase que dispara el webhook
CREATE OR REPLACE FUNCTION notificar_cambio_pedido()
RETURNS TRIGGER AS $$
BEGIN
  -- Llamar a un webhook HTTP cuando cambia el estado
  PERFORM net.http_post(
    url := 'http://TU_SERVIDOR_HETZNER:3000/webhook/pedido',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := json_build_object(
      'numero_telefono', NEW.telefono_cliente,
      'nombre', NEW.nombre_cliente,
      'tipo_actualizacion', NEW.estado,
      'datos', json_build_object(
        'numero_pedido', NEW.id,
        'numero_seguimiento', NEW.numero_seguimiento,
        'url_seguimiento', NEW.url_seguimiento,
        'fecha_entrega', NEW.fecha_entrega,
        'fecha_envio', NEW.fecha_envio,
        'imagen_url', NEW.imagen_sello_url
      )
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que se dispara cuando cambia el estado
CREATE TRIGGER trigger_notificar_pedido
AFTER UPDATE OF estado ON pedidos
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION notificar_cambio_pedido();
```

---

## 5. Envío de Imágenes

Si necesitas enviar imágenes desde URLs:

```javascript
const { MessageMedia } = require('whatsapp-web.js');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function enviarImagenDesdeURL(numero, urlImagen, caption) {
  // Descargar imagen temporalmente
  const tempPath = path.join(__dirname, 'temp', `imagen_${Date.now()}.jpg`);
  
  // Asegurar que existe la carpeta temp
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'));
  }
  
  // Descargar imagen
  const file = fs.createWriteStream(tempPath);
  https.get(urlImagen, (response) => {
    response.pipe(file);
    file.on('finish', async () => {
      file.close();
      
      // Enviar imagen
      const media = MessageMedia.fromFilePath(tempPath);
      media.caption = caption;
      await client.sendMessage(numero, media);
      
      // Eliminar archivo temporal
      fs.unlinkSync(tempPath);
    });
  });
}
```

---

## 6. Estructura de Datos Esperada desde Supabase

El webhook esperaría recibir algo como:

```json
{
  "numero_telefono": "1123456789",
  "nombre": "Juan Pérez",
  "tipo_actualizacion": "pedido_listo",
  "datos": {
    "numero_pedido": "PED-12345",
    "numero_seguimiento": "CA123456789AR",
    "url_seguimiento": "https://www.correoargentino.com.ar/...",
    "fecha_entrega": "2024-01-15",
    "fecha_envio": "2024-01-10",
    "imagen_url": "https://tu-supabase.com/storage/v1/object/public/sellos/sello-123.jpg"
  }
}
```

### Tipos de Actualización Disponibles:

- `pedido_confirmado`: Cuando se confirma un nuevo pedido
- `pedido_en_produccion`: Cuando el pedido entra en producción
- `pedido_listo`: Cuando el sello está terminado y listo
- `pedido_enviado`: Cuando se envía el pedido por correo

---

## 7. Seguridad (Opcional pero Recomendado)

Agregar autenticación al webhook:

```javascript
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // En .env

app.post('/webhook/pedido', async (req, res) => {
  // Verificar token de seguridad
  const token = req.headers['x-webhook-token'];
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  // ... resto del código
});
```

Y en Supabase, agregar el header en la llamada HTTP:

```sql
headers := json_build_object(
  'Content-Type', 'application/json',
  'x-webhook-token', 'TU_SECRET_TOKEN_AQUI'
)::jsonb
```

---

## Resumen del Flujo

1. **Supabase**: Cambio en la tabla `pedidos` → Trigger → Webhook HTTP
2. **Bot**: Recibe POST en `/webhook/pedido` con datos del pedido
3. **Bot**: Selecciona plantilla según `tipo_actualizacion`
4. **Bot**: Rellena plantilla con datos (nombre, número de seguimiento, etc.)
5. **Bot**: Normaliza número de teléfono
6. **Bot**: Envía mensaje de texto
7. **Bot**: Si hay `imagen_url`, descarga y envía la imagen
8. **Bot**: Responde 200 OK a Supabase

---

## Notas Importantes

- El servidor debe estar accesible desde internet para que Supabase pueda hacer el POST
- Considera usar HTTPS si es posible (con un proxy reverso como nginx)
- Los números de teléfono deben estar en formato argentino (con o sin código de país)
- Las imágenes se descargan temporalmente y luego se eliminan
- Considera agregar logging para rastrear qué mensajes se enviaron y cuáles fallaron
- Puedes agregar reintentos automáticos si el envío falla


