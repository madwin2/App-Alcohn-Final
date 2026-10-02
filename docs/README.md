# Base de conocimiento de Alcohn AI

Fuente de verdad sobre **cómo funciona realmente Alcohn AI** (la app interna de Alcohn): producto, módulos, procesos, reglas, datos, integraciones y lo que todavía no sabemos. Construida a partir del código y de la base de datos en vivo al **2026-09-27** (commit `aa0604d`).

> **Antes de leer**: cada afirmación está marcada ✅ (verificado en código/DB), 🔶 (inferencia) o ❓ (desconocido → pregunta abierta). Ver [convenciones](_meta/convenciones.md). Agentes: leer primero [`/AGENTS.md`](../AGENTS.md).

## Mapa

| # | Sección | Para qué |
|---|---|---|
| 00 | [**La empresa**](00-overview/la-empresa.md) · [Visión general](00-overview/README.md) · [Mapa del sistema](00-overview/mapa-del-sistema.md) · [Ciclo del pedido](00-overview/ciclo-de-vida-del-pedido.md) · [Qué controla/registra/automatiza](00-overview/control-registro-automatizacion.md) | Qué es Alcohn (visión, clientes, estrategia, marca) y Alcohn AI en 15 minutos |
| 01 | [Producto](01-product/README.md) · [Equipo](01-product/equipo.md) | Actores, quién hace qué, productos, máquinas, planchuelas |
| 02 | [Módulos](02-modules/README.md) | Inventario y documentación de cada módulo |
| 03 | [Workflows](03-workflows/README.md) | Procesos de punta a punta (WF-01…WF-13) |
| 04 | [Reglas de negocio](04-business-rules/README.md) · [Políticas confirmadas](04-business-rules/politicas-confirmadas.md) | Reglas implementadas (BR) y políticas del equipo (POL) |
| 05 | [Datos](05-data/README.md) | Entidades, relaciones, storage, nombres engañosos |
| 06 | [Máquinas de estado](06-state-machines/README.md) | Estados, transiciones, quién las controla |
| 07 | [Integraciones](07-integrations/README.md) | WhatsApp bot, MiCorreo, Andreani, Aspire, Vectorizer.AI, OpenAI, Meta, tienda web |
| 08 | [Automatizaciones](08-automations/README.md) | Triggers, cron, edge functions, colas del navegador |
| 09 | [Roles y permisos](09-roles-permissions/README.md) | Quién puede qué (spoiler: casi todos todo) |
| 10 | [Fronteras Alcohn AI ↔ mundo real](10-operational-boundaries/README.md) | Dónde termina el software y empieza el trabajo físico o externo |
| 11 | [Operación y SOPs](11-operations-sops/README.md) | Esqueletos de procedimientos + scripts + despliegue |
| 12 | [Arquitectura](12-architecture/README.md) · [Base de datos](12-architecture/base-de-datos.md) | Stack, estructura, patrones, cómo verificar la DB |
| 13 | [Decisiones](13-decisions/README.md) | ADR reconstruidos |
| 14 | [Preguntas abiertas](14-open-questions/README.md) | 110 preguntas: 97 documentadas, 13 abiertas o parciales |
| 15 | [Glosario](15-glossary/README.md) | Términos propios y ambigüedades |
| 16 | [Backlog](16-backlog/README.md) | Mejoras y correcciones identificadas, priorizadas |
| — | [**Manual de uso**](manual/README.md) | Manual para el equipo, pantalla por pantalla, en lenguaje de usuario |
| — | [Auditorías](audits/README.md) | Inconsistencias, código muerto, comportamientos sorprendentes, arquitectura, seguridad |
| — | [Mantenimiento de esta base](_meta/mantenimiento.md) | Cómo mantenerla viva |

## Índice para agentes (context routing)

Cargar **solo** lo necesario según el área de la tarea. Siempre sumar: [la empresa](00-overview/la-empresa.md) (si la tarea es de negocio, proceso o texto al cliente), [convenciones](_meta/convenciones.md), [equipo](01-product/equipo.md) y [políticas confirmadas](04-business-rules/politicas-confirmadas.md), [glosario](15-glossary/README.md) (si hay términos dudosos) y [inconsistencias de nombres](05-data/inconsistencias-de-nombres.md) (si se tocan datos).

