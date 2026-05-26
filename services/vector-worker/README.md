# Vector Worker (Python)

Servicio externo para vectorización automática de `archivo_base` en sellos.

- API HTTP protegida con `VECTOR_WORKER_API_KEY`
- Cola en Supabase (`vector_jobs`)
- Procesa jobs en loop y sube EPS al bucket `vector`
- Guarda preview JPG en `archivo_vector_preview`
- Actualiza `sellos.estado_vectorizacion` a `VECTORIZADO` o `ERROR`
- Modo estricto: solo vectoriza imágenes aptas (fondo blanco + logo oscuro). Si no, marca `ERROR`.

## Endpoints

### `GET /health`
Sin auth.

### `POST /enqueue`
Header: `Authorization: Bearer <VECTOR_WORKER_API_KEY>`

Body:

```json
{
  "selloId": "uuid",
  "orderId": "uuid",
  "baseUrl": "https://.../archivo_base.png",
  "reason": "BASE_UPLOADED"
}
```

## Setup local

```bash
cd services/vector-worker
cp .env.example .env
pip install -r requirements.txt
uvicorn app.server:app --reload --host 0.0.0.0 --port 8790
```

## Deploy Hetzner (Docker)

```bash
cd /opt/vector-worker
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

## Integración app

La app usa `POST /api/vectorize-enqueue` y lo reenvía al worker con:

- `VECTOR_WORKER_URL`
- `VECTOR_WORKER_API_KEY`

Cuando se sube/reemplaza `archivo_base`, se encola job automático y el sello pasa a `EN_PROCESO`.
