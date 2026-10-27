# Andreani Pymes

> Worker: `services/andreani-worker` (Playwright + Supabase service role) · Proxies: `api/andreani-generate.js`, `andreani-sync-labels.js`, `andreani-sync-tracking.js`, `andreani-job-status.js` · UI: `AndreaniPoolCard`, `AndreaniLabelsPanel` · Docs previas: `GUIA_CURSOR_ANDREANI_LINKS.md`, `PROPUESTA_AUTOMATIZACION_ANDREANI.md`, `services/andreani-worker/fixtures/FLOW.md`

## Operaciones

| Endpoint worker | Botón en Alcohn AI | Qué hace | Efecto en la base |
|---|---|---|---|
| `POST /generate {count}` | "Generar más" (pool) | Login (Azure B2C) → "Hacer un envío" → "Andreani envíos" → origen (sucursal de despacho) → paquete estándar → valor declarado y código de descuento → "Finalizar" → copia el link | INSERT `envios_andreani_links` (`disponible`) |
| `POST /refill {min}` | — (sugerido como cron cada 6–12 h, ❓ no está en el repo) | Genera la diferencia hasta `min` (15) | ídem |
| `POST /sync-labels` | "Traer etiquetas" | Primero corre la revisión de links (`check-links`). Descarga etiquetas Zebra nuevas del portal, deduplica por tracking, empareja por el seguimiento del link y si no por nombre, enriquece el PDF. También refresca `estado_portal` de las ya guardadas; si ya no están "Pendiente de ingreso" y la orden está `Etiqueta Lista` → `Despachado` (mismo criterio que sync-tracking). | UPSERT `envios_andreani_etiquetas`, bucket `etiquetas-andreani`; si asigna → `ordenes.seguimiento`, `Etiqueta Lista`; si aplica → `Despachado` (+ WhatsApp vía trigger) |
| `POST /check-links` | — (corre como primer paso de "Traer etiquetas"; por horario solo si se configura `ANDREANI_CHECK_LINKS_HOURS`, apagado) | Sin login: para cada link `asignado` de un pedido sin seguimiento, consulta `GET pymes-api.andreani.com/api/v1/AndreaniEnvio?token=<token del link>` (`pedidoId` NULL = sin usar) y, si se usó, abre el link (redirige a `/cuenta/hacer-envio/estado-pedido/<pedidoId>`, "¡Listo!") y lee nombre y seguimiento | UPDATE `envios_andreani_links` (`revisado_en`, `usado_en`, `pedido_andreani_id`, `destinatario`, `tracking`); si el seguimiento está como huérfano → `asignar_etiqueta_andreani` |
| `POST /sync-tracking` | "Actualizar seguimientos" | Lee el estado de cada tracking en el portal | `estado_portal`; si ya no es "Pendiente de ingreso" y la orden está `Etiqueta Lista` → `Despachado` |
| `GET /jobs` | estado de trabajos | Cola serial del worker | — |
| `GET /health` | — | Estado y links disponibles | — |

## Configuración (nombres)

`WORKER_API_KEY`, `ANDREANI_USER`, `ANDREANI_PASS`, `ANDREANI_SUCURSAL_DESPACHO`, `ANDREANI_SUCURSAL_NOMBRE`, `ANDREANI_PAQUETE_ALTO/ANCHO/LARGO/PESO`, `ANDREANI_VALOR_DECLARADO`, `ANDREANI_CODIGO_DESCUENTO`, `ANDREANI_PROXY_SERVER/USERNAME/PASSWORD`, `ANDREANI_HEADLESS`, `ANDREANI_CHECK_LINKS_HOURS` (horas AR para revisar links además de "Traer etiquetas"; vacío u `off` = apagado, que es lo acordado, Q-AND-005), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANDREANI_STORAGE_STATE_PATH`. En Vercel: `ANDREANI_WORKER_URL`, `ANDREANI_WORKER_API_KEY`.

## Dependencias operativas

- **Sesión**: se guarda en `data/storage-state.json`; si el portal pide captcha/2FA, hay que loguearse a mano con navegador visible.
- **Red**: Andreani bloquea la IP del VPS → túnel SOCKS **desde la PC de la oficina** (`scripts/office-tunnel.bat/.ps1`) que debe quedar abierto. ❓ [Q-AND-003](../14-open-questions/envios.md#q-and-003).
- La revisión de links no usa la sesión del portal (los links y la API son públicos: no piden login), pero **sí el túnel**: Andreani bloquea por IP, con o sin login (🔶 no probado desde el VPS sin túnel para estas URLs). Por eso corre solo dentro de "Traer etiquetas", cuando el túnel está abierto.
- Scripts de diagnóstico y mantenimiento en `services/andreani-worker/src/scripts/`.

## Reglas en la base

Ver [BR-AND-*](../04-business-rules/envios.md) y [06-state-machines/andreani.md](../06-state-machines/andreani.md).
