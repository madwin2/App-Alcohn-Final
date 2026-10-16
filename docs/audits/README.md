# Auditorías

- [Prueba remota C en producción, 2026-10-16](programas-prueba-remota-c-2026-10-16.md): programa de prueba, gadget 3.2, 15 trayectorias, archivo ligado al evento y programa LISTO; limpieza y hallazgos (base de Descargas no limpia, Preparar base antes de importar).
- [Conexión y confirmación app/Aspire, 2026-10-16](programas-conexion-validacion-2026-10-16.md): prueba HTTP del handler real y SQL en memoria; archivo ligado al resultado nativo, bloqueo de subidas/reintentos atrasados y protocolo 4 pendiente de activar.

- [Prueba real app → Aspire C, 2026-10-16](programas-aspire-real-2026-10-16.md): ocho SVG exportados desde la pantalla, dos revisiones, conservación de la corrección, quince trayectorias y vista previa nativas; sin producción ni CNC.

Resultado de recorrer el código y la base mientras se construía esta documentación. Objetivo: **entender, no refactorizar**. Nada fue corregido.

| Documento | Contenido | Ítems |
|---|---|---|
| [inconsistencias.md](inconsistencias.md) | Reglas implementadas de formas distintas, estados duplicados, datos contradictorios | 26 |
| [posible-codigo-muerto.md](posible-codigo-muerto.md) | Código, tablas, estados y archivos sin uso aparente | 16 |
| [comportamientos-no-documentados.md](comportamientos-no-documentados.md) | Efectos sorprendentes que un usuario/agente no esperaría | 12 |
| [observaciones-de-arquitectura.md](observaciones-de-arquitectura.md) | Riesgos y patrones estructurales | 11 |
| [seguridad.md](seguridad.md) | Exposición de datos y endpoints | 10 |
| [programas-automatizacion-2026-10-15.md](programas-automatizacion-2026-10-15.md) | Límites del armado, anchos útiles, recetas, identidad, validación y perfil fino de Alimento | 5 |
| [programas-preparacion-validacion-2026-10-15.md](programas-preparacion-validacion-2026-10-15.md) | Validación local de editor, contratos, Lua y SQL; checks globales previos y calificación nativa pendiente | — |

Para cada hallazgo que se decida atender: crear una tarea, referenciar el ID (`AUD-…`), y al resolverlo actualizar el estado acá ("resuelto AAAA-MM-DD, commit …") y los documentos de módulo afectados.
