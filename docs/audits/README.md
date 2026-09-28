# Auditorías

Resultado de recorrer el código y la base mientras se construía esta documentación. Objetivo: **entender, no refactorizar**. Nada fue corregido.

| Documento | Contenido | Ítems |
|---|---|---|
| [inconsistencias.md](inconsistencias.md) | Reglas implementadas de formas distintas, estados duplicados, datos contradictorios | 25 |
| [posible-codigo-muerto.md](posible-codigo-muerto.md) | Código, tablas, estados y archivos sin uso aparente | 16 |
| [comportamientos-no-documentados.md](comportamientos-no-documentados.md) | Efectos sorprendentes que un usuario/agente no esperaría | 12 |
| [observaciones-de-arquitectura.md](observaciones-de-arquitectura.md) | Riesgos y patrones estructurales | 11 |
| [seguridad.md](seguridad.md) | Exposición de datos y endpoints | 10 |

Para cada hallazgo que se decida atender: crear una tarea, referenciar el ID (`AUD-…`), y al resolverlo actualizar el estado acá ("resuelto AAAA-MM-DD, commit …") y los documentos de módulo afectados.
