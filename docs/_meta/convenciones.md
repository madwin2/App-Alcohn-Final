# Convenciones de la base de conocimiento

Este archivo define **cómo se escribe y se lee** la documentación de `/docs`. Aplica a personas y a agentes.

## 1. Niveles de certeza (obligatorio)

Toda afirmación relevante debe poder clasificarse en uno de estos tres niveles. Cuando no sea obvio por contexto, marcala explícitamente:

| Marca | Significado | Cómo se usa |
|---|---|---|
| ✅ **Código** | Verificado leyendo la implementación (frontend, backend, SQL, edge function, worker) o la base de datos en vivo. | Se acompaña de una referencia en "Implementación relacionada". |
| 🔶 **Inferencia** | Deducción razonable a partir del código (nombres, pantallas, estados), pero el código no explica el motivo de negocio ni garantiza que así se use. | Siempre redactada como inferencia ("parece", "probablemente"). Nunca como hecho. |
| ❓ **Desconocido** | Proceso físico, decisión humana, criterio de negocio o paso externo que no aparece en el código. | Se convierte en una pregunta con ID en [`14-open-questions`](../14-open-questions/README.md). |

Para pasos externos dentro de SOPs se usa el marcador literal **`[REQUIERE INFORMACIÓN DEL EQUIPO]`**.

## 2. Referencias al código

- Rutas relativas a la raíz del repo, con número de línea cuando ayuda: `src/lib/supabase/services/programs.service.ts:880`.
- Las líneas envejecen: si una referencia no coincide, buscá el nombre de la función. El nombre es la referencia estable; la línea es una ayuda.
- Funciones SQL / triggers viven **en la base de datos**. Los archivos `migration_*.sql` de la raíz son historia, no necesariamente el estado actual. Para verificar, consultá la DB (ver [`12-architecture/base-de-datos.md`](../12-architecture/base-de-datos.md)).

## 3. Nombres de estados

- En la base de datos los estados se guardan en español con mayúsculas mixtas (`'Sin Hacer'`, `'Seguimiento Enviado'`).
- En TypeScript se usan constantes en MAYÚSCULAS (`SIN_HACER`, `SEGUIMIENTO_ENVIADO`).
- En la documentación se usa el valor de base de datos entre comillas simples y, si hace falta, el equivalente TS entre paréntesis.

## 4. IDs

| Prefijo | Qué identifica | Dónde vive |
|---|---|---|
| `BR-<ÁREA>-NNN` | Regla de negocio implementada | `04-business-rules/` |
| `Q-<ÁREA>-NNN` | Pregunta abierta | `14-open-questions/` |
| `WF-NN` | Workflow transversal | `03-workflows/` |
| `FR-NN` | Frontera Alcohn AI ↔ mundo real | `10-operational-boundaries/` |
| `ADR-NNN` | Decisión de arquitectura/producto | `13-decisions/` |
| `AUD-<TIPO>-NNN` | Hallazgo de auditoría | `audits/` |

Áreas usadas: `GEN` (general), `PED` (pedidos), `VEN` (venta/cobro), `PROD` (producción), `VEC` (vectorización), `PROG` (programas), `CNC` (fabricación física), `ENV` (envíos), `AND` (Andreani), `COR` (Correo Argentino), `STK` (stock), `MOCK` (mockups), `COM` (comercial), `WEB` (tienda web), `PRE` (precios), `ECO` (economía/gastos), `NOT` (notificaciones), `WA` (WhatsApp/bot), `USR` (usuarios/permisos), `INN` (innovación), `ARQ` (arquitectura), `DAT` (datos).

## 5. Plantilla de documento de módulo

Ver [`plantilla-modulo.md`](plantilla-modulo.md). No todas las secciones aplican siempre; si una sección no aplica, se omite (no se rellena con texto genérico).

## 6. Qué NO va en estos documentos

- Secretos, tokens, contraseñas, API keys, URLs con credenciales. Se documenta **qué** credencial existe y **dónde** se configura (nombre de variable), nunca su valor.
- Pasos físicos inventados. Si no está en el código ni fue confirmado por el equipo, es una pregunta.
- Descripciones triviales de componentes ("Button.tsx es un botón").

## 7. Fecha de corte

Esta base se construyó a partir del estado del repositorio y de la base de datos al **2026-09-27** (último commit `aa0604d`). Los conteos de filas citados son de esa fecha y sirven solo como orden de magnitud.
