# Deploy MiCorreo Worker en Hetzner

Guía paso a paso para dejar el worker **activo 24/7** y conectarlo con la app Alcohn (Vercel).

## Arquitectura

```
App Alcohn (Vercel)
  POST /api/micorreo-upload   ← API key solo en servidor Vercel
        ↓
Worker Hetzner :8787
  POST /upload (Playwright → portal MiCorreo)
```

## 1. Crear servidor en Hetzner

1. Panel Hetzner → **Cloud** → **Add Server**
2. **Ubicación:** Falkenstein o Nuremberg (cerca de EU; el portal MiCorreo es AR pero el robot no es latency-sensitive)
3. **Imagen:** Ubuntu 24.04
4. **Tipo:** CX22 (2 vCPU, 4 GB RAM) — Playwright + Chromium necesita memoria
5. **SSH key:** la tuya
6. Crear servidor y anotar **IP pública**

## 2. Preparar el servidor

Conectate por SSH:

```bash
ssh root@TU_IP_HETZNER
```

Instalar Docker:

```bash
apt update && apt install -y docker.io docker-compose-v2 curl ufw
systemctl enable --now docker
```

Firewall (solo SSH + worker desde tu IP o Vercel):

```bash
ufw allow OpenSSH
# Opción A — restringir worker a IP fija (recomendado si tenés IP de oficina/VPN):
# ufw allow from TU_IP_FIJA to any port 8787
# Opción B — exponer 8787 con API key fuerte (menos ideal):
ufw allow 8787/tcp
ufw enable
```

## 3. Subir el código del worker

**Desde tu PC** (PowerShell), empaquetar y copiar:

```powershell
cd "c:\Users\julia\Documents\Alcohn Ai Nueva\services\micorreo-worker"
tar -czf micorreo-worker.tgz --exclude=node_modules --exclude=dist --exclude=artifacts --exclude=.env .
scp micorreo-worker.tgz root@TU_IP_HETZNER:/opt/
```

**En el servidor:**

```bash
mkdir -p /opt/micorreo-worker
tar -xzf /opt/micorreo-worker.tgz -C /opt/micorreo-worker
cd /opt/micorreo-worker
cp .env.example .env
nano .env   # completar credenciales
```

### Variables obligatorias en `.env`

```env
WORKER_API_KEY=genera-un-secreto-largo-aleatorio
MICORREO_USER=tu@email.com
MICORREO_PASSWORD=tu-contraseña
MICORREO_HEADLESS=true
MICORREO_ORIGEN_PROVINCIA=B
MICORREO_ORIGEN_SUCURSAL=MAR DEL PLATA UP 28
```

Generar API key:

```bash
openssl rand -hex 32
```

## 4. Levantar con Docker Compose

```bash
cd /opt/micorreo-worker
docker compose up -d --build
docker compose logs -f   # ver que arranca sin error
curl http://127.0.0.1:8787/health
```

Respuesta esperada:

```json
{"ok":true,"service":"micorreo-worker","envLoaded":true,"hasCredentials":true}
```

Probar subida desde el servidor (opcional, con CSV de ejemplo):

```bash
docker compose exec micorreo-worker node dist/scripts/cli-upload.js fixtures/sample-sucursal.csv
```

## 5. Configurar la app Alcohn (Vercel)

En **Vercel → Project → Settings → Environment Variables** (Production + Preview):

| Variable | Valor |
|----------|-------|
| `MICORREO_WORKER_URL` | `https://webhook.alcohncnc.com/micorreo` (nginx → `:8787`) |
| `MICORREO_WORKER_API_KEY` | mismo valor que `WORKER_API_KEY` en Hetzner |

> El puerto `8787` directo por IP puede estar bloqueado en el firewall de Hetzner Cloud. Usar HTTPS vía nginx es la opción recomendada.

Redeploy la app después de guardar.

### Desarrollo local

Copiá `.env.local.example` → `.env.local` en la raíz del repo con la misma URL/key. Con el worker corriendo local (`npm run dev` en `services/micorreo-worker`), `npm run dev` en la app proxea `/api/micorreo-upload` automáticamente.

## 6. Flujo en la app (ya implementado)

Botón **Subir a MiCorreo** en `/envios`:

| Respuesta worker | Estado en app | Qué ve el operador |
|------------------|---------------|-------------------|
| `ok` | Etiqueta Lista | Toast de éxito |
| `data_error` | Error Etiqueta | Mensaje literal de MiCorreo |
| `system_error` | Hacer Etiqueta | Error + **descarga CSV** para carga manual |

## 7. Mantenimiento

```bash
# Ver logs
docker compose logs -f --tail=100

# Reiniciar
docker compose restart

# Actualizar código (repetir tar + scp, luego):
docker compose up -d --build

# Estado
docker compose ps
curl http://127.0.0.1:8787/health
```

## 8. HTTPS opcional (recomendado a futuro)

Si querés `https://worker.tudominio.com` en lugar de IP:8787:

- Caddy o nginx + Let's Encrypt en el mismo Hetzner
- Proxy pass a `127.0.0.1:8787`
- En Vercel usar `MICORREO_WORKER_URL=https://worker.tudominio.com`

## Checklist rápido

- [ ] Servidor Hetzner CX22+ con Docker
- [ ] `.env` con credenciales MiCorreo y `WORKER_API_KEY`
- [ ] `docker compose up -d` + `/health` OK
- [ ] Variables en Vercel (`MICORREO_WORKER_*`)
- [ ] Probar desde `/envios` con 1 pedido de prueba
