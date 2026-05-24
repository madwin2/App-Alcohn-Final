# MiCorreo Worker

Servicio **externo** a la app Alcohn. Sube archivos CSV de carga masiva al portal [MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/) usando Playwright.

Pensado para correr en **Hetzner** (Docker o Node directo). La app Alcohn lo llamará después vía `POST /upload`.

## Contrato HTTP

### `GET /health`

Sin autenticación. Devuelve `{ ok: true, ... }`.

### `POST /upload`

Header: `Authorization: Bearer <WORKER_API_KEY>`

Body JSON:

```json
{
  "orderId": "uuid-opcional",
  "csvContent": "tipo_producto...;\\nCP;25;...",
  "filename": "carga.csv"
}
```

Respuesta (mapeo futuro en Alcohn):

| `status` | HTTP | Estado en app |
|----------|------|----------------|
| `ok` | 200 | Etiqueta Lista |
| `data_error` | 422 | Error Etiqueta |
| `system_error` | 503 | Hacer Etiqueta |

## Setup local

```bash
cd services/micorreo-worker
cp .env.example .env
# Editar .env: WORKER_API_KEY, MICORREO_USER, MICORREO_PASSWORD
npm install
```

**Windows — error SSL (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`):** mismo workaround que en los scripts de importación:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
npm install --strict-ssl=false
npm run playwright:install
```

O en cmd: `npm run install:insecure-win`

### Probar subida (CLI, con navegador visible)

```powershell
$env:MICORREO_HEADLESS="false"
npm run upload:test -- --file fixtures/sample-sucursal.csv
```

Si falla login o navegación, revisá `artifacts/` (screenshot + HTML + texto).

### Servidor de desarrollo

```bash
npm run dev
```

Probar:

```bash
curl -X POST http://localhost:8787/upload \
  -H "Authorization: Bearer TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"csvContent\":\"$(cat fixtures/sample-sucursal.csv | sed 's/\"/\\\"/g')\"}"
```

En PowerShell conviene armar el JSON desde un script o Postman.

## Ajustar selectores del portal

MiCorreo es una SPA; los selectores pueden variar. Opciones:

1. **`npm run codegen`** — abre Playwright Codegen en la página de login para grabar clics.
2. Editar en `.env`:
   - `MICORREO_SELECTOR_USER`
   - `MICORREO_SELECTOR_PASSWORD`
   - `MICORREO_SELECTOR_LOGIN_BUTTON`
   - `MICORREO_SELECTOR_FILE_INPUT`
   - `MICORREO_SELECTOR_SUBMIT_UPLOAD`
   - `MICORREO_UPLOAD_URL` (URL directa a carga masiva, si la conocés)
   - `MICORREO_NAV_LINKS` ( 'Envío masivo', etc.

## Deploy en Hetzner

### Opción A — PM2 (servidor compartido con otros procesos)

Usado en producción en `188.245.218.22` junto al bot de WhatsApp:

```bash
cd /opt/micorreo-worker
npm install && npx playwright install-deps chromium && npx playwright install chromium
npm run build && npm prune --omit=dev
pm2 start ecosystem.config.cjs && pm2 save
```

Nginx (`webhook.alcohncnc.com/micorreo/` → `127.0.0.1:8787`): ver `scripts/patch-nginx-webhook.py`.

### Opción B — Docker (servidor dedicado)

```bash
docker compose up -d --build
```

Recomendado: firewall + API key fuerte; no exponer el puerto públicamente sin restricción IP.

Guía completa: [docs/deploy-hetzner.md](./docs/deploy-hetzner.md)

## Estructura

```
services/micorreo-worker/
├── src/
│   ├── index.ts              # HTTP server
│   ├── upload-service.ts     # Orquestación + clasificación
│   ├── classify-result.ts    # ok / data_error / system_error
│   ├── config.ts
│   ├── micorreo/
│   │   ├── upload-csv.ts     # Playwright login + upload
│   │   └── browser-helpers.ts
│   └── scripts/cli-upload.ts
├── fixtures/sample-sucursal.csv
├── Dockerfile
└── .env.example
```

## Nota sobre API REST de Correo

Correo publica documentación de API (`/shipping/import`) en [apiMiCorreo.pdf](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf). Si más adelante obtienen credenciales API, conviene migrar el worker a REST y dejar Playwright solo como fallback.

## Integración Alcohn

La app llama al worker vía `POST /api/micorreo-upload` (proxy en Vercel / dev en Vite). Ver `.env.local.example` en la raíz del monorepo y [docs/deploy-hetzner.md](./docs/deploy-hetzner.md).

Botón **Subir a MiCorreo** en `/envios`:

| `status` worker | Estado en app |
|-----------------|---------------|
| `ok` | Etiqueta Lista |
| `data_error` | Error Etiqueta (+ mensaje MiCorreo) |
| `system_error` | Hacer Etiqueta (+ descarga CSV manual) |