| Si la tarea toca… | Leer módulo | Workflows | Reglas | Datos / estados | Integraciones / otros |
|---|---|---|---|---|---|
| **Programas** (armar, gadget, Aspire) | [programas](02-modules/programas/README.md), [gadget-aspire](02-modules/programas/gadget-aspire.md) | [WF-04](03-workflows/WF-04-programa-y-fabricacion-cnc.md), [WF-03](03-workflows/WF-03-diseno-y-vectorizacion.md), [WF-08](03-workflows/WF-08-rehacer.md) | [programas-y-material](04-business-rules/programas-y-material.md), [fabricacion](04-business-rules/fabricacion.md) | [programa](05-data/entidades/programa.md), [sello](05-data/entidades/sello.md), [SM programa](06-state-machines/programa.md), [SM fabricación](06-state-machines/fabricacion.md) | [aspire](07-integrations/aspire.md), [FR-03/04](10-operational-boundaries/README.md#fr-03), [Q-PROG](14-open-questions/programas.md), [Q-CNC](14-open-questions/produccion-fabricacion.md) |
| **Producción** (tabla de ítems) | [produccion](02-modules/produccion/README.md) | WF-04, WF-08 | [fabricacion](04-business-rules/fabricacion.md) | [sello](05-data/entidades/sello.md), [SM fabricación](06-state-machines/fabricacion.md) | [Q-PROD](14-open-questions/produccion-fabricacion.md) |
| **Vectorización / medida** | [vectorizacion](02-modules/vectorizacion/README.md), [medida](02-modules/vectorizacion/medida-de-fabricacion.md) | [WF-03](03-workflows/WF-03-diseno-y-vectorizacion.md) | [fabricacion](04-business-rules/fabricacion.md) (BR-VEC) | [SM vectorización](06-state-machines/vectorizacion.md), [storage](05-data/storage.md) | [vectorizer-ai](07-integrations/vectorizer-ai.md), [cloudconvert](07-integrations/cloudconvert.md), [Q-VEC](14-open-questions/vectorizacion.md) |
| **Pedidos** (alta, tabla, fotos, seguimientos) | [pedidos](02-modules/pedidos/README.md), [fotos-y-seguimientos](02-modules/pedidos/fotos-y-seguimientos.md), [rehacer](02-modules/pedidos/rehacer.md), [errores](02-modules/errores/README.md) | [WF-01](03-workflows/WF-01-alta-manual-de-pedido.md), [WF-05](03-workflows/WF-05-foto-y-cobro.md), [WF-08](03-workflows/WF-08-rehacer.md) | [pedidos-y-venta](04-business-rules/pedidos-y-venta.md), [mensajes-al-cliente](04-business-rules/mensajes-al-cliente.md) | [orden](05-data/entidades/orden.md), [sello](05-data/entidades/sello.md), [cliente](05-data/entidades/cliente.md), [SM venta](06-state-machines/venta.md) | [whatsapp-bot](07-integrations/whatsapp-bot.md), [Q-PED](14-open-questions/pedidos.md), [Q-VEN](14-open-questions/ventas-cobros.md) |
| **Cobros / venta / deudores** | [pedidos](02-modules/pedidos/README.md), [economia-gastos](02-modules/economia-gastos/README.md) | [WF-05](03-workflows/WF-05-foto-y-cobro.md), [WF-12](03-workflows/WF-12-deudores.md) | [pedidos-y-venta](04-business-rules/pedidos-y-venta.md) | [SM venta](06-state-machines/venta.md) | [FR-06](10-operational-boundaries/README.md#fr-06) |
| **Envíos – Correo Argentino** | [envios](02-modules/envios/README.md), [padrón](02-modules/envios/padron-y-datos-de-envio.md) | [WF-06](03-workflows/WF-06-envio-correo-argentino.md) | [envios](04-business-rules/envios.md) | [orden](05-data/entidades/orden.md), [direccion](05-data/entidades/direccion.md), [SM envío](06-state-machines/envio.md) | [micorreo](07-integrations/micorreo.md), [FR-07](10-operational-boundaries/README.md#fr-07), [Q-ENV/Q-COR](14-open-questions/envios.md) |
| **Envíos – Andreani** | [envios](02-modules/envios/README.md) | [WF-07](03-workflows/WF-07-envio-andreani.md) | [envios](04-business-rules/envios.md) (BR-AND) | [andreani](05-data/entidades/andreani.md), [SM andreani](06-state-machines/andreani.md) | [andreani](07-integrations/andreani.md), [FR-08](10-operational-boundaries/README.md#fr-08) |
| **Mensajes de WhatsApp** | — | WF-01, WF-05, WF-06, WF-09, WF-10 | [mensajes-al-cliente](04-business-rules/mensajes-al-cliente.md) | [registros](05-data/entidades/registros.md) | [whatsapp-bot](07-integrations/whatsapp-bot.md), [cron](08-automations/cron.md), [Q-WA](14-open-questions/whatsapp-bot.md) |
| **Tienda web / pagos web** | [tienda-web](02-modules/tienda-web/README.md), [comercial](02-modules/comercial/README.md) | [WF-02](03-workflows/WF-02-pedido-web.md) | [pedidos-y-venta](04-business-rules/pedidos-y-venta.md) (BR-WEB) | [SM pago web](06-state-machines/pago-web.md) | [tienda-web](07-integrations/tienda-web.md), [meta](07-integrations/meta.md), [Q-WEB](14-open-questions/comercial-web.md) |
| **Mockups / comercial** | [mockups](02-modules/mockups/README.md), [comercial](02-modules/comercial/README.md) | [WF-09](03-workflows/WF-09-mockup-y-contacto-comercial.md), [WF-10](03-workflows/WF-10-recompra.md) | [mensajes-al-cliente](04-business-rules/mensajes-al-cliente.md) | [mockup-solicitud](05-data/entidades/mockup-solicitud.md) | [openai](07-integrations/openai.md) |
| **Stock** | [stock](02-modules/stock/README.md), [inicio](02-modules/inicio/README.md) | [WF-11](03-workflows/WF-11-stock-y-reposicion.md) | [stock](04-business-rules/stock.md) | [stock-y-bronce](05-data/entidades/stock-y-bronce.md) | [Q-STK](14-open-questions/stock.md) |
| **Precios / costos / economía** | [precios](02-modules/precios/README.md), [economia-gastos](02-modules/economia-gastos/README.md) | — | [precios-y-costos](04-business-rules/precios-y-costos.md) | [catalogos-y-parametros](05-data/entidades/catalogos-y-parametros.md) | [Q-ECO](14-open-questions/economia.md) |
| **Notificaciones** | [notificaciones](02-modules/notificaciones/README.md) | — | [notificaciones-y-usuarios](04-business-rules/notificaciones-y-usuarios.md) | — | [cron](08-automations/cron.md) |
| **Centro Alcohn / ayuda** | [centro-informacion](02-modules/centro-informacion/README.md) | — | — | — | [openai](07-integrations/openai.md), [ADR-023](13-decisions/ADR-023-centro-alcohn-catalogo-compartido.md), [manual ch.16](manual/16-centro-alcohn.md) |
| **Mi perfil / equipo** | [perfil](02-modules/perfil/README.md) | — | [políticas POL-038+](04-business-rules/politicas-confirmadas.md) | [equipo](05-data/entidades/equipo.md), [usuarios](05-data/entidades/usuarios.md) | [09](09-roles-permissions/README.md), [notificaciones](02-modules/notificaciones/README.md), [Q-EQ](14-open-questions/equipo.md), [`PLAN_PAGINA_PERSONAL.md`](../PLAN_PAGINA_PERSONAL.md) |
| **Usuarios / permisos / seguridad** | [configuracion-usuarios](02-modules/configuracion-usuarios/README.md) | [WF-13](03-workflows/WF-13-alta-de-usuario.md) | [notificaciones-y-usuarios](04-business-rules/notificaciones-y-usuarios.md) | [usuarios](05-data/entidades/usuarios.md) | [09](09-roles-permissions/README.md), [seguridad](audits/seguridad.md) |
| **Esquema de DB / triggers** | — | — | todas las reglas "DB" | [05-data](05-data/README.md), [06](06-state-machines/README.md) | [triggers](08-automations/triggers.md), [base-de-datos](12-architecture/base-de-datos.md) |
| **Infraestructura / despliegue** | — | — | — | — | [12](12-architecture/README.md), [despliegue](11-operations-sops/despliegue.md), [Q-ARQ](14-open-questions/arquitectura.md) |

## Documentos previos en la raíz del repo

Los `PLAN_*.md`, `PROPUESTA_*.md`, `*-web.md`, `notificaciones-*.md`, `ANALISIS_*.md` son **planes de diseño** (historia de decisiones), no descripción del estado actual. Esta base los cita cuando explican el porqué; si contradicen al código, manda el código (y la contradicción se registra en auditorías).
