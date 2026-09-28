# Inventario de módulos

Módulos funcionales detectados en el código (no solo los del menú). Cada uno tiene su carpeta con documentación propia.

## 1. Módulos con pantalla

| Módulo | Ruta | Estado | Doc |
|---|---|---|---|
| Inicio (dashboard personal) | `/` | Activo | [inicio](inicio/README.md) |
| Pedidos | `/pedidos` | Activo, núcleo | [pedidos](pedidos/README.md) |
| Envíos (Correo, Andreani, Vía Cargo) | `/envios`, `/envios/:carrier` | Activo, núcleo | [envios](envios/README.md) |
| Historial de envíos | `/envios/historial` | Activo | [envios/historial.md](envios/historial.md) |
| Producción | `/produccion` | Activo | [produccion](produccion/README.md) |
| Programas | `/programas` | Activo, **muy reciente** (4 programas en la base; desde 2026-09-05) | [programas](programas/README.md) |
| Vectorización | `/vectorizacion` | Activo, reciente (2026-09-15) | [vectorizacion](vectorizacion/README.md) |
| Stock | `/stock` | Activo | [stock](stock/README.md) |
| Generador de Mockups | `/mockups` | Activo | [mockups](mockups/README.md) |
| Comercial Web | `/comercial` | Activo | [comercial](comercial/README.md) |
| Precios | `/precios` | Activo (edición solo dueño) | [precios](precios/README.md) |
| Economía | `/economia` | Activo (menú solo dueño) | [economia-gastos](economia-gastos/README.md) |
| Gastos | `/gastos` | Activo (menú solo dueño) | [economia-gastos](economia-gastos/README.md) |
| Innovación | `/innovacion` | Activo, poco uso (2 proyectos, 23 tareas) | [innovacion](innovacion/README.md) |
| Configuración | `/configuracion` | Activo (solo áreas de notificación) | [configuracion-usuarios](configuracion-usuarios/README.md) |
| WhatsApp Bot | `/whatsapp` | Parcial: conecta con Meta pero no persiste ni vincula al bot | [whatsapp-bot](whatsapp-bot/README.md) |
| Login / registro | `/login` | Activo | [configuracion-usuarios](configuracion-usuarios/README.md) |
| Verificación | `/verificacion` (menú deshabilitado) | **No implementado** | [produccion](produccion/README.md#verificación) |

## 2. Módulos transversales (sin ruta propia)

| Módulo | Dónde vive | Doc |
|---|---|---|
| Notificaciones internas (campana) | `src/components/notificaciones`, tablas `notificaciones*`, cron | [notificaciones](notificaciones/README.md) |
| Tareas y post-its (dashboard, pedidos, producción) | `tareas`, `tareas_dashboard`, `tareas_pedidos_globales` | [plataforma](plataforma/README.md#tareas-y-post-its) |
| Novedades y aviso de versión | `src/components/global`, `lib/changelog`, `public/version.json` | [plataforma](plataforma/README.md#novedades-y-aviso-de-versión) |
| Vistas de tabla persistidas | `vistas_tabla`, `useTableViewPersistence` | [plataforma](plataforma/README.md#vistas-de-tabla) |
| Rehacer | `RehacerDialog`, RPC `registrar_rehacer` | [pedidos/rehacer.md](pedidos/rehacer.md) |
| Medida de fabricación | `FabricationSizeDialogHost`, `lib/programas/fabricationSize.ts` | [vectorizacion/medida-de-fabricacion.md](vectorizacion/medida-de-fabricacion.md) |
| Perfil de cliente | `ClienteProfileDialog`, `ClienteDetailDialog` | [pedidos](pedidos/README.md#perfil-de-cliente) |
| Pedidos web (integración tienda) | edge `confirm-web-order`, `webOrderPayment.service` | [tienda-web](tienda-web/README.md) |

## 3. Componentes fuera de la SPA

| Componente | Dónde | Doc |
|---|---|---|
| Gadgets de Aspire (C/G/XL) | `aspire-gadgets/*.lua` | [programas/gadget-aspire.md](programas/gadget-aspire.md) |
| Edge Function `programa-sync` | `supabase/functions/programa-sync` | [programas/gadget-aspire.md](programas/gadget-aspire.md) |
| Edge Function `webhook-bot` | `supabase/functions/webhook-bot` | [07-integrations/whatsapp-bot.md](../07-integrations/whatsapp-bot.md) |
| Edge Function `confirm-web-order` | `supabase/functions/confirm-web-order` | [tienda-web](tienda-web/README.md) |
| Edge Function `meta-conversion` | `supabase/functions/meta-conversion` | [07-integrations/meta.md](../07-integrations/meta.md) |
| micorreo-worker (Playwright) | `services/micorreo-worker` | [07-integrations/micorreo.md](../07-integrations/micorreo.md) |
| micorreo-api-worker (CLI, fase 1) | `services/micorreo-api-worker` | [07-integrations/micorreo.md](../07-integrations/micorreo.md#api-oficial-fase-1) |
| andreani-worker (Playwright) | `services/andreani-worker` | [07-integrations/andreani.md](../07-integrations/andreani.md) |
| vector-worker (Python) | `services/vector-worker` | [07-integrations/vector-worker.md](../07-integrations/vector-worker.md) |
| Funciones `/api` (Vercel) | `api/*.js` | [12-architecture](../12-architecture/README.md#api-serverless) |
| Scripts de importación | `scripts/*.mjs`, `scripts/*.py` | [11-operations-sops](../11-operations-sops/README.md#scripts-de-mantenimiento) |

## 4. Rutas ocultas / de desarrollo

| Ruta | Qué es |
|---|---|
| `/stock-pendiente` | Sandbox de la tarjeta de reposición con datos mock. **Pública** (fuera de `AuthenticatedLayout`). |
| `/dev/test-etiquetas-pdf` | Prueba de enriquecimiento de etiquetas PDF (solo `DEV`). |
| `/dev/whats-new`, `/dev/app-update` | Sandboxes de diálogos de novedades/actualización. |
| `/dev/vectorizar-tour`, `/dev/programas-tour` | Sandboxes de los tours de onboarding. |
| `/dev/programas-card`, `/dev/programas` | Sandboxes del tablero de programas con mocks. |
| `/admin/registros` | Redirige a `/pedidos` (🔶 resto de una pantalla de aprobación de usuarios que ya no existe). |

## 5. Cómo leer un módulo

Todos siguen la [plantilla](../_meta/plantilla-modulo.md). Para contexto mínimo antes de tocar un módulo, usá el [índice para agentes](../README.md#índice-para-agentes-context-routing).
