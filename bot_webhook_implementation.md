# Implementación del Endpoint de Webhook para el Bot de WhatsApp

## Objetivo

Implementar el endpoint `/webhook/pedido` que recibe notificaciones de Supabase y envía mensajes automáticos a los clientes vía WhatsApp.

---

## Endpoint a Crear

**Ruta:** `POST /webhook/pedido`  
**Puerto:** 3000  
**IP:** 188.245.218.22

---

## Estructura de Datos que Recibirá

El endpoint recibirá JSON con esta estructura:

```json
{
  "numero_telefono": "1123456789",
  "nombre": "Juan Pérez",
  "tipo_actualizacion": "pedido_enviado" | "pedido_listo",
  "datos": {
    "numero_pedido": "uuid-del-pedido",
    "numero_seguimiento": "CA123456789AR",
    "url_seguimiento": "https://www.correoargentino.com.ar/formularios/ondnc",
    "fecha_envio": "2024-01-15",
    "empresa_envio": "Correo Argentino",
    "imagen_url": "https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/ruta-imagen.jpg",
    "diseno_nombre": "Sello Personalizado"
  }
}
```

---

## Tipos de Actualización

### 1. `pedido_enviado` (Estado de envío = "Despachado")
- Se envía cuando el estado de envío cambia a "Despachado" y hay número de seguimiento
- **Datos disponibles:** `numero_pedido`, `numero_seguimiento`, `url_seguimiento`, `fecha_envio`, `empresa_envio`
- **No incluye:** `imagen_url`

### 2. `pedido_listo` (Foto del sello subida)
- Se envía cuando se sube una foto del sello (`foto_sello`)
- **Datos disponibles:** `numero_pedido`, `numero_seguimiento`, `url_seguimiento`, `imagen_url`, `diseno_nombre`
- **Incluye:** `imagen_url` (URL completa de la imagen en Supabase Storage)

---

## Implementación del Endpoint

### Código Base para Express

```javascript
// En index.js, después de los otros endpoints
app.use(express.json()); // Si no está ya configurado

app.post('/webhook/pedido', async (req, res) => {
  try {
    const { numero_telefono, nombre, tipo_actualizacion, datos } = req.body;
    
    // Validar datos recibidos
    if (!numero_telefono || !tipo_actualizacion || !nombre) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Normalizar número de teléfono
    const numeroNormalizado = normalizarNumero(numero_telefono);
    
    // Generar mensaje según el tipo de actualización
    let mensaje;
    let imagenUrl = null;
    
    if (tipo_actualizacion === 'pedido_enviado') {
      mensaje = generarMensajeDespachado(nombre, datos);
    } else if (tipo_actualizacion === 'pedido_listo') {
      mensaje = generarMensajePedidoListo(nombre, datos);
      imagenUrl = datos.imagen_url; // URL de la imagen a enviar
    } else {
      return res.status(400).json({ error: 'Tipo de actualización desconocido' });
    }
    
    // Enviar mensaje de texto
    const mensajeEnviado = await client.sendMessage(numeroNormalizado, mensaje);
    
    let imagenEnviada = false;
    // Si hay imagen, descargarla y enviarla
    if (imagenUrl) {
      try {
        await enviarImagenDesdeURL(numeroNormalizado, imagenUrl, 'Tu sello está listo! 📸');
        imagenEnviada = true;
      } catch (error) {
        console.error('Error al enviar imagen:', error);
        // Continuar aunque falle la imagen, el mensaje de texto ya se envió
      }
    }
    
    // Responder con éxito
    res.status(200).json({ 
      success: true, 
      mensaje: 'Notificación enviada',
      mensaje_id: mensajeEnviado.id?._serialized || null,
      imagen_enviada: imagenEnviada
    });
  } catch (error) {
    console.error('Error en webhook:', error);
    // Responder con error pero incluir detalles útiles
    res.status(500).json({ 
      success: false,
      error: error.message,
      tipo: error.name || 'Error desconocido'
    });
  }
});
```

