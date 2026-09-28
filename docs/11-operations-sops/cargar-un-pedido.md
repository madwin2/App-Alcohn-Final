# SOP (esqueleto) · Cargar un pedido manual

> Workflow: [WF-01](../03-workflows/WF-01-alta-manual-de-pedido.md)

1. Requisito único obligatorio: **seña cobrada** ($20.000; $30.000 si es XL). Diseño y medida pueden completarse después (no es lo ideal).
2. Alcohn AI → Pedidos → **Nuevo pedido**.
3. Cliente: nombre, apellido, teléfono (con código de área), email si lo hay. Tildar "no enviar confirmación" cuando no conviene el mensaje fijo de "acabamos de subir tu pedido" (p. ej. el cliente lo pidió hace días).
4. Diseños: por cada ítem, tipo, nombre, medida (largo × corto), valor y seña (se sugiere el precio de lista), empresa/servicio de envío si ya se sabe, prioridad y fecha límite si corresponde, archivo base del cliente (y vector si ya existe, preferentemente **SVG**).
5. Crear. Verificar en la tabla.
6. Un envío por pedido: si el cliente necesita envíos distintos, cargar órdenes distintas.
