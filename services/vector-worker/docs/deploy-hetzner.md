# Deploy Vector Worker en Hetzner

## 1) Copiar proyecto

```bash
scp -r services/vector-worker root@TU_IP:/opt/vector-worker
```

## 2) Configurar `.env`

```env
PORT=8790
VECTOR_WORKER_API_KEY=secreto-largo
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
VECTOR_BUCKET=vector
VECTOR_POLL_INTERVAL_SECONDS=12
VECTOR_LOCK_STALE_MINUTES=15
VECTOR_MAX_ATTEMPTS_DEFAULT=4
```

## 3) Levantar contenedor

```bash
cd /opt/vector-worker
docker compose up -d --build
docker compose logs -f
curl http://127.0.0.1:8790/health
```

## 4) Exponer por nginx (opcional recomendado)

Ejemplo:

- `https://webhook.alcohncnc.com/vector` -> `http://127.0.0.1:8790`

En la app (Vercel):

- `VECTOR_WORKER_URL=https://webhook.alcohncnc.com/vector`
- `VECTOR_WORKER_API_KEY=<mismo secreto>`

## 5) SQL obligatorio

Ejecutar en Supabase SQL Editor:

- `migration_vector_worker_jobs.sql`
