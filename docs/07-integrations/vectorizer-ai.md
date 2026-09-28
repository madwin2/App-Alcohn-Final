# Vectorizer.AI

| | |
|---|---|
| Para qué | Convertir imágenes de logos en SVG de 2 colores para mecanizar. |
| Módulo | Vectorización (Pedidos, Lote libre). |
| Entrada | PNG de una "hoja" (varias imágenes empaquetadas) en base64 + modo (`production`/`preview`/`test`) + overrides permitidos (`processing.palette`, `processing.shapes.min_area_px`, `output.curves.line_fit_tolerance`). |
| Salida | SVG, créditos cobrados/calculados. |
| Mecanismo | Navegador → `POST /api/vectorize` (Vercel, límite 4,5 MB, 60 s) → `https://api.vectorizer.ai/api/v1/vectorize` con Basic Auth. Saldo: `GET /api/vectorizer-account`. |
| Autenticación | `VECTORIZER_API_ID`, `VECTORIZER_API_SECRET` (servidor). `VECTORIZER_DEFAULT_MODE`. |
| Reintentos | Cliente: 429 → espera 5/10/15 s (3 veces); 5xx → backoff 1/2 s (2 veces). |
| Costo | 1 crédito por hoja en `production`; `test` gratis con marca de agua. |
| Retención | `policy.retention_days=0`. |
| Riesgo | `/api/vectorize` sin autenticación de usuario. |

Investigación de alternativas locales: `deep-research-report.md` (raíz, 2026-05).