---

## Funciones Auxiliares Necesarias

### 1. Normalización de Números

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

### 2. Generar Mensaje para "Despachado"

```javascript
function generarMensajeDespachado(nombre, datos) {
  return `Hola ${nombre}! 📮

Tu pedido ha sido enviado por ${datos.empresa_envio || 'Correo Argentino'}.

📦 Número de seguimiento: ${datos.numero_seguimiento || 'N/A'}
🔗 Rastrear: ${datos.url_seguimiento || 'N/A'}

Fecha de envío: ${datos.fecha_envio || 'N/A'}`;
}
```

### 3. Generar Mensaje para "Pedido Listo"

```javascript
function generarMensajePedidoListo(nombre, datos) {
  let mensaje = `Hola ${nombre}! 🎉

¡Tu sello está listo! `;

  if (datos.numero_seguimiento) {
    mensaje += `
📦 Número de seguimiento: ${datos.numero_seguimiento}
🔗 Rastrear: ${datos.url_seguimiento || 'N/A'}`;
  }

  mensaje += `

📸 Te enviamos una foto de tu sello terminado!`;

  return mensaje;
}
```

### 4. Enviar Imagen desde URL

```javascript
const { MessageMedia } = require('whatsapp-web.js');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function enviarImagenDesdeURL(numero, urlImagen, caption) {
  // Crear carpeta temp si no existe
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempPath = path.join(tempDir, `imagen_${Date.now()}.jpg`);
  
  return new Promise((resolve, reject) => {
    // Descargar imagen
    const file = fs.createWriteStream(tempPath);
    
    https.get(urlImagen, (response) => {
      // Verificar que sea una imagen
      if (!response.headers['content-type']?.startsWith('image/')) {
        file.close();
        fs.unlinkSync(tempPath);
        return reject(new Error('URL no es una imagen válida'));
      }
      
      response.pipe(file);
      
      file.on('finish', async () => {
        file.close();
        
        try {
          // Enviar imagen
          const media = MessageMedia.fromFilePath(tempPath);
          media.caption = caption;
          await client.sendMessage(numero, media);
          
          // Eliminar archivo temporal
          fs.unlinkSync(tempPath);
          resolve();
        } catch (error) {
          // Eliminar archivo temporal incluso si falla
          fs.unlinkSync(tempPath);
          reject(error);
        }
      });
    }).on('error', (error) => {
      file.close();
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      reject(error);
    });
  });
}
```

---

## Manejo de Errores

- **400 Bad Request:** Si faltan datos requeridos o el tipo de actualización es desconocido
- **500 Internal Server Error:** Si hay error al enviar el mensaje o descargar la imagen
- **200 OK:** Si todo se envió correctamente

---

## Logging Recomendado

```javascript
// Al inicio del endpoint
console.log(`[WEBHOOK] Recibido: ${tipo_actualizacion} para ${nombre} (${numero_telefono})`);

// Después de enviar mensaje
console.log(`[WEBHOOK] Mensaje enviado exitosamente a ${numeroNormalizado}`);

// Si hay error
console.error(`[WEBHOOK] Error enviando a ${numeroNormalizado}:`, error);
```

---

## Pruebas

### Probar con curl:

```bash
# Probar pedido_enviado
curl -X POST http://188.245.218.22:3000/webhook/pedido \
  -H "Content-Type: application/json" \
  -d '{
    "numero_telefono": "1123456789",
    "nombre": "Juan Pérez",
    "tipo_actualizacion": "pedido_enviado",
    "datos": {
      "numero_pedido": "test-123",
      "numero_seguimiento": "CA123456789AR",
      "url_seguimiento": "https://www.correoargentino.com.ar/formularios/ondnc",
      "fecha_envio": "2024-01-15",
      "empresa_envio": "Correo Argentino"
    }
  }'

# Probar pedido_listo (con imagen)
curl -X POST http://188.245.218.22:3000/webhook/pedido \
  -H "Content-Type: application/json" \
  -d '{
    "numero_telefono": "1123456789",
    "nombre": "Juan Pérez",
    "tipo_actualizacion": "pedido_listo",
    "datos": {
      "numero_pedido": "test-123",
      "numero_seguimiento": "CA123456789AR",
      "url_seguimiento": "https://www.correoargentino.com.ar/formularios/ondnc",
      "imagen_url": "https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/ruta-imagen.jpg",
      "diseno_nombre": "Sello Personalizado"
    }
  }'
```

---

## Checklist de Implementación

- [ ] Crear endpoint `POST /webhook/pedido`
- [ ] Implementar función `normalizarNumero()`
- [ ] Implementar función `generarMensajeDespachado()`
- [ ] Implementar función `generarMensajePedidoListo()`
- [ ] Implementar función `enviarImagenDesdeURL()`
- [ ] Agregar manejo de errores
- [ ] Agregar logging
- [ ] Probar con curl
- [ ] Verificar que las imágenes se descarguen y envíen correctamente
- [ ] Verificar que los números se normalicen correctamente

---

## Notas Importantes

1. **Números de teléfono:** El bot debe normalizar cualquier formato a `5491123456789@c.us`
2. **Imágenes:** Las URLs de Supabase Storage son públicas, pero verificar que sean accesibles
3. **Errores:** Si falla el envío, registrar el error pero responder 200 OK a Supabase para evitar reintentos infinitos (o implementar lógica de reintentos)
4. **Seguridad:** Considerar agregar autenticación con header `x-webhook-token` en el futuro
5. **Carpeta temp:** Asegurarse de que la carpeta `temp/` exista y tenga permisos de escritura

---

## Estructura de Archivos Sugerida

```
bot/
├── index.js (agregar endpoint aquí)
├── utils/
│   ├── normalizarNumero.js
│   └── mensajes.js (plantillas de mensajes)
├── handlers/
│   └── webhookHandler.js (lógica del webhook)
└── temp/ (carpeta para imágenes temporales, agregar a .gitignore)
```

---

## Respuesta del Bot (Importante)

El bot **DEBE** responder con un JSON que indique el éxito o fallo del envío:

### Respuesta Exitosa (200 OK):
```json
{
  "success": true,
  "mensaje": "Notificación enviada",
  "mensaje_id": "3EB0C767F26AF3B4C",
  "imagen_enviada": true
}
```

### Respuesta de Error (500):
```json
{
  "success": false,
  "error": "Error al enviar mensaje",
  "tipo": "Error"
}
```

**Nota:** Supabase registrará el `status_code` y el `response_body` en la tabla `webhook_logs` para que puedas verificar si el mensaje se envió correctamente.

---

## Consultar Logs de Webhooks en Supabase

Para verificar si los mensajes se enviaron correctamente, puedes consultar los logs:

### SQL para ver logs recientes:
```sql
-- Ver últimos 50 logs
SELECT * FROM get_webhook_logs(50);

-- Ver solo logs exitosos
SELECT * FROM get_webhook_logs(50, NULL, true);

-- Ver logs de una orden específica
SELECT * FROM get_webhook_logs(50, 'uuid-de-la-orden'::uuid);

-- Ver logs con errores
SELECT * FROM webhook_logs 
WHERE success = false 
ORDER BY created_at DESC 
LIMIT 20;
```

### Ver detalles completos de un log:
```sql
SELECT 
  created_at,
  tipo_actualizacion,
  nombre,
  numero_telefono,
  status_code,
  success,
  error_message,
  response_body,
  datos
FROM webhook_logs
WHERE id = 'uuid-del-log';
```

---

## Ejemplo Completo de Implementación

Ver `webhook.md` en el proyecto del bot para referencia completa de la estructura esperada.

