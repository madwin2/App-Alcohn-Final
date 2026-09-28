# Plantilla — documento de módulo

Copiar esta estructura al crear `docs/02-modules/<modulo>/README.md`. Omitir secciones que no apliquen.

```markdown
# <Nombre del módulo>

> Ruta(s): `/ruta` · Archivo de página: `src/app/<...>/index.tsx`
> Última verificación contra código: AAAA-MM-DD (commit `xxxxxxx`)

## Propósito
Qué problema resuelve y cómo encaja en Alcohn AI. (✅/🔶)

## Usuarios
Quién lo usa o parece usarlo. Las áreas reales viven en `usuario_area`; los roles no existen como permiso (ver 09-roles-permissions).

## Conceptos principales
Entidades y conceptos con link a `05-data/entidades/` y al glosario.

## UI
Pantallas, vistas, modales, acciones disponibles, navegación.

## Flujo
Qué hace un usuario desde que entra hasta que termina la tarea.

## Estados
Estados que el módulo lee o escribe (link a `06-state-machines/`).

## Acciones
Por acción: precondiciones · cambios · datos afectados · side effects · integraciones · errores · efectos en otros módulos.

## Reglas de negocio
Solo las implementadas, con ID `BR-...` y dónde viven.

## Validaciones
Frontend / backend / DB.

## Datos
Tablas, columnas, buckets.

## Dependencias e integraciones

## Automatizaciones

## Casos límite

## Fronteras con el mundo real
Link a `10-operational-boundaries/`.

## Preguntas abiertas
Links a `14-open-questions/`.

## Implementación relacionada
Archivos, funciones, tablas, endpoints.
```
