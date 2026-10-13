# Gastos automáticos (Meta Ads, Google Ads, OpenAI, dólar blue)

> Etapa 1 de [`PLAN_CONTROL_GASTOS.md`](../../PLAN_CONTROL_GASTOS.md). Módulo: [economia-gastos](../02-modules/economia-gastos/README.md).

| Fuente | Cómo llega | Secretos (Supabase → Edge Functions) |
|---|---|---|
| Dólar blue / oficial | Edge `gastos-sync` → `https://dolarapi.com/v1/dolares/blue` y `/oficial` → `cotizaciones_usd` | — |
| Recurrentes | Edge `gastos-sync` → RPC `generar_gastos_recurrentes(p_hoy)` | — |
| Meta Ads | Edge `gastos-sync` → Graph API `act_{id}/insights` (`level=campaign`, `time_increment=1`, `spend`), moneda de la cuenta | `META_ADS_ACCOUNT_ID`, `META_ADS_TOKEN` (usuario del sistema con `ads_read`), opcional `META_API_VERSION` |
| OpenAI | Edge `gastos-sync` → `GET /v1/organization/costs` agrupado por `project_id` (nombres de `/v1/organization/projects` o `control_gastos_config.openai_proyectos`) | `OPENAI_ADMIN_KEY` (clave **admin**) |
| Claude (API de Anthropic) | Edge `gastos-sync` → `GET /v1/organizations/cost_report` (Admin API, `bucket_width=1d`, `group_by[]=workspace_id` y `description`; montos en **centavos** de USD; días en UTC). Un concepto por workspace × modelo (nombres de `/v1/organizations/workspaces`). Proveedor `anthropic` (migración `migration_gastos_proveedor_anthropic.sql`, 2026-10-07). Solo uso de API: las suscripciones (Pro/Max/Team) no aparecen, van en Recurrentes. | `ANTHROPIC_ADMIN_KEY` (clave **admin** `sk-ant-admin…` de una organización) |
| Google Ads | Script dentro de la cuenta de Google Ads ([`scripts/google-ads/enviar-gastos.js`](../../scripts/google-ads/enviar-gastos.js)) → `POST` edge `gastos-ingest-google` (sin JWT, header `x-ingest-secret`) | `GOOGLE_ADS_INGEST_SECRET` |

- La cuenta de Meta factura en **ARS** pero a la tarjeta llega en **USD**: al leer, `publicidadArsAUsd` pasa Meta/Google en pesos a USD con el **oficial** del día (tabla `cotizaciones_usd`; sin dato de ese día, el anterior más cercano). Desde ahí siguen el circuito de dólares.
- Cada sync re-trae los **últimos 7 días** (la primera vez, desde `fecha_inicio`) y **reemplaza** los registros de ese proveedor en el rango (upsert + borrado de lo que ya no viene). Idempotente.
- **Carga histórica (2026-10-07):** `fecha_inicio` = 2025-09-01. Meta: `POST gastos-sync { "meta_desde": "2025-09-01" }` (de a un mes; el borrado por rango lleva los IDs en la URL y no escala a un año de una vez). Google: `scripts/google-ads/enviar-gastos-historico.js`, se corre una vez desde Google Ads (también de a un mes). OpenAI nunca se trae antes de 2026-09-29 (`OPENAI_DESDE`). Después de cada carga histórica, correr `scripts/sql/pagos-usd-retroactivos.sql` (pago de cada mes = blue del día 10 del mes siguiente). Ver [economía y gastos](../02-modules/economia-gastos/README.md#publicidad-real-retroactiva-2026-10-07).
- Cada paso deja una fila en `gastos_sync_log`; si falta un secreto el paso queda «sin configurar».
- Disparadores: cron `gastos-sync-diario` (07:00 AR) y botón «Actualizar ahora» en Gastos. El script de Google se programa dentro de Google Ads (diario, ~06:00).
- Costos de conversaciones de WhatsApp: fuera de la Etapa 1 ([Q-ECO-006](../14-open-questions/economia.md#q-eco-006)).
