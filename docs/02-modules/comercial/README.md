# Comercial Web

> Ruta: `/comercial` · Página: `src/app/comercial/index.tsx` · Servicios: `comercialWeb.service.ts`, `comercialContacto.service.ts`, `comercialSeguimientos.service.ts`, `webOrderPayment.service.ts`, `clienteProfile.service.ts` · Lógica: `src/lib/comercial/*`
> Workflows: [WF-02 pedido web](../../03-workflows/WF-02-pedido-web.md), [WF-09 mockup y contacto](../../03-workflows/WF-09-mockup-y-contacto-comercial.md), [WF-10 recompra](../../03-workflows/WF-10-recompra.md)

## Propósito

✅ Embudo comercial de la **tienda web** y de la base de clientes: ver potenciales (gente que generó un mockup y no compró, pedidos web con pago pendiente, contactos sin mockup), confirmar pagos por transferencia, contactar por WhatsApp, excluir, y monitorear las automatizaciones de contacto y recompra y el tráfico web.

## Pestañas

| Pestaña | Contenido |
|---|---|
| **Potenciales** | Mockups web sin compra (`v_web_mockups_sin_compra`), órdenes web con pago pendiente (`v_web_ordenes_seguimiento_pago`: `pendiente`, `pago_fallido`, `esperando_comprobante`, `abandonado`), contactos sin muestra. Prioridad: **caliente** (pago pendiente o checkout iniciado), **tibio** (mockup listo), **frío** (resto). ⚠️ El equipo **no la usa** y no trabaja esta lista a mano (POL-029); el seguimiento real es el mensaje automático a los 10 minutos. Estado del contacto comercial automático. Exportar CSV. |
| **Resumen** | Gráficos del embudo (`ComercialCharts`). |
| **Seguimientos** | Automatización de recompra: elegibles, enviados hoy / 7 / 30 días, historial; botón para enviar un lote manual. |
| **Tráfico** | `web_analytics_events` (44.885 eventos: página, UTM, visitante, sesión) de la tienda web. |
| **Clientes** | Clientes web por etapa: `solo_contacto`, `con_muestra`, `checkout`, `comprador`, `recurrente`; línea de tiempo por cliente (`ClienteDetailDialog`). |

## Acciones

| Acción | Efecto |
|---|---|
| **Enviar WhatsApp** a un potencial | `webhook-bot` tipo `generador_muestras_contacto`; marca `metadata_web.contacto_comercial_enviado_at`. |
| **Abrir chat** | Link `wa.me/<teléfono>` para escribirle desde WhatsApp del equipo (`lib/comercial/utils.ts`). |
| **Excluir** | INSERT `comercial_exclusiones` (`cliente` / `mockup` / `orden`); deja de aparecer y las automatizaciones lo saltean. |
| **Confirmar pago** (`ComercialConfirmPagoDialog`) | Para órdenes web con pago pendiente (típicamente transferencia con comprobante). Pide monto de seña (por defecto el del checkout o **$20.000**) y nombre del diseño. `confirmWebOrderPayment`: borra sellos previos si había (recuperación), arma sellos desde el carrito, `estado_pago_web='pagado'`, valida comprobante (`comprobante_validado_por/at`). Esto dispara el trigger → edge `confirm-web-order` → WhatsApp `pedido_registrado` y evento a Meta. |
| **Enviar lote de seguimientos** | `procesar_seguimientos_clientes_pendientes` (mismo que el cron). |
| Badge del menú | Pagos web nuevos no vistos (`fetchComercialPagosNuevosBadgeCount`, `markComercialPagosAsSeen`). |

## Automatizaciones

| Nombre | Disparo | Qué hace | Doc |
|---|---|---|---|
| Contacto comercial post-mockup | Trigger al completar un mockup web → elegible a los 10 min; cron cada 2 min | WhatsApp `generador_muestras_contacto` (máx. 15 por corrida), salteando excluidos y teléfonos contactados en los últimos **7 días** | [08-automations/cron.md](../../08-automations/cron.md) |
| Recompra | Cron lun–vie 15:26 UTC | WhatsApp `seguimiento_cliente_recompra` a hasta 10 clientes con **1 sola orden**, `Transferido` + `Seguimiento Enviado`, de hace ≥2 meses; una vez por cliente | [WF-10](../../03-workflows/WF-10-recompra.md) |

⚠️ `webhook_logs` tiene **92.179** registros `generador_muestras_contacto`, casi todos de un pico en junio–julio 2026 (~140 por mockup); desde agosto hay ~1 por mockup, pero ~50 % quedan marcados como fallidos por timeout → [AUD-UND-003](../../audits/comportamientos-no-documentados.md#aud-und-003), [Q-WA-003](../../14-open-questions/whatsapp-bot.md#q-wa-003).

## Datos

`mockup_solicitudes`, `ordenes` (campos web), `clientes`, `comercial_exclusiones`, `comercial_cliente_seguimientos`, vistas `v_web_*` y `v_comercial_*`, `web_analytics_events`, `webhook_logs`. Bucket privado `comprobantes`.
Diagnóstico: `scripts/diagnostico-comercial-web.mjs/.sql`, `sql/diagnostic_wizard_funnel.sql`.
