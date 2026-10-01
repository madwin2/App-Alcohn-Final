# Centro Alcohn (centro de información)

## Propósito

Página integrada donde el equipo encuentra el **manual de uso**, problemas frecuentes, una introducción a Alcohn, un recorrido “Estoy empezando” y un **asistente** que responde solo con contenido documentado y citas navegables.

Leer el Centro o consultar al chat **no cambia pedidos**, no dispara WhatsApp ni crea envíos.

## Alcance (v1)

| Incluido | Fuera de alcance |
|---|---|
| Portada, búsqueda, filtros por área (etiqueta, no permiso) | Guías de actividades presenciales (sección vacía a propósito) |
| Lectura del manual publicado | Editor de documentos en la app |
| Chat documental con fuentes | Consultas de pedidos/clientes en vivo |
| Reporte copiable (“Informar un problema”) | Historial de chat en DB / feedback persistente |
| | Roles nuevos o bandeja de aprobación editorial |

## Rutas

| Ruta | Qué es |
|---|---|
| `/centro` | Portada, búsqueda, secciones |
| `/centro/articulos/:slug` | Artículo |
| `/centro?chat=1` | Abre el asistente |
| `/centro?seccion=actividades` | Estado vacío de actividades |
| `/centro?seccion=manual` | Índice del manual |

Menú: **Centro Alcohn** (ícono libro). Visible para todo el equipo autenticado (excepto FBTEST). Fuera de `OrdersScopeLayout`. Economía/Gastos siguen solo para el dueño.

## Fuentes publicadas

Inventario explícito en [`knowledge/catalog.json`](../../../knowledge/catalog.json). El artefacto generado es `api/_knowledge/bundle.json` (también en `knowledge/server/`).

**Publicados (revisión 2026-09-29):** capítulos del manual 01–12 y 14–15, conceptos básicos (extracto del README del manual) y Estoy empezando (curados en `knowledge/curated/`).

**En armado (oculto en la portada):** Sobre Alcohn — la tarjeta figura como “Próximamente”; la ruta del artículo redirige al Centro.

**Excluidos:** `docs/manual/13-economia-y-gastos.md`, `docs/11-operations-sops/`, auditorías, arquitectura, preguntas abiertas, ADR, planes `PLAN_*`, `AGENTS.md`.

## API

`POST /api/knowledge` con `Authorization: Bearer <access_token>` y body `{ op, ... }`:

| `op` | Uso |
|---|---|
| `catalog` | Metadatos de artículos |
| `article` | Markdown + relacionados |
| `search` | Búsqueda textual (sin IA) |
| `chat` | Asistente (requiere `GEMINI_API_KEY`; solo Gemini, sin OpenAI) |

Auth: verifica JWT en Supabase Auth, exige `solicitudes_registro.estado = APROBADO`, rechaza `fbtest@alcohn.app`.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL` o `VITE_SUPABASE_URL` | Verificar sesión |
| `SUPABASE_ANON_KEY` o `VITE_SUPABASE_ANON_KEY` | Cliente auth/REST con el JWT del usuario |
| `GEMINI_API_KEY` | Chat del asistente (preferido) |
| `GEMINI_KNOWLEDGE_MODEL` | Modelo Gemini opcional (si no, se elige uno flash disponible en la key) |

## Mantenimiento del contenido

1. Editar el Markdown fuente (manual o `knowledge/curated/`).
2. Actualizar metadatos en `knowledge/catalog.json` (`lastReviewedAt`, `reviewBasis`, relaciones).
3. `npm run knowledge:build` (también corre en `predev` y `build`).
4. Validar con `npm test -- src/lib/centro`.

No actualizar “respuestas aprendidas” del chat por separado: la fuente es el Markdown.

## Límites reales (chat)

- Pregunta ≤ 800 caracteres; hasta 8 turnos de historial (~4000 chars).
- Hasta 6 fragmentos recuperados; timeout 45 s.
- Rate limit en memoria: 20 req/min **por instancia** (no es global entre instancias de Vercel).
- Citas: solo `fragmentId` recuperados en esa consulta; el servidor arma títulos/URLs.

## Archivos clave

| Pieza | Path |
|---|---|
| Página | `src/app/centro/index.tsx` |
| UI | `src/components/centro/*` |
| Cliente | `src/lib/centro/*` |
| Build | `scripts/build-knowledge.mjs` |
| API | `api/knowledge.js`, `api/_knowledge/*` |
| Proxy dev | `vite-knowledge-proxy.ts` |

## Decisiones

Ver [ADR-023](../../13-decisions/ADR-023-centro-alcohn-catalogo-compartido.md).
