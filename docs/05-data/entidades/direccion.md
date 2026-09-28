# Dirección de envío (`direcciones`)

**Qué representa**: datos de destino de un envío (a domicilio o a una sucursal del correo) para un cliente. 946 filas.

| Campo | Notas |
|---|---|
| `cliente_id` | FK (cascada) |
| `nombre`, `apellido`, `telefono`, `dni` | Del **destinatario** (puede no ser el cliente) |
| `provincia`, `localidad`, `domicilio`, `codigo_postal` | Validados contra `correo_sucursales`. En sucursal, `domicilio` = dirección de la sucursal. Valores faltantes: `'SIN DEFINIR'` / `'0000'`. |
| `codigo_sucursal_micorreo` | Código manual de sucursal MiCorreo (opcional) |
| `activa` | Siempre `true` al insertar; 🔶 no se desactivan las anteriores |

**Uso**: `ordenes.direccion_id` apunta a la dirección usada. Cada guardado en Envíos **inserta una nueva** fila; la orden apunta a la última. La tienda web también inserta.
**Consumidores**: CSV/worker MiCorreo, emparejamiento de nombres del PDF de seguimientos, perfil de cliente, historial.
