# Plan — Corrección automática de vectores confiable y autónoma

> Objetivo: que la app corrija y optimice los vectores para la fresa sola, sin
> que alguien tenga que revisar cada uno, y que se pueda confiar en el resultado.
> Planteado por el equipo el 2026-10-20. Base: el chequeo de fresa y la
> corrección automática que ya existen ([ADR-024](docs/13-decisions/ADR-024-chequeo-de-fresa-en-vectorizacion.md),
> [chequeo-de-fresa.md](docs/02-modules/vectorizacion/chequeo-de-fresa.md)).

---

## Índice

| § | Tema | Estado |
|---|---|---|
| 1 | Situación actual y por qué no es confiable | — |
| 2 | Principios | — |
| 3 | Fase 0 · Prueba de mecanizado y umbrales reales | placa lista, falta fabricarla |
| 4 | Fase 1 · Registro de ediciones | ✅ hecho (2026-10-21, ADR-028); falta crear la tabla |
| 5 | Fase 2 · Medir: tasa de aceptación y casos de prueba | ✅ hecho; esperando datos |
| 6 | Fase 3 · Mejorar la corrección con lo aprendido | por hacer |
| 7 | Fase 4 · Autonomía por niveles | modo sombra ✅; aplicar sola espera datos |
| 8 | Lo que no se hace (por ahora) | — |
| 9 | Preguntas abiertas | Q-VEC-015 abierta; 013, 014 y 016 respondidas |
| 10 | Orden y tamaño | — |

---

## 1. Situación actual y por qué no es confiable

✅ Hoy (código):

- **Chequeo de fresa** (`src/lib/fresa/`): simula el V-carve y marca dónde se pierde el diseño (letras que se pegan, ojos tapados) con umbrales fijos en `config.ts`: separar a **0,3 mm** de profundidad, trazo negro mínimo **0,4 mm**, punta configurada **0,2 mm** (la física es 0,1).
- **Corrección automática** (`autoCorregir`, `fix.ts`, `layout.ts`): un planificador de operaciones (mover letras o renglones, abrir espaciado, offset de ojos) que corre al llegar cada vector a Revisión. Si cambia algo y nadie eligió, **queda elegida**.
- **Elegir versión** en Revisión (Original / Automático / A mano) y **editor manual** con herramientas tipo Illustrator.
- **No se guarda nada** del chequeo ni de las ediciones (ADR-024 §5): se recalcula en memoria.

Por qué no alcanza:

1. **Los umbrales no están validados en la máquina.** Si 0,3 mm o la punta de 0,2 no son lo real, corrige lo que no hace falta y deja pasar lo que se pierde.
2. **No hay con qué medir.** No sabemos qué porcentaje de las propuestas acepta Fede sin tocar, ni si una mejora del algoritmo lo hace mejor o peor.
3. **No sabe cuándo abstenerse.** Corrige siempre que puede; no dice qué tan seguro está.
4. **No aprende.** Lo que hace Fede a mano se pierde: la próxima vez la automática propone lo mismo.

Datos del equipo (2026-10-20): **~150 vectores por mes**, los edita **casi siempre Fede** (un solo criterio), se guarda en **Supabase** sin problema.

## 2. Principios

- **Medir antes de automatizar.** Ningún paso de autonomía se activa por sensación: se activa con un número.
- **Abstenerse es un resultado válido.** Mejor «esto lo tiene que ver Fede» que una corrección mala.
- **Reglas que se entienden.** Con ~1.800 vectores por año alcanza para calibrar reglas y estadísticas, no para entrenar un modelo propio. Toda corrección tiene que poder explicarse («separé la R de la a 0,1 mm porque el hueco era de 0,3»).
- **El diseño del cliente manda.** La corrección cambia lo mínimo para que la fresa llegue; nunca «mejora» el diseño.

## 3. Fase 0 · Prueba de mecanizado y umbrales reales

Placa de 34 × 34 mm en bronce, receta Clásico, sellada en cuero y madera: [`prueba-mecanizado/`](prueba-mecanizado/README.md). Cada celda tiene la predicción de la app con punta configurada y punta física.

Pasos:

1. Fabricar la placa (como un sello más; en Revisión elegir «Original»).
2. Anotar cada celda en bronce, cuero y madera (0 a 2) y, si se puede, la profundidad.
3. Comparar contra la predicción y ajustar en `src/lib/fresa/config.ts`:
   - `tipDiameterMm` (¿0,2 o 0,1 representa la realidad?)
   - `minDepthMm` (¿0,3 es el mínimo para que se separe y marque?)
   - `MIN_BLACK_WIDTH_MM` (hoy 0,4: fila B)
   - nuevo: **alto mínimo de letra** por tipografía (filas E y F), para avisar antes de vectorizar.
