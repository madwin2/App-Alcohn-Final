# Implementación de Restante a Pagar en Webhooks de Fotos

## Cambios en el Webhook `pedido_listo`

El webhook ahora incluye información sobre el restante a pagar. El bot debe generar mensajes diferentes según el caso.

## Estructura del Webhook Actualizada

```json
{
  "numero_telefono": "2234468196",
  "nombre": "Juan",
  "tipo_actualizacion": "pedido_listo",
  "datos": {
    "numero_pedido": "uuid-del-pedido",
    "numero_seguimiento": "88",
    "url_seguimiento": "https://www.andreani.com/#!/envios/88",
    "imagen_url": "https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/...",
    "diseno_nombre": "Sello Personalizado",
    "restante_a_pagar": 1809.00,
    "restante_sello": 9.00,
    "costo_envio": 1800.00,
    "tipo_mensaje_restante": "total_orden",
    "es_ultimo_sello": true,
    "total_sellos": 1,
    "sellos_con_foto": 1,
    "tiene_envio_seleccionado": true
  }
}
```

## Campos Nuevos

- **`restante_a_pagar`**: El monto que debe mostrar en el mensaje (puede ser restante del sello + envío, o total de la orden)
- **`restante_sello`**: Restante del sello individual (valor - seña)
- **`costo_envio`**: Costo de envío si está seleccionado
- **`tipo_mensaje_restante`**: Indica qué tipo de mensaje mostrar:
  - `"total_orden"`: Es el último sello, mostrar total de la orden
  - `"restante_con_envio"`: Hay envío seleccionado, mostrar restante del sello + envío
  - `"restante_sin_envio"`: No hay envío, mostrar solo restante del sello y preguntar servicio
- **`es_ultimo_sello`**: `true` si es el último sello que faltaba foto
- **`total_sellos`**: Total de sellos en la orden
- **`sellos_con_foto`**: Cantidad de sellos que ya tienen foto
- **`tiene_envio_seleccionado`**: `true` si hay empresa y tipo de envío seleccionados

## Lógica de Mensajes

### Caso 1: Es el Último Sello (`es_ultimo_sello: true`)

**Mensaje:** Mostrar el total a pagar de toda la orden (ya incluye envío si está seleccionado).

```
Hola {nombre}! 🎉

¡Tu sello está listo! 

📸 Te enviamos una foto de tu sello terminado.

💰 Total a pagar: ${restante_a_pagar}

[Enviar imagen]
```

### Caso 2: No es el Último Sello + Hay Envío Seleccionado (`tiene_envio_seleccionado: true`)

**Mensaje:** Mostrar restante del sello + costo de envío.

```
Hola {nombre}! 🎉

¡Tu sello está listo! 

📸 Te enviamos una foto de tu sello terminado.

💰 Restante a pagar: ${restante_a_pagar}
   (Sello: ${restante_sello} + Envío: ${costo_envio})

[Enviar imagen]
```

### Caso 3: No es el Último Sello + NO Hay Envío Seleccionado (`tiene_envio_seleccionado: false`)

**Mensaje:** Mostrar solo restante del sello y preguntar qué servicio de envío quiere.

```
Hola {nombre}! 🎉

¡Tu sello está listo! 

📸 Te enviamos una foto de tu sello terminado.

💰 Restante del sello: ${restante_sello}

🚚 ¿Qué servicio de envío preferís?
   - Domicilio (Correo Argentino / Andreani / Via Cargo)
   - Sucursal (Correo Argentino / Andreani / Via Cargo)
   - Retiro en el local

[Enviar imagen]
```

## Ejemplo de Implementación en el Bot

```javascript
function generarMensajePedidoListo(nombre, datos) {
  const { 
    restante_a_pagar, 
    restante_sello, 
    costo_envio,
    tipo_mensaje_restante,
    es_ultimo_sello,
    tiene_envio_seleccionado
  } = datos;
  
  let mensaje = `Hola ${nombre}! 🎉\n\n`;
  mensaje += `¡Tu sello está listo!\n\n`;
  mensaje += `📸 Te enviamos una foto de tu sello terminado.\n\n`;
  
  // Generar mensaje según el tipo
  if (es_ultimo_sello) {
    // Caso 1: Último sello - mostrar total de la orden
    mensaje += `💰 Total a pagar: $${restante_a_pagar.toFixed(2)}`;
  } else if (tiene_envio_seleccionado) {
    // Caso 2: Hay envío seleccionado
    mensaje += `💰 Restante a pagar: $${restante_a_pagar.toFixed(2)}\n`;
    mensaje += `   (Sello: $${restante_sello.toFixed(2)} + Envío: $${costo_envio.toFixed(2)})`;
  } else {
    // Caso 3: No hay envío - preguntar servicio
    mensaje += `💰 Restante del sello: $${restante_sello.toFixed(2)}\n\n`;
    mensaje += `🚚 ¿Qué servicio de envío preferís?\n`;
    mensaje += `   - Domicilio (Correo Argentino / Andreani / Via Cargo)\n`;
    mensaje += `   - Sucursal (Correo Argentino / Andreani / Via Cargo)\n`;
    mensaje += `   - Retiro en el local`;
  }
  
  return mensaje;
}
```

## Notas Importantes

1. **Formato de números**: Usar `.toFixed(2)` para mostrar siempre 2 decimales (ej: `$9.00`)

2. **Múltiples sellos**: Cuando hay varios sellos, el bot recibirá un webhook por cada sello que se complete. Solo en el último se envía el total de la orden.

3. **Envío no seleccionado**: Cuando `tiene_envio_seleccionado: false`, el mensaje debe preguntar qué servicio quiere. El cliente deberá responder y luego se actualizará el envío en Supabase (esto se maneja fuera del webhook).

4. **Imagen**: Siempre enviar la imagen junto con el mensaje usando `imagen_url`.

## Pruebas

Para probar, el webhook incluye estos campos que puedes usar para debug:

```javascript
console.log('Tipo mensaje:', datos.tipo_mensaje_restante);
console.log('Es último sello:', datos.es_ultimo_sello);
console.log('Tiene envío:', datos.tiene_envio_seleccionado);
console.log('Restante a pagar:', datos.restante_a_pagar);
```

## Ejemplo de Webhook Recibido

```json
{
  "numero_telefono": "2234468196",
  "nombre": "Juan",
  "tipo_actualizacion": "pedido_listo",
  "datos": {
    "numero_pedido": "44607514-5f78-4540-b23b-d2014cf4a89b",
    "numero_seguimiento": "88",
    "url_seguimiento": "https://www.andreani.com/#!/envios/88",
    "imagen_url": "https://dgbyrejfcqearevvzdmf.supabase.co/storage/v1/object/public/foto/...",
    "diseno_nombre": "Sello Personalizado",
    "restante_a_pagar": 1809.00,
    "restante_sello": 9.00,
    "costo_envio": 1800.00,
    "tipo_mensaje_restante": "total_orden",
    "es_ultimo_sello": true,
    "total_sellos": 1,
    "sellos_con_foto": 1,
    "tiene_envio_seleccionado": true
  }
}
```

Este ejemplo corresponde al **Caso 1** (último sello), por lo que el mensaje debe mostrar: `💰 Total a pagar: $1809.00`


