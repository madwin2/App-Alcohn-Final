# ADR-023 — Centro Alcohn: catálogo compartido, chat documental y actividades diferidas

- **Estado**: Implementada (2026-09-29)
- **Contexto**: El equipo necesita un lugar en la app para aprender y consultar sin depender siempre de quien ya conoce el proceso. Había un manual en `docs/manual/`, pero no estaba integrado ni consultable por chat.

## Decisión

1. **Un solo catálogo publicado** (`knowledge/catalog.json` → artefacto `api/_knowledge/bundle.json`) alimenta lectura, búsqueda y chat. No hay una base paralela de reglas para el asistente.
2. **Contenido por lista explícita**, nunca un barrido de `docs/`. Economía del dueño, SOPs físicos, auditorías y material de agentes quedan fuera.
3. **Actividades** aparecen en la UI con estado vacío; el tipo `activity` existe en el modelo, pero el catálogo inicial publica cero actividades. Las aporta el equipo después.
4. **Chat documental**: recupera fragmentos del catálogo, llama a OpenAI en servidor, y solo acepta citas de fragmentos recuperados en esa consulta. Sin herramientas operativas ni datos en vivo.
5. **API autenticada** (`POST /api/knowledge`) con JWT de Supabase + usuario APROBADO; FBTEST bloqueado. El Markdown no se publica en `public/` ni se embebe en el bundle del cliente.

## Alternativas descartadas

- Embebido de todo `docs/` en el frontend (`import.meta.glob`): expondría material interno.
- Base vectorial en v1: volumen bajo; búsqueda textual alcanza.
- Editor / bandeja de feedback en DB: fuera de alcance; reporte copiable.
- Llenar Actividades con SOPs incompletos o procedimientos inventados: prohibido por el plan del producto.

## Consecuencias

- Cambiar el manual exige regenerar el catálogo (`npm run knowledge:build`).
- El chat depende de `GEMINI_API_KEY` (y opcionalmente `GEMINI_KNOWLEDGE_MODEL`); sin eso, manual/búsqueda siguen. No usa OpenAI.
- Módulo documentado en [`docs/02-modules/centro-informacion/`](../02-modules/centro-informacion/README.md).

## Fuente

`PLAN_CENTRO_INFORMACION_ALCOHN.md`, conversación con Julián (2026-09-29).