4. Correr los tests de `src/lib/fresa/` y los vectores reales de referencia (OliFlowers, Rockets Butchery, Magui Lucero, 4708) para ver cuánto cambia el resultado.
5. Documentar: respuesta en Q-VEC, actualización de ADR-024 y de `chequeo-de-fresa.md`.

Entregable: umbrales medidos y una tabla de resultados versionada en `prueba-mecanizado/`.
Si hace falta, una segunda placa más fina alrededor de los límites que aparezcan (por ejemplo, huecos de 0,45 a 0,65 de a 0,02).

## 4. Fase 1 · Registro de ediciones

> ✅ Implementado (2026-10-21): `registrarEdicion` en `src/lib/supabase/services/vectorEdiciones.service.ts`, enganchado en Revisión, Asignar SVG y el chequeo de Pedidos, Producción y Programas; el editor anota cada acción. Tabla en [`migration_vector_ediciones.sql`](migration_vector_ediciones.sql). Detalle y diferencias con este diseño: [ADR-028](docs/13-decisions/ADR-028-registro-de-ediciones-de-vectores.md).

Guardar, por cada vector que se confirma, qué propuso la automática y qué quedó al final. Es lo que alimenta todo lo demás; conviene prenderlo cuanto antes porque los datos tardan en juntarse.

### Qué se guarda

Tabla nueva `vector_ediciones` (🔶 diseño propuesto, a revisar antes de migrar):

| Columna | Qué es |
|---|---|
| `id`, `created_at`, `usuario` | quién y cuándo |
| `sello_id`, `orden_id` | a qué sello corresponde |
| `origen` | `revision` · `asignar` · `pedidos` · `produccion` · `programas` |
| `svg_original_path` | el vector como salió de Vectorizer (o el subido) |
| `svg_auto_path` | lo que propuso la automática (null si no propuso nada) |
| `svg_final_path` | lo que se guardó |
| `eleccion` | `original` · `auto` · `manual` |
| `operaciones` | lista de lo que se hizo en el editor, con parámetros (herramienta, pieza, valor) |
| `chequeo_original`, `chequeo_auto`, `chequeo_final` | resumen: lugares por tipo y severidad, ancho mínimo, medida |
| `medida_mm`, `receta`, `alimento` | contexto de fabricación |
| `version_algoritmo` | `FRESA_ANALYSIS_VERSION` y versión del planificador |
| `segundos_edicion` | tiempo en el editor (cuánto trabajo ahorraría la automática) |

Los SVG van al bucket `vector` en una carpeta propia (`ediciones/<sello_id>/…`). Volumen estimado: 150 × 3 archivos × ~100 KB ≈ 45 MB por mes.

### Dónde se engancha

- **Revisión** (`RevisionTab.confirmOne`) y **Asignar SVG** (`AsignarTab.confirm`): al confirmar.
- **Pedidos / Producción / Programas** (`guardarVectorCorregido`): al usar un corregido desde el chequeo.
- **Editor** (`FresaEditor`): cada `commit` ya tiene un texto; se suma un registro estructurado de la operación (`{ tool, op, piezas, valor }`) que viaja con «Terminar edición».

### El resultado real

El dato más valioso es si **el sello salió bien**. Ya existe `sello_rehacer_eventos` con motivos `ERROR_EN_EL_VECTOR` y `ERROR_DETECTADO_EN_MAQUINA`: se cruza por `sello_id` y cada edición queda marcada como «salió bien» o «hubo que rehacer».

### Cuidados

- La tabla nace **con RLS** (ver [auditoría de seguridad](docs/audits/seguridad.md)): no ampliar la exposición.
- Cambia ADR-024 §5 («no se guarda en la base»): nuevo ADR al implementar.
- No suma pasos para Fede: todo se registra solo, sin pedir motivo (Q-VEC-014, 2026-10-21).

## 5. Fase 2 · Medir: tasa de aceptación y casos de prueba

> ✅ Implementado (2026-10-21): botón **Calidad del automático** en Vectorización (`CalidadAutomaticoDialog`, métricas en `edicionesMetricas.ts`), `scripts/exportar-casos-vectores.mjs` y `src/lib/fresa/casosReales.test.ts`.

### Indicadores

- **Aceptación sin cambios**: de los vectores donde la automática propuso algo, cuántos se guardaron tal cual (`eleccion = auto` sin operaciones encima).
- **Rechazo**: cuántos volvieron al original.
- **Edición encima**: cuántos se corrigieron a mano después de la automática, y qué se hizo.
- **Lugares que quedan**: cuántos problemas deja la automática que Fede tuvo que resolver.
- **Rehacer por vector**: sellos rehechos por `ERROR_EN_EL_VECTOR` después de una corrección.

Todo **por tipo de caso** (letras pegadas, ojos, texto en arco, logo, alimento, tamaño), porque la confianza no es pareja: puede acertar siempre en letras pegadas y fallar en logos.

Dónde verlo: una sección en Vectorización (o en el Centro de información) con los números del último mes.

