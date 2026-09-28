# Andreani Pymes

> Worker: `services/andreani-worker` (Playwright + Supabase service role) · Proxies: `api/andreani-generate.js`, `andreani-sync-labels.js`, `andreani-sync-tracking.js`, `andreani-job-status.js` · UI: `AndreaniPoolCard`, `AndreaniLabelsPanel` · Docs previas: `GUIA_CURSOR_ANDREANI_LINKS.md`, `PROPUESTA_AUTOMATIZACION_ANDREANI.md`, `services/andreani-worker/fixtures/FLOW.md`

## Operaciones

| Endpoint worker | Botón en Alcohn AI | Qué hace | Efecto en la base |
|---|---|---|---|
| `POST /generate {count}` | "Generar más" (pool) | Login (Azure B2C) → "Hacer un envío" → "Andreani envíos" → origen (sucursal de despacho) → paquete estándar → valor declarado y código de descuento → "Finalizar" → copia el link | INSERT `envios_andreani_links` (`disponible`) |
| `POST /refill {min}` | — (sugerido como cron cada 6–12 h, ❓ no está en el repo) | Genera la diferencia hasta `min` (15) | ídem |
| `POST /sync-labels` | "Traer etiquetas" | Descarga etiquetas Zebra nuevas del portal, deduplica por tracking, empareja por nombre, enriquece el PDF | UPSERT `envios_andreani_etiquetas`, bucket `etiquetas-andreani`; si asigna → `ordenes.seguimiento`, `Etiqueta Lista` |
| `POST /sync-tracking` | "Actualizar seguimientos" | Lee el estado de cada tracking en el portal | `estado_portal`; si ya no es "Pendiente de ingreso" y la orden está `Etiqueta Lista` → `Despachado` |
| `GET /jobs` | estado de trabajos | Cola serial del worker | — |
| `GET /health` | — | Estado y links disponibles | — |

## Configuración (nombres)

`WORKER_API_KEY`, `ANDREANI_USER`, `ANDREANI_PASS`, `ANDREANI_SUCURSAL_DESPACHO`, `ANDREANI_SUCURSAL_NOMBRE`, `ANDREANI_PAQUETE_ALTO/ANCHO/LARGO/PESO`, `ANDREANI_VALOR_DECLARADO`, `ANDREANI_CODIGO_DESCUENTO`, `ANDREANI_PROXY_SERVER/USERNAME/PASSWORD`, `ANDREANI_HEADLESS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANDREANI_STORAGE_STATE_PATH`. En Vercel: `ANDREANI_WORKER_URL`, `ANDREANI_WORKER_API_KEY`.

## Dependencias operativas

- **Sesión**: se guarda en `data/storage-state.json`; si el portal pide captcha/2FA, hay que loguearse a mano con navegador visible.
- **Red**: Andreani bloquea la IP del VPS → túnel SOCKS **desde la PC de la oficina** (`scripts/office-tunnel.bat/.ps1`) que debe quedar abierto. ❓ [Q-AND-003](../14-open-questions/envios.md#q-and-003).
- Scripts de diagnóstico y mantenimiento en `services/andreani-worker/src/scripts/`.

## Reglas en la base

Ver [BR-AND-*](../04-business-rules/envios.md) y [06-state-machines/andreani.md](../06-state-machines/andreani.md).
