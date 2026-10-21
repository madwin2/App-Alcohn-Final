# ADR-024 · Chequeo de fresa al vectorizar (no en Aspire)

- **Fecha**: 2026-10-14
- **Estado**: Implementada (rama `feat/chequeo-fresa-vectorizacion`, pendiente de merge)
- **Fuente**: conversación con Julián (2026-10-14), [Q-CNC-008](../14-open-questions/produccion-fabricacion.md#q-cnc-008)

## Contexto

El mayor trabajo manual al armar programas es corregir en Aspire los detalles donde la fresa más fina no entra (texto muy junto, ojos de letras chicos): Fede agranda, mueve nodos y hace offsets a mano. Se evaluó automatizarlo dentro del gadget de Aspire.

## Decisión

1. Detectar y corregir **en la app, al vectorizar** (Revisión, Asignar SVG) y donde se ve un vector guardado (Pedidos, Producción, Programas). No se agregan capas, marcadores ni pasos al gadget de Aspire.
2. Detección **geométrica exacta** (apertura morfológica del blanco con el radio de la fresa a la profundidad mínima), no un modelo de IA mirando la imagen: las medidas en juego son de décimas de milímetro.
3. Motor de geometría: **Clipper2** (`clipper2-ts`, TypeScript puro, sin WebAssembly), en un Web Worker.
4. Corrección **local y conservadora**: abre solo los huecos marcados lo justo para la fresa; si la corrección cambiaría la topología del diseño, no se aplica y queda para edición manual. Siempre con vista previa y confirmación.
   - **Revisión 2026-10-14**: la primera versión sacaba un círculo del tamaño de la fresa en cada zona y rompía el diseño ("es peor que no hacer nada"). Se reemplazó por un planificador de operaciones que **adapta el diseño**: mover letras o renglones respetando la alineación (o abrir el espaciado del renglón parejo), offset paralelo de ojos y ranuras con trazo mínimo de 0,4 mm, y aceptar los ángulos. Reglas en [Q-VEC-010](../14-open-questions/vectorizacion.md#q-vec-010).
   - **Revisión 2026-10-14 (2)**: el criterio pasó de "¿llega a 0,4 mm?" a **simular el V-carve**: la fresa sube donde no entra, así que solo importa dónde se pierde el diseño. Graves: puentes entre piezas distintas y ojos tapados, a **0,3 mm** (Alimento **1 mm**). Rincones y ángulos: con que la punta marque alcanza. Se suma un mapa de profundidad en el visor. Respuestas en [Q-VEC-011](../14-open-questions/vectorizacion.md#q-vec-011).
   - **Revisión 2026-10-15 (3)**: la corrección **mantiene la medida** (si al abrir espacios el diseño crece, se encaja de nuevo en la caja original con escala pareja y se re-planifica sobre el diseño achicado; el gadget escala por el lado largo y si no lo achicaría igual), **ensancha en proporción los renglones del mismo bloque** (nombre y tagline justificados quedan parejos), **nunca empeora** el resultado y ofrece **agrandar hasta 6 %** como último recurso confirmado por quien revisa, sin pasar el tope de la planchuela.
5. No se guarda el resultado en la base (sin migración): se recalcula, con caché en memoria. **Cambiado por [ADR-028](ADR-028-registro-de-ediciones-de-vectores.md) (2026-10-21)**: cada vector que se guarda queda registrado en `vector_ediciones`.

## Alternativas descartadas

- **Chequeo/marcas dentro de Aspire (gadget)**: el equipo no quiere cargar el archivo de Aspire con más objetos (generan errores de selección), y el arreglo igual vuelve al diseño.
- **IA (visión) como detector**: no es confiable para medidas por debajo del milímetro. Puede sumarse a futuro como capa de explicación, no de medida.
- **VectorCraft (`pathops`, Rust → WebAssembly)** para la corrección con curvas: licencia compatible (MIT/Apache) y herramientas útiles (`offset_path`, booleanas, `simplify`), pero el proyecto está en alfa (motor de booleanas en beta, días de vida) y suma una cadena de compilación Rust. Queda como opción para mejorar la calidad de las curvas corregidas.
- **Corrección global (offset negativo a todo el diseño)**: con 0,56 mm de hueco mínimo afinaría de más los trazos finos.
- **Restar un círculo de fresa en cada zona** (primera versión): deformaba letras y dejaba mordidas visibles.
- **Escalar el diseño** para que entre: no como primera opción; queda como último recurso (hasta 6 %, confirmado por quien revisa).

## Consecuencias

- Módulos: Vectorización (Revisión, Asignar), Pedidos y Producción (celda Vector), Programas (hoja y menú). Nuevo módulo de lógica `src/lib/fresa/`.
- Las letras movidas conservan sus curvas; solo las figuras con offset pasan a polígonos finos (el resto del SVG queda igual).
- Corregir un vector de un sello ya armado en Aspire requiere reimportarlo (el gadget conserva lo que ya está) → backlog B-27.
- Documentación: [chequeo-de-fresa.md](../02-modules/vectorizacion/chequeo-de-fresa.md).
