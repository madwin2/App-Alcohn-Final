# Meta

## Conversions API (edge `meta-conversion`, v26)

> **Cambio 2026-11-11 (v26): un solo dataset por venta.**
> - Orden **web** pagada → Purchase `website` **solo** a `META_WEB_PIXEL_ID` (**Alcohn Web Sale**, default `1322492025954445`), con `event_id` = id de orden. Deduplica contra el Purchase del navegador (Openpay), que usa el mismo `eventID`. Si Meta rechaza ese dataset, respaldo automático a `META_PIXEL_ID` (queda en `_debug.web_fallback`).
> - Orden **no web** (WhatsApp/app) → igual que antes, a `META_PIXEL_ID` (**Ventas WhatsApp**) como `physical_store`.
> - CTWA sin cambios.
> - Motivo: hasta v25 las ventas web iban a Ventas WhatsApp; desde el 2/11 la web dejó de mandar Purchase en transferencias (lo cubría la CAPI), así que Alcohn Web Sale se quedó sin compras. La deduplicación por `event_id` solo funciona dentro del mismo dataset.
> - `META_EVENT_SOURCE_URL` default `https://www.alcohnsellos.com`.
> - **Modo prueba:** `POST { "orden_id": "...", "test_event_code": "TEST12345" }` → manda como evento de prueba, ignora/no escribe `meta_conversion_log`.
>
> **v27 (2026-11-11): también GA4.** Transferencias web de Argentina (`origen=Web`, `metodo_pago=Transferencia`, sin `notas_web.international`) → además `purchase` a GA4 por Measurement Protocol (`GA4_MEASUREMENT_ID` default `G-6KPY518GPC`, `GA4_API_SECRET` obligatorio; sin secret se saltea con `reason: missing_ga4_api_secret`). Usa `notas_web.ga_client_id` / `ga_session_id` que guarda la web al crear la orden (cookies `_ga` / `_ga_6KPY518GPC`); si faltan, `client_id` derivado del id de orden (venta sin canal). Tarjeta e internacionales no: ya las manda el navegador. En GTM, la etiqueta `GA4 - purchase` tiene excepción en `/checkout/transferencia` para no contarlas dos veces. En modo prueba usa `/debug/mp/collect`. Resultado en `_debug.ga4`.
>
> Las filas de abajo describen v15; donde dice "Siempre Purchase a `META_PIXEL_ID`" ahora aplica solo a órdenes no web.

| | |
|---|---|
| Para qué | Informar ventas a Meta (evento **Purchase**) para medir/optimizar publicidad. |
| Disparador | Triggers en `ordenes`: al insertar una orden **no web** o una web ya pagada; al pasar una web a `pagado`. SQL `enviar_meta_conversion` → `pg_net` → edge. |
| Idempotencia | `meta_conversion_log` (una por orden). |
| Datos enviados | `event_id` = id de la orden; `event_time` = pago confirmado o creación; `value` = `valor_total` al momento de la llamada; moneda (ARS); datos de usuario **hasheados SHA-256**: email, teléfono, nombre, apellido. |
| Doble envío (v15) | **Siempre** Purchase a `META_PIXEL_ID` (**Ventas WhatsApp – Alcohn** / campañas actuales) como `physical_store` o `website`, **sin** `ctwa_clid`. Si hay match CTWA, **además** Purchase `business_messaging` a `META_WA_DATASET_ID` con `ctwa_clid` + WABA. `success` del log = offline OK. Debug: `_debug.offline` + `_debug.ctwa`. |
| Destino CAPI | Offline/campañas → `META_PIXEL_ID`. Atribución anuncio WA → `META_WA_DATASET_ID` (default `1590689962745150`). Meta **no** acepta `business_messaging` en el dataset offline si no está vinculado al WABA (2804132). |
| Atribución WA (CTWA) | Lookup remoto en `whatsapp_ad_referrals` por teléfono. Soft-fail del lookup: se manda igual el offline. Soft-fail del POST CTWA: no tumba el `success` si el offline OK. Snapshot en `_debug.wa_attribution`. |
| Dataset ↔ WABA | Crear/recuperar con Graph (app **WP BOT**): `POST /{waba-id}/dataset` → id del dataset. WABA principal Alcohn: `322490364285175` → dataset `1590689962745150` (2026-10-18). El `META_ACCESS_TOKEN` tiene que poder escribir en ese dataset; si no, Meta responde code 100 / subcode **33** (*Unsupported post request… missing permissions*). En Business Settings: asignar el system user del token al dataset (control total) o regenerar el token con acceso al dataset + píxel. |
| Reglas | No envía si faltan email y teléfono; no envía eventos de más de 7 días; no envía web no pagadas. |
| Configuración | `META_PIXEL_ID`, `META_WA_DATASET_ID`, `META_ACCESS_TOKEN` (o `API_META`), `META_API_VERSION` (v21.0), `META_TEST_EVENT_CODE`, `META_EVENT_SOURCE_URL`, `META_CURRENCY`. Atribución WA: `META_ATTR_SUPABASE_URL`, `META_ATTR_SUPABASE_KEY` (URL + service_role o key con SELECT en `whatsapp_ad_referrals` del proyecto del bot). |
| Problema confirmado con datos (2026-09-28) | En pedidos de la app la orden se inserta **antes** que sus ítems (el primero se crea en seguida, los demás después). De 638 eventos de la app, **108 llegaron con un valor menor al real** y 3 en 0; promedio enviado $84.132 vs real $100.122 (~16 % menos). En la web: 9 de 95. Parte puede deberse a ítems agregados días después, pero el grueso es por pedidos de varios diseños. Ver backlog. |

### Lookup CTWA (proyecto del bot)

Tabla remota `public.whatsapp_ad_referrals` (no vive en este Supabase):

- Match: `wa_id` (teléfono WhatsApp, típico `549…`).
- Regla: último referral con `ctwa_clid` no nulo (`message_timestamp` o, si falta, `created_at`).
- No se copian contactos WA a `clientes` de este proyecto.

Secrets (en el proyecto **de Alcohn AI**, no en el frontend):

```bash
supabase secrets set META_ATTR_SUPABASE_URL="https://xxxx.supabase.co"
supabase secrets set META_ATTR_SUPABASE_KEY="<service_role del proyecto del bot>"
supabase secrets set META_WA_DATASET_ID="1590689962745150"
```

Luego redesplegar: `supabase functions deploy meta-conversion`.

## WhatsApp Business Embedded Signup

Ver [02-modules/whatsapp-bot](../02-modules/whatsapp-bot/README.md). Variables `VITE_META_APP_ID`, `VITE_META_WHATSAPP_CONFIG_ID`, `VITE_META_GRAPH_API_VERSION`. Cuenta de revisión `FBTEST`.
