# Qué controla, qué registra y qué automatiza Alcohn AI

Clasificación de cada tramo de la operación según el rol que cumple el software. Útil para decidir dónde una mejora puede actuar y dónde depende de personas o sistemas externos.

| Tramo | Alcohn AI **controla** (bloquea o valida) | Alcohn AI **registra** (guarda lo que pasó) | Alcohn AI **automatiza** (hace solo) | Depende de acción **externa** |
|---|---|---|---|---|
| Venta / acuerdo con el cliente | — | Cliente, ítems, precio, seña, canal | Cotización sugerida desde la tabla de precios; WhatsApp "pedido registrado" | Conversación de venta, cobro de la seña ❓ |
| Pedido web | Oculta pedidos web no pagados | Carrito, pago, comprobante | Creación de ítems y WhatsApp al confirmarse el pago; evento a Meta | Checkout en la tienda web (otro sistema), validar comprobante (persona) |
| Diseño / vector | Advierte si el vector no es SVG; pide confirmar medida si difiere | Archivo base, base mejorada, vector, medida de fabricación | Vectorización por lotes (a pedido del usuario); medida automática si no hay desvío | Retoque de la imagen (herramienta externa ❓), revisión visual |
| Armado de programa | Elegibilidad por máquina/planchuela; largo máximo por planchuela; bloqueo manual | Programa, sellos asignados, eventos, material usado | Nombre automático; paquete para Aspire; sugerencia de armado | Decisión de qué fabricar hoy y en qué máquina ❓ |
| Aspire / CAM | — (el gadget valida escala) | Reporte del gadget, `.crv3d`, preview, tiempo de mecanizado, material real | Importación, posicionamiento, cajeado y recálculo dentro de Aspire (gadget) | Correr el gadget, guardar trayectorias, cargar la máquina ❓ |
| Mecanizado y terminación | — | Estado `Haciendo` / `Hecho` / `Rehacer` | Consumo de bronce y `tipo_planchuela` al marcar Hecho; prioridad al rehacer | Todo el trabajo físico ❓ |
| Foto y cobro | Venta editable solo si Hecho (solo UI) | Foto, estado de venta | WhatsApp con foto + restante; `Deudor` a los 10 días | Sacar la foto, cobrar la transferencia ❓ |
| Datos de envío | Provincia/localidad/sucursal deben existir en el padrón de Correo | Dirección, quién la cargó y cuándo | Parseo de texto (local + IA); pasa a Transferido; subida a MiCorreo y pago de etiqueta | Pedirle los datos al cliente ❓ |
| Etiqueta Correo | — | Estado de etiqueta, error | Subida y pago en MiCorreo (worker); PDF enriquecido para imprimir | Descargar el PDF del portal ❓, imprimir, pegar, llevar al correo ❓ |
| Etiqueta Andreani | Descarga solo si la venta está Transferido | Pool de links, etiquetas, asignaciones | Generación de links, sincronización de etiquetas y de estado del portal | El cliente paga el envío en Andreani; imprimir y entregar ❓ |
| Despacho y aviso | — | Seguimiento, fecha de seguimiento enviado | WhatsApp con seguimiento → `Seguimiento Enviado`; descuento de stock | Entrega física ❓ |
| Stock | — | Cantidades, movimientos | Descuento por envío; tareas de reposición y alertas | Comprar/recibir insumos ❓ |
| Post-venta | Exclusiones manuales | Seguimientos enviados | Contacto comercial a los 10 min de un mockup web; recompra a los 2 meses | Respuesta y negociación por WhatsApp ❓ |

## Lectura

- **Casi nada está "controlado" por la base de datos.** Las reglas de transición viven en la UI (y a veces solo como "deshabilitado" visual). Cualquier cliente con sesión puede escribir cualquier estado. Ver [06-state-machines](../06-state-machines/README.md) y [audits/arquitectura.md](../audits/observaciones-de-arquitectura.md).
- **Las automatizaciones críticas viven en Postgres** (triggers y pg_cron): avisos por WhatsApp, cambio a `Seguimiento Enviado`, deudores, stock, costos. Un cambio de estado hecho desde cualquier pantalla (o desde SQL) dispara los mismos efectos.
- **Varias automatizaciones dependen del navegador**: la cola de subida a MiCorreo vive en memoria (hay que dejar la pestaña abierta). La cola de revisión de vectores se persiste en IndexedDB del mismo navegador hasta confirmar.
