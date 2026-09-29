# 10. Comercial Web

[← Volver al índice](README.md)

Muestra todo lo que pasa en la **tienda web**: visitas, muestras, compras, pagos pendientes y clientes. Desde acá se **confirman los pagos por transferencia** de la web, se contacta a potenciales clientes y se siguen los mensajes automáticos. Se llega desde **Comercial Web** en el menú. El número rojo del menú cuenta los pagos web nuevos desde la última vez que entraste.

## Arriba de todo

- **Período**: **Últimos 7 días**, **Últimos 30 días**, **Últimos 90 días** o **Personalizado** (**Desde** / **Hasta**).
- Origen: **Solo web**, **Solo app** o **Todos**.
- **Exportar**: baja la lista de potenciales en CSV.

## Pestañas

### Potenciales

Tres listas:

| Lista | Qué es | Qué hacer |
|---|---|---|
| **Pagos pendientes** | Compras web confirmadas sin pago cerrado (por ejemplo, transferencias con comprobante) | **Confirmar el pago** (ver abajo) |
| **Muestras sin compra** | Gente que generó una muestra en la web y no compró | El bot les escribe solo ~10 minutos después. Si querés forzar el mensaje, tocá el ícono del **avión** |
| **Contacto sin muestra** | Dejaron sus datos en la web pero no pidieron muestra | Contactarlos si corresponde |

Se puede filtrar por país y buscar por nombre o teléfono.

Otras acciones en cada fila:
- **Enviar mensaje comercial por WhatsApp** (avión): manda el mensaje automático de contacto.
- Ícono de WhatsApp: abre el chat para escribirle vos.
- **Papelera** (**Excluir de Comercial Web**): para pruebas o registros que no sirven. Deja de aparecer, no cuenta en las métricas y los mensajes automáticos lo saltean.

La columna **Prioridad** (caliente, tibio, frío) no se usa.

### Confirmar un pago de la web

Cuando un cliente de la web pagó por transferencia:

1. En **Pagos pendientes**, abrí **Confirmar pago y crear pedido**.
2. Mirá la **Muestra al cliente** y el comprobante. Si dice que **no hay comprobante**, confirmá solo si verificaste el pago por otro medio.
3. **Diseño**: el nombre con el que va a figurar en Pedidos y Producción. Completalo si quedó vacío.
4. **Monto de la seña recibida**: revisalo. En la web la seña es **$30.000**.
5. Tocá **Confirmar pago**.

🤖 El pedido pasa a ser un pedido válido: aparece en **Pedidos** y **Producción**, al cliente le llega la confirmación por WhatsApp y se registra la venta para la publicidad de Meta.

### Resumen

Gráficos del período: **Embudo de conversión** (del tráfico a la venta pagada), **Contactos vs ventas**, **Visitantes / día**, **Muestras / día**, **Ventas web / día**, **Materiales solicitados**, **Estados de pago web** y el **KPI estrella** (cuántas muestras terminadas se convirtieron en venta).

### Seguimientos

El mensaje automático de **recompra**: a los clientes que compraron **una sola vez**, hace **2 meses o más** y ya recibieron su envío, se les escribe para ofrecerles volver a comprar. Una vez por cliente.

- Muestra **Elegibles restantes**, **Enviados hoy**, **Últimos 7 días**, **Últimos 30 días** y el **Próximo automático** (lunes a viernes 12:26, hora Argentina; 10 clientes por día).
- **Historial de seguimientos**: a quién se le mandó y cuándo.
- Se puede mandar un lote a mano.

### Tráfico

Visitas de la tienda web: **Page views**, **Clicks WhatsApp**, **Formularios enviados**, **Páginas más visitadas**, **Top campañas (UTM)** y **Eventos recientes**.

### Clientes

**Directorio de clientes web**: personas que usaron la tienda, con su **Etapa** (solo contacto, con muestra, checkout, comprador, recurrente), cantidad de **Mockups** y **Compras**, **Valor total** y **Última actividad**. Clic en un cliente: **Detalle del cliente** con su recorrido (contacto, muestra, checkout, pedido, pago).
