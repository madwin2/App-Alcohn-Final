# Reglas de negocio

Solo reglas **implementadas** (✅). Cada una indica **dónde vive** y **quién la hace cumplir**:

- **DB**: constraint, trigger o función de Postgres → se cumple para cualquier cliente (app, web, SQL).
- **Edge**: edge function / worker.
- **Servicio**: código TS en `src/lib/**` → solo si la acción pasa por ese servicio.
- **UI**: solo deshabilita o valida un control → cualquier otra vía la saltea.

Las reglas que el negocio podría tener pero que **no** están en el código se registran como preguntas en [14-open-questions](../14-open-questions/README.md), nunca acá.

| Archivo | Alcance | IDs |
|---|---|---|
| [pedidos-y-venta.md](pedidos-y-venta.md) | Alta, montos, estados de venta, cobro, deudores, web | BR-PED-*, BR-VEN-*, BR-WEB-* |
| [fabricacion.md](fabricacion.md) | Estados de fabricación, prioridad, rehacer, vector, medida | BR-FAB-*, BR-PROD-*, BR-VEC-* |
| [programas-y-material.md](programas-y-material.md) | Programas, máquinas, planchuelas, Aspire | BR-PROG-*, BR-MAT-* |
| [envios.md](envios.md) | Elegibilidad, datos, etiquetas, despacho, Andreani | BR-ENV-*, BR-COR-*, BR-AND-* |
| [precios-y-costos.md](precios-y-costos.md) | Cotización, precio link, costo de fabricación, costo de envío | BR-PRE-*, BR-COS-* |
| [stock.md](stock.md) | BOM, descuento, reposición | BR-STK-* |
| [mensajes-al-cliente.md](mensajes-al-cliente.md) | Cuándo y qué se le envía al cliente por WhatsApp | BR-WA-* |
| [notificaciones-y-usuarios.md](notificaciones-y-usuarios.md) | Destinatarios de notificaciones, acceso | BR-NOT-*, BR-USR-* |
| [politicas-confirmadas.md](politicas-confirmadas.md) | **Políticas confirmadas por el equipo**, con indicación de si están implementadas | POL-* |
