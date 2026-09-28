# Workflows transversales

Procesos que atraviesan varios módulos, reconstruidos desde el código. Cada uno indica actor, pasos, cambios de estado, automatizaciones, decisiones humanas, integraciones, resultado y excepciones. Lo que ocurre fuera del software está marcado ❓ y enlazado a [fronteras](../10-operational-boundaries/README.md).

| ID | Workflow | Módulos | Inicio → fin |
|---|---|---|---|
| [WF-01](WF-01-alta-manual-de-pedido.md) | Alta manual de pedido | Pedidos, Precios, WhatsApp | Acuerdo con cliente → orden Señado + WhatsApp |
| [WF-02](WF-02-pedido-web.md) | Pedido de la tienda web | Tienda web, Comercial, Pedidos, Meta | Checkout → pago confirmado → sellos creados |
| [WF-03](WF-03-diseno-y-vectorizacion.md) | Diseño y vectorización | Pedidos/Producción, Vectorización | Archivo base → SVG + medida de fabricación |
| [WF-04](WF-04-programa-y-fabricacion-cnc.md) | Programa y fabricación CNC | Programas, Aspire (gadget), Producción | Sellos vectorizados → Hecho |
| [WF-05](WF-05-foto-y-cobro.md) | Foto del sello y cobro | Pedidos, WhatsApp, Envíos | Hecho → Foto → Transferido |
| [WF-06](WF-06-envio-correo-argentino.md) | Envío por Correo Argentino | Envíos, MiCorreo, Pedidos, WhatsApp, Stock | Transferido → Seguimiento Enviado |
| [WF-07](WF-07-envio-andreani.md) | Envío por Andreani | Envíos, Andreani, WhatsApp, Stock | Foto → link pagado → Seguimiento Enviado |
| [WF-08](WF-08-rehacer.md) | Rehacer | Pedidos/Producción, Programas, Envíos | Falla detectada → sello prioritario de nuevo |
| [WF-09](WF-09-mockup-y-contacto-comercial.md) | Mockup y contacto comercial | Mockups, Comercial, WhatsApp | Logo del cliente → mockups + cotización → contacto |
| [WF-10](WF-10-recompra.md) | Seguimiento de recompra | Comercial, cron, WhatsApp | Pedido entregado hace 2 meses → mensaje |
| [WF-11](WF-11-stock-y-reposicion.md) | Stock y reposición | Stock, Inicio, Notificaciones | Despacho → descuento → tarea de reposición |
| [WF-12](WF-12-deudores.md) | Deudores | cron, Pedidos, Notificaciones | Foto sin pago 10 días → Deudor |
| [WF-13](WF-13-alta-de-usuario.md) | Alta de usuario | Login, DB, Configuración | Registro → aprobación → áreas |

Diagrama global: [00-overview/ciclo-de-vida-del-pedido.md](../00-overview/ciclo-de-vida-del-pedido.md).
