# vector-worker (Python) — vectorización automática

| | |
|---|---|
| Código | `services/vector-worker` (FastAPI `app/server.py`, loop `app/worker.py`, `app/vectorize.py`) |
| Estado | **Apagado** en la app salvo `VITE_VECTOR_AUTO_ENABLED=true` (y `VECTOR_AUTO_ENABLED` en `/api/vectorize-enqueue`). 70 jobs históricos. |
| Entrada | `POST /enqueue {selloId, orderId, baseUrl, reason}` con `Authorization: Bearer <VECTOR_WORKER_API_KEY>` (vía `/api/vectorize-enqueue`). |
| Proceso | Cola en `vector_jobs` (lock, intentos, `run_after`); descarga el base; modo estricto (fondo blanco + logo oscuro, si no → ERROR); opcional upscale (Upscayl) y mejora con IA; vectoriza con Potrace/mkbitmap (`VECTOR_ENGINE`); sube **EPS** al bucket `vector` y preview JPG; actualiza `estado_vectorizacion` a `VECTORIZADO`/`ERROR`. |
| Despliegue | Docker / PM2 en VPS (`docs/deploy-hetzner.md`). |
| Nota | Produce **EPS**, formato que el gadget de Aspire no importa. 🔶 Por eso y por calidad se reemplazó en la práctica por la página Vectorización (SVG vía Vectorizer.AI). ❓ [Q-VEC-003](../14-open-questions/vectorizacion.md#q-vec-003) |
