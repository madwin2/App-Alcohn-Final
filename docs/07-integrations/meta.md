# Meta

## Conversions API (edge `meta-conversion`, v11)

| | |
|---|---|
| Para qué | Informar ventas a Meta (evento **Purchase**) para medir/optimizar publicidad. |
| Disparador | Triggers en `ordenes`: al insertar una orden **no web** o una web ya pagada; al pasar una web a `pagado`. SQL `enviar_meta_conversion` → `pg_net` → edge. |
| Idempotencia | `meta_conversion_log` (una por orden). |
| Datos enviados | `event_id` = id de la orden; `event_time` = pago confirmado o creación; `action_source` `website` (web) o `physical_store` (app); `value` = `valor_total` al momento de la llamada; moneda (ARS); datos de usuario **hasheados SHA-256**: email, teléfono, nombre, apellido. |
| Reglas | No envía si faltan email y teléfono; no envía eventos de más de 7 días; no envía web no pagadas. |
| Configuración | `META_PIXEL_ID`, `META_ACCESS_TOKEN` (o `API_META`), `META_API_VERSION` (v21.0), `META_TEST_EVENT_CODE`, `META_EVENT_SOURCE_URL`, `META_CURRENCY`. |
| Problema confirmado con datos (2026-09-28) | En pedidos de la app la orden se inserta **antes** que sus ítems (el primero se crea en seguida, los demás después). De 638 eventos de la app, **108 llegaron con un valor menor al real** y 3 en 0; promedio enviado $84.132 vs real $100.122 (~16 % menos). En la web: 9 de 95. Parte puede deberse a ítems agregados días después, pero el grueso es por pedidos de varios diseños. Ver backlog. |

## WhatsApp Business Embedded Signup

Ver [02-modules/whatsapp-bot](../02-modules/whatsapp-bot/README.md). Variables `VITE_META_APP_ID`, `VITE_META_WHATSAPP_CONFIG_ID`, `VITE_META_GRAPH_API_VERSION`. Cuenta de revisión `FBTEST`.
