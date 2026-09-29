# Mantenimiento de la base de conocimiento

## Principios

1. **Código y documentación cambian juntos** (mismo commit/PR).
2. **Una verdad por lugar**: cada regla vive en `04-business-rules` con un ID; los módulos y workflows la **referencian**, no la reescriben en detalle.
3. **Nada se inventa**: lo que no se sabe es una pregunta en `14-open-questions`.
4. **Trazabilidad útil**: citar función/archivo cuando una afirmación no es obvia.

## Qué actualizar según el tipo de cambio

| Cambio | Documentos |
|---|---|
| Pantalla o acción nueva | módulo, workflow, changelog del producto (`src/lib/changelog/entries.ts`), **capítulo del [manual de uso](../manual/README.md)** |
| Cambio visible en una pantalla (botón, texto, columna, mensaje) | capítulo del [manual de uso](../manual/README.md) y, si aplica, [problemas frecuentes](../manual/15-problemas-frecuentes.md) |
| Estado nuevo o transición nueva | `06-state-machines`, reglas, módulo, glosario |
| Tabla/columna nueva | `05-data` (ficha + inconsistencias de nombres si aplica), `12-architecture/base-de-datos.md` si cambia la forma de verificar |
| Trigger/cron/edge function | `08-automations`, reglas "DB", workflow afectado |
| Integración nueva o cambiada | `07-integrations`, fronteras, SOP |
| Decisión entre alternativas | `13-decisions` |
| Respuesta del equipo a una pregunta | la pregunta (estado + respuesta) y todos los documentos que la citaban |
| Hallazgo sin corregir | `audits/` |
| Cambio en un proceso físico | `10-operational-boundaries` y el SOP en `11-operations-sops` |

## Revisión periódica (sugerida)

- **Mensual**: recorrer `14-open-questions` con el equipo; volcar respuestas.
- **Por release grande**: verificar `08-automations/triggers.md` y `cron.md` contra la base (consultas en `12-architecture/base-de-datos.md`); actualizar conteos de estados si se usan como referencia.
- **Links**: correr el chequeo de la sección siguiente.

## Chequeo de links (manual)

```bash
# desde la raíz del repo, lista links relativos rotos en docs/
node -e '
const fs=require("fs"),path=require("path");
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith(".md")?[path.join(d,e.name)]:[]);
for(const f of [...walk("docs"),"AGENTS.md"]){const t=fs.readFileSync(f,"utf8");for(const m of t.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)){const l=m[1];if(/^https?:/.test(l))continue;const p=path.resolve(path.dirname(f),l);if(!fs.existsSync(p))console.log(f+" -> "+l);}}'
```

## Estilo

- Español rioplatense neutro, frases cortas, tablas para enumeraciones.
- Estados de la base entre comillas simples (`'Sin Hacer'`).
- Sin secretos, sin datos personales de clientes.
