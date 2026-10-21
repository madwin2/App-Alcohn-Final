# ADR-028 · Registro de ediciones de vectores

Fecha: 2026-10-21. Estado: **activo**. La tabla `vector_ediciones` se creó en producción el 2026-10-21 con [`migration_vector_ediciones.sql`](../../migration_vector_ediciones.sql).

## Problema

La corrección automática del chequeo de fresa ([ADR-024](ADR-024-chequeo-de-fresa-en-vectorizacion.md)) no es confiable todavía y no hay forma de medir cuánto acierta ni de aprender de lo que corrige Fede a mano. ADR-024 §5 decidía no guardar nada del chequeo en la base. Objetivo del equipo (2026-10-20): que la corrección llegue a ser autónoma y confiable ([PLAN_CORRECCION_AUTONOMA_VECTORES](../../PLAN_CORRECCION_AUTONOMA_VECTORES.md)).

## Decisión

- **Se guarda cada vector que se confirma** (cambia ADR-024 §5, acordado con el equipo 2026-10-20): el original, lo que propuso la automática y lo que quedó, más el resumen del chequeo de fresa de cada versión (sin geometría), las operaciones (automáticas y el registro de acciones del editor) y el tiempo de edición.
- **Dónde**: Revisión (Confirmar y Confirmar todos), Asignar SVG y «Guardar el corregido en el sello» desde el chequeo en Pedidos, Producción y Programas.
- **No suma pasos ni pide motivo** (Q-VEC-014): todo se anota solo, en segundo plano. Si falla (o la tabla no está), el vector se guarda igual y solo queda un aviso en la consola.
- **Modo sombra**: si quien guarda no vio una propuesta automática (Asignar, chequeo de un sello guardado), igual se calcula y se guarda su SVG para comparar, pero no cuenta como rechazada.
- **Resultado**: `aceptada` (se guardó la automática tal cual), `rechazada` (había propuesta y se volvió al original), `editada` (versión a mano), `sin_propuesta`.
- **Tipo de caso** para medir la confianza por separado: letras pegadas, ojos tapados, mixto, sin problemas, 3 mm y Alimento.
- **Resultado real**: se cruza con `sello_rehacer_eventos` por sello, con los motivos `ERROR_EN_EL_VECTOR` (y el legado `ERROR_MEDIDA_O_VECTOR`), cuando el rehacer es posterior al guardado. `ERROR_DETECTADO_EN_MAQUINA` no se cuenta: puede no ser del vector.
- **Indicadores**: botón «Calidad del automático» en Vectorización: aceptación por tipo de caso en los últimos 30, 90 o 365 días y a qué nivel podría pasar cada tipo (90 % aplica sola, 95 % autónoma, Q-VEC-013; mínimo 🔶 100 casos). **Solo informa**: la app no cambia de nivel sola.
- **Casos de prueba**: `scripts/exportar-casos-vectores.mjs` (solo lee) baja casos reales a `src/lib/fresa/__fixtures__/casos/`; `casosReales.test.ts` corre la automática contra todos y falla si alguno empeora respecto de la base guardada.

## Datos

- Tabla `vector_ediciones` con RLS: leer e insertar para usuarios autenticados; no se edita ni se borra desde la app.
- SVG en el bucket `vector`, carpeta `ediciones/<sello_id>/` (`<ms>-original.svg`, `-auto.svg`, `-final.svg`; si el final es igual a otro, se reusa ese archivo). ~45 MB por mes con 150 vectores.

## Consecuencias

- Los sellos de 3 mm se registran igual pero nunca suben de nivel (Q-VEC-016).
- Las fases siguientes del plan (ajustar el planificador, puntaje de confianza, aplicar sola) necesitan meses de datos y los resultados de la [placa de prueba](../../prueba-mecanizado/README.md).
