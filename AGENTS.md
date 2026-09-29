# AGENTS.md — Cómo trabajar en Alcohn AI

Instrucciones para **cualquier agente** (Claude Code, Cursor, etc.) y para personas que modifiquen este repositorio.

**Alcohn AI** es la aplicación interna de operación de **Alcohn** (sellos de bronce mecanizados por CNC). Paquete npm: `pedidos-app`. Comparte base de datos (Supabase) con la tienda web de Alcohn, que vive en otro repositorio.

La base de conocimiento está en [`docs/`](docs/README.md). Es la fuente de verdad de **qué hace el sistema y por qué**; el código es la fuente de verdad de **cómo**.

---

## 0. Regla de incertidumbre (obligatoria)

> **Nunca inventes un proceso de negocio para completar información faltante.**
>
> Si una decisión no puede determinarse mediante el código o la documentación:
> 1. Identificá qué información falta.
> 2. Explicá por qué afecta la solución.
> 3. Consultá al usuario.
> 4. No implementes silenciosamente una suposición importante.
> 5. Una vez respondida, incorporá esa información a la documentación correspondiente (y marcá la pregunta como respondida/documentada en `docs/14-open-questions/`).

Antes de preguntar, revisá si la duda ya está registrada en [`docs/14-open-questions/`](docs/14-open-questions/README.md). Si está, citá su ID. Si no, agregala.

Distinguí siempre: ✅ lo que el código demuestra · 🔶 lo que se infiere · ❓ lo que no se sabe ([convenciones](docs/_meta/convenciones.md)).

---

## 1. Antes de modificar una funcionalidad

0. **Si la tarea es de negocio o de proceso** (mejorar un proceso, proponer una funcionalidad, escribir algo que lea el cliente), leer primero el contexto de la empresa: [`docs/00-overview/la-empresa.md`](docs/00-overview/la-empresa.md) (visión, clientes, pilares, tono, marca).
   Para saber **cómo se usa hoy** una pantalla desde el punto de vista del equipo, está el [manual de uso](docs/manual/README.md).
1. **Identificar el módulo afectado** (inventario: [`docs/02-modules/README.md`](docs/02-modules/README.md)).
2. **Leer su documentación** usando el [índice de ruteo de contexto](docs/README.md#índice-para-agentes-context-routing): cargar solo lo que la tabla indica para esa área.
3. **Leer los workflows relacionados** ([`docs/03-workflows/`](docs/03-workflows/README.md)): casi todo cambio en un módulo afecta a otro (p. ej. un estado de venta dispara WhatsApp y envíos).
4. **Leer las reglas de negocio relacionadas** ([`docs/04-business-rules/`](docs/04-business-rules/README.md)) y las **máquinas de estado** ([`docs/06-state-machines/`](docs/06-state-machines/README.md)).
5. **Inspeccionar el código actual**. La documentación puede estar desactualizada; las referencias por nombre de función son estables, las de línea no.
6. **Comparar documentación contra implementación**. Si no coinciden: manda el código; actualizá la doc o registrá la diferencia en [`docs/audits/`](docs/audits/README.md).
7. **Identificar información faltante** (fronteras con el mundo real en [`docs/10-operational-boundaries/`](docs/10-operational-boundaries/README.md)).
8. **Preguntar antes de asumir** una regla de negocio importante (sección 0).

Además, verificá **efectos automáticos** antes de tocar estados o tablas: triggers ([`docs/08-automations/triggers.md`](docs/08-automations/triggers.md)) y cron ([`docs/08-automations/cron.md`](docs/08-automations/cron.md)). Cambiar un estado puede mandar un WhatsApp al cliente, descontar stock o pagar una etiqueta.

## 2. Durante el diseño

No empezar a programar de inmediato. Primero:

- **Reconstruir el problema** con palabras del negocio.
- **Identificar el proceso actual** (workflow + pantallas + estados + automatizaciones).
- **Detectar restricciones**: reglas "DB" (no se pueden saltear) vs "UI/Servicio"; integraciones externas; lo que corre en el navegador.
- **Identificar actores** (quién hace cada paso; ver Q-USR-001 si no se sabe).
- **Analizar efectos sobre otros módulos** (Pedidos ↔ Producción ↔ Programas ↔ Envíos ↔ Stock ↔ WhatsApp ↔ Economía ↔ tienda web).
- **Proponer alternativas** y **explicar trade-offs**.
- **Listar las preguntas necesarias** para el usuario antes de implementar.

## 3. Después de implementar

Actualizar, en el mismo cambio:

- Documentación del **módulo** (`docs/02-modules/<modulo>/`).
- **Workflows** afectados (`docs/03-workflows/`).
- **Reglas de negocio** (`docs/04-business-rules/`, con ID nuevo si corresponde).
- **Estados** (`docs/06-state-machines/`) y **datos** (`docs/05-data/`).
- **Integraciones/automatizaciones** (`docs/07-integrations/`, `docs/08-automations/`).
- **Decisiones** (`docs/13-decisions/`) cuando se eligió entre alternativas.
- **Preguntas abiertas** resueltas (`docs/14-open-questions/`: estado → documentada).
- **Manual de uso** (`docs/manual/`): si el cambio es visible para usuarios, actualizar el capítulo de esa pantalla (nombres de botones, pasos, mensajes automáticos).
- **Changelog para el equipo**: si el cambio es visible para usuarios, agregar entrada en `src/lib/changelog/entries.ts` (regla `.cursor/rules/changelog-novedades.mdc`).
- Correr `npm run typecheck`, `npm run lint` y `npm test`.

El objetivo es que **código y conocimiento evolucionen juntos**. Ver [`docs/_meta/mantenimiento.md`](docs/_meta/mantenimiento.md).

## 4. Reglas de seguridad y de datos

- **No hay entorno de staging conocido** (Q-ARQ-004): la base Supabase es producción y la comparte la tienda web. No ejecutar escrituras, migraciones ni despliegues sin permiso explícito del usuario.
- Los scripts de `scripts/` y los workers escriben en producción o crean envíos reales en MiCorreo/Andreani: usar `--dry-run` y pedir confirmación.
- Nunca copiar secretos, tokens, API keys ni la anon key a la documentación o al chat. Documentar solo nombres de variables.
- Tener presente [`docs/audits/seguridad.md`](docs/audits/seguridad.md): muchas tablas no tienen RLS; no ampliar esa exposición.
- No refactorizar ni "arreglar" inconsistencias de paso: registrarlas en `docs/audits/` y proponerlas por separado.

## 5. Mapa rápido del repo

| Carpeta | Contenido |
|---|---|
| `src/app/<pagina>/` | Pantallas |
| `src/components/<modulo>/` | UI por módulo |
| `src/lib/supabase/services/` | Acceso a datos + reglas (1 archivo por dominio) |
| `src/lib/<dominio>/` | Lógica pura con tests (programas, vectorizacion, abecedario, precios…) |
| `supabase/functions/` | Edge functions (webhook-bot, confirm-web-order, meta-conversion, programa-sync) |
| `api/` | Funciones serverless (Vectorizer.AI, OpenAI, proxies a workers) |
| `services/` | Workers externos (andreani, micorreo, micorreo-api, vector) |
| `aspire-gadgets/` | Gadgets Lua para Vectric Aspire |
| `migration_*.sql`, `PLAN_*.md` (raíz) | Historia de migraciones y planes de diseño |
| `docs/` | Base de conocimiento |

Arquitectura completa: [`docs/12-architecture/README.md`](docs/12-architecture/README.md).
