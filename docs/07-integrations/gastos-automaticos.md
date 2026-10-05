# Gastos automáticos (Meta Ads, Google Ads, OpenAI, dólar blue)

> Etapa 1 de [`PLAN_CONTROL_GASTOS.md`](../../PLAN_CONTROL_GASTOS.md). Módulo: [economia-gastos](../02-modules/economia-gastos/README.md).

| Fuente | Cómo llega | Secretos (Supabase → Edge Functions) |
|---|---|---|
| Dólar blue / oficial | Edge `gastos-sync` → `https://dolarapi.com/v1/dolares/blue` y `/oficial` → `cotizaciones_usd` | — |
| Recurrentes | Edge `gastos-sync` → RPC `generar_gastos_recurrentes(p_hoy)` | — |
| Meta Ads | Edge `gastos-sync` → Graph API `act_{id}/insights` (`level=campaign`, `time_increment=1`, `spend`), moneda de la cuenta | `META_ADS_ACCOUNT_ID`, `META_ADS_TOKEN` (usuario del sistema con `ads_read`), opcional `META_API_VERSION` |
| OpenAI | Edge `gastos-sync` → `GET /v1/organization/costs` agrupado por `project_id` (nombres de `/v1/organization/projects` o `control_gastos_config.openai_proyectos`) | `OPENAI_ADMIN_KEY` (clave **admin**) |
| Google Ads | Script dentro de la cuenta de Google Ads ([`scripts/google-ads/enviar-gastos.js`](../../scripts/google-ads/enviar-gastos.js)) → `POST` edge `gastos-ingest-google` (sin JWT, header `x-ingest-secret`) | `GOOGLE_ADS_INGEST_SECRET` |

- Cada sync re-trae los **últimos 7 días** (la primera vez, desde `fecha_inicio`) y **reemplaza** los registros de ese proveedor en el rango (upsert + borrado de lo que ya no viene). Idempotente.
- Cada paso deja una fila en `gastos_sync_log`; si falta un secreto el paso queda «sin configurar».
- Disparadores: cron `gastos-sync-diario` (07:00 AR) y botón «Actualizar ahora» en Gastos. El script de Google se programa dentro de Google Ads (diario, ~06:00).
- Costos de conversaciones de WhatsApp: fuera de la Etapa 1 ([Q-ECO-006](../14-open-questions/economia.md#q-eco-006)).