### Casos de prueba

Los vectores que Fede dejó bien son la «respuesta correcta». Un script exporta un conjunto de casos (original + final + contexto) a fixtures, y un test corre la automática contra todos: cuántos resuelve, cuánto se parece a lo que hizo Fede, si empeoró alguno. Se corre **cada vez que se toca el algoritmo**. Así una mejora se mide antes de subirla.

## 6. Fase 3 · Mejorar la corrección con lo aprendido

Con los umbrales reales (Fase 0) y los datos (Fases 1-2):

1. **Copiar la forma de trabajar de Fede.** Ver qué operación usa para cada tipo de problema (¿separa letras o afina? ¿cuánto? ¿mueve el renglón o la letra?) y ajustar el orden y los límites del planificador (`layout.ts`, `fix.ts`).
2. **Puntaje de confianza** en cada propuesta, a partir de: cuántos lugares resuelve, cuánto cambia el diseño (mm movidos, % de negro sacado), qué tipo de caso es y cómo le fue históricamente con ese tipo. Se muestra en Revisión («Automático · confianza alta») y decide la Fase 4.
3. **Abstención explícita.** Si la confianza es baja, no queda elegida: se marca «para Fede» con el motivo.
4. **Avisos antes de vectorizar** con los límites medidos (por ejemplo, «letras de menos de 1,3 mm en Times no se separan»), para pedir cambios al cliente antes de fabricar.

## 7. Fase 4 · Autonomía por niveles

Se sube de nivel **por tipo de caso** y solo con números; se baja solo si los números caen.

| Nivel | Qué hace la app | Cuándo |
|---|---|---|
| 1 · Sugiere | Hoy: propone y alguien elige | — |
| 2 · Sombra | Corre en silencio y se compara con lo que hace Fede, sin cambiar nada | ✅ Desde que hay registro: en Asignar y en el chequeo de un sello guardado, la automática se calcula y se guarda aunque nadie la haya pedido |
| 3 · Aplica y marca | Si la confianza es alta, guarda la corrección sola; el resto queda para revisar | Tipo de caso con ≥ **90 %** de aceptación sin cambios y sin rehacer por vector (Q-VEC-013) |
| 4 · Autónoma | Corrige y guarda; se revisa una muestra | Tipo de caso con ≥ **95 %** de aceptación sostenida en nivel 3 (Q-VEC-013) |

❓ Falta definir con los datos la cantidad mínima de casos por tipo antes de subir de nivel (🔶 propuesta: 100).

**Nunca automáticos**: los sellos de **3 mm** (Q-VEC-016). Quedan siempre en nivel 1 (sugiere). Ya aplicado en Revisión (2026-10-21).

Bajada automática: si un tipo de caso tiene un rehacer por vector o la aceptación cae por debajo del umbral, vuelve al nivel anterior y avisa.

## 8. Lo que no se hace (por ahora)

- **Modelo propio de inteligencia artificial que edite vectores.** No hay volumen para entrenarlo (necesitaría miles de ejemplos por tipo de caso) y editar geometría a décimas de mm no es su fuerte. Se revisa si el volumen crece mucho.
- **IA de visión como medidor.** No es confiable por debajo del milímetro (ya descartado en ADR-024). Puede sumarse para **explicar** una corrección, no para decidirla.

## 9. Preguntas abiertas

Registradas en [`docs/14-open-questions/vectorizacion.md`](docs/14-open-questions/vectorizacion.md):

- **Q-VEC-013** ✅ · Confiable: 90 % aplica sola y marca; 95 % autónoma.
- **Q-VEC-014** ✅ · Solo se registra lo que se hace, sin pedir motivo.
- **Q-VEC-015** ❓ · ¿Cómo se mide la profundidad en la placa de bronce?
- **Q-VEC-016** ✅ · Los sellos de 3 mm nunca se modifican automáticamente.

## 10. Orden y tamaño

| Paso | Qué | Tamaño | Depende de |
|---|---|---|---|
| 1 | Fabricar y anotar la placa | taller | — |
| 2 | Tabla `vector_ediciones` + registro en Revisión / Asignar / corregidos | ✅ (falta aplicar la migración) | permiso para migrar |
| 3 | Registro de operaciones del editor | ✅ | 2 |
| 4 | Calibrar `config.ts` con la placa | S | 1 |
| 5 | Indicadores y vista del último mes | ✅ (se llena con los datos) | 2 + un mes de datos |
| 6 | Casos de prueba exportados y test de regresión | ✅ (se llena con los datos) | 2 |
| 7 | Ajustes del planificador y puntaje de confianza | M–L | 4, 5, 6 |
| 8 | Modo sombra y niveles de autonomía | M | 7 |

Los pasos 1 y 2 van en paralelo: la placa depende de tiempo de máquina y el registro recién da valor con varios meses de datos.
