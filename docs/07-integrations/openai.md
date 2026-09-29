# OpenAI

| Endpoint (Vercel) | Uso | Modelo por defecto | Variables |
|---|---|---|---|
| `/api/optimize-logo` | Limpiar/optimizar el logo para el mockup (Images edits) | `gpt-image-2`, fallbacks `gpt-image-1.5`, `gpt-image-1` | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_MODEL_FALLBACKS`, `OPENAI_IMAGE_TIMEOUT_MS` (90 s) |
| `/api/simplify-logo` | "Simplificar con IA" el trazo del logo | ídem | ídem |
| `/api/suggest-mockup-name` | Nombre sugerido del diseño | `gpt-4o-mini` | `OPENAI_MOCKUP_NAME_MODEL` |
| `/api/parse-shipping` | Extraer datos de envío de texto libre (JSON) | `gpt-4o` | `OPENAI_MODEL` |
| `/api/knowledge` (`op: 'chat'`) | Asistente del Centro Alcohn (solo fragmentos publicados) | `gpt-4o-mini` | `OPENAI_API_KEY`, `OPENAI_KNOWLEDGE_MODEL` (opcional) |
| `/api/debug-env` | Muestra qué variables de IA están configuradas (sin valores) | — | — |
| vector-worker | Mejora de imagen previa a vectorizar (opcional) | `VECTOR_AI_ENHANCE_MODEL` | `VECTOR_AI_ENHANCE_ENABLED` |

**Centro Alcohn (`/api/knowledge`)**: a diferencia de los endpoints de mockup/envíos, **exige** sesión Supabase válida y usuario `APROBADO` (también rechaza FBTEST). Las operaciones `catalog`, `article` y `search` no llaman a OpenAI. El chat no tiene herramientas operativas ni acceso a pedidos en vivo. Detalle: [centro-informacion](../02-modules/centro-informacion/README.md).

Los endpoints de logo/nombre/shipping no exigen sesión de usuario ([AUD-SEC-004](../audits/seguridad.md#aud-sec-004)). En esos casos, si la IA falla, hay un camino alternativo (optimización local, parser local). El Centro degrada a manual/búsqueda si falta `OPENAI_API_KEY`.
