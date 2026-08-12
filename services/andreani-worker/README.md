# andreani-worker

Genera links de pago de **Andreani Pymes** con Playwright y los inserta en el pool `envios_andreani_links` (Supabase).

Misma arquitectura que `micorreo-worker`: HTTP + cola serial + artifacts en disco. Diferencias clave: **storageState persistido** y **Supabase service role** para el pool.

## Endpoints

| Método | Ruta | Auth | Body | Respuesta |
|--------|------|------|------|-----------|
| `GET` | `/health` | no | — | `{ ok, poolDisponibles, … }` |
| `POST` | `/generate` | Bearer / `x-api-key` | `{ count }` | `{ generated, urls, status }` |
| `POST` | `/refill` | Bearer / `x-api-key` | `{ min? }` (default 15) | genera la diferencia si faltan |

## Setup

```bash
cd services/andreani-worker
cp .env.example .env   # completar credenciales + Supabase
npm install
npm run playwright:install
```

### Probar 1 link (navegador visible)

```bash
# Windows PowerShell
$env:ANDREANI_HEADLESS="false"; npm run generate:test -- --count 1
```

Si el login tiene captcha/2FA: dejá la sesión abierta una vez; se guarda en `data/storage-state.json`.

### Servidor

```bash
npm run dev
# GET  http://localhost:8788/health
# POST http://localhost:8788/generate  -H "Authorization: Bearer …" -d "{\"count\":3}"
```

## Integración app

En la página Envíos, el botón **Generar más** llama a `VITE_ANDREANI_WORKER_URL` (ej. `http://127.0.0.1:8788`).

Cron sugerido (cada 6–12 h): `POST /refill { "min": 15 }`.

## Flujo UI

Ver `fixtures/FLOW.md`.

## Túnel oficina (sin pagar proxy)

Andreani bloquea la IP de Hetzner. Solución simple: desde la PC de la oficina
correr un túnel SSH que crea un SOCKS en el VPS saliendo por el WiFi de la oficina.

1. En Hetzner `.env`:
   ```env
   ANDREANI_PROXY_SERVER=socks5://127.0.0.1:11080
   ANDREANI_HEADLESS=false
   ```
2. En la PC de la oficina (Windows), doble click o:
   ```bat
   services\andreani-worker\scripts\office-tunnel.bat
   ```
   Dejar la ventana abierta.
3. Probar:
   ```bash
   # en el VPS
   npm run probe:net
   curl -X POST http://127.0.0.1:8788/generate -H "Authorization: Bearer …" -d '{"count":1}'
   ```

El worker sigue en Hetzner; la oficina solo presta la IP.
