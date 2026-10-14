# Chequeo de fresa

> Lógica: `src/lib/fresa/*` (motor puro + Web Worker) · UI: `src/components/fresa/*` · Sandbox: `/dev/chequeo-fresa` (solo en desarrollo)
> Decisión: [ADR-024](../../13-decisions/ADR-024-chequeo-de-fresa-en-vectorizacion.md) · Datos de la fresa: [Q-CNC-008](../../14-open-questions/produccion-fabricacion.md#q-cnc-008)
> Implementado el 2026-10-14 (rama `feat/chequeo-fresa-vectorizacion`).

## 1. Para qué

✅ Detecta **dónde la fresa más fina no llega a la profundidad mínima** en un vector y lo corrige solo donde hace falta. Era el mayor trabajo manual de Fede en Aspire: agrandar, mover nodos y hacer offsets cuando el texto queda muy junto (Q-CNC-008).

Se hace **al vectorizar**, no en Aspire: el error se ve y se corrige antes de que el sello entre a un programa, y el archivo de Aspire no se carga con capas extra (pedido del equipo: las capas de más generan errores de selección).

## 2. Criterio (✅ `src/lib/fresa/config.ts`)

| Dato | Valor | Fuente |
|---|---|---|
| Fresa más fina | Cónica, punta 0,1 mm, **30° por lado (60° total)** | Q-CNC-008 |
| Profundidad final del detalle | 0,6 mm | Q-CNC-008 |
| Profundidad mínima aceptable | 0,4 mm | Q-CNC-008 |
| Polaridad | Negro = relieve del sello; blanco = se saca | Q-CNC-008 |

Con la punta a profundidad *d*, la fresa ocupa en la superficie un círculo de radio `r(d) = 0,05 + d · tan 30°`. A 0,4 mm: **r ≈ 0,281 mm → todo blanco más angosto que ≈ 0,56 mm no llega**.

La medida importa: el chequeo se hace **a la medida de fabricación** (la que usa el gadget para escalar en Aspire). Si no está confirmada, se usa la que va a resultar al confirmar el vector (misma lógica que `saveSelloVector`: medida pedida → `resolveFabricationSize`).

## 3. Cómo detecta (✅ `analyze.ts`)

1. Lee el SVG como pintura (`svgShapes.ts`): `path` (todos los comandos, sintaxis compacta de Illustrator, arcos), `rect`, `circle`, `ellipse`, `polygon`, `polyline`, `line`; transformaciones anidadas; colores por atributo, `style=""` y clases de `<style>`; rellenos blancos restan; trazos (`stroke`) se convierten en relleno. Texto vivo e imágenes incrustadas se avisan (no se pueden analizar).
2. Arma la región negra en micrones enteros (Clipper2, booleanas exactas).
3. Calcula el blanco alrededor del diseño y su **apertura morfológica** con radio r(0,4): todo lo que puede barrer la fresa a 0,4 mm sin pisar negro. **Lo que queda afuera no llega.**
4. Clasifica cada zona:

| Tipo | Qué es | Gravedad |
|---|---|---|
| **Hueco que se tapa** (`hueco_cerrado`) | Un blanco encerrado (ojo de una letra) que entero no llega | Alta |
| **Partes muy juntas** (`paso_angosto`) | Canal blanco entre **dos piezas negras distintas** (letras muy juntas) | Alta si la fresa llega a < 0,2 mm; media si no |
| **Rincón o ranura angosta** (`rincon`) | Ranura o rincón dentro de una misma pieza (ranuras de la E, la V de la R, unión de serifas) | Media si ≥ 0,15 mm²; **baja** si es chico (la fresa cónica siempre redondea los rincones: suele aceptarse) |

Las esquinas normales (zonas < 0,03 mm² o de largo < 0,25 mm) no se informan. También estima el ancho del hueco y a qué profundidad llega la fresa ahí (niveles de 0,05 mm). Zonas cercanas de igual gravedad se agrupan en "lugares" para la lista.

Umbrales en `DEFAULT_ANALYSIS_OPTIONS` (calibrados con 10 vectores reales de octubre 2026). ❓ Ver [Q-VEC-007](../../14-open-questions/vectorizacion.md#q-vec-007).

## 4. Cómo corrige (✅ `fix.ts`, `exportSvg.ts`)

- Por cada zona elegida (por defecto, todas las de gravedad alta y media): se toma su "alma" (la zona erosionada al 85 % de su grosor) y se barre con un círculo de radio r(0,4). El negro que pisa ese barrido se saca. Resultado: el hueco queda con el ancho justo para la fresa, centrado donde estaba.
- **Nunca cambia la topología del diseño**: si corregir una zona partiría una pieza negra, borraría un detalle o uniría dos huecos, esa zona **no se toca** y queda listada para editar a mano.
- Segunda pasada sobre lo que quedó cerca de lo corregido.
- El SVG resultante conserva todo lo que no se tocó **byte a byte** (curvas incluidas); solo las figuras afectadas pasan a polígonos finos (error < 2 µm), marcadas `data-alcohn="corregido-fresa"`. Si el SVG tiene rellenos blancos o trazos, se reemplaza el dibujo por una sola figura negra equivalente.
- El archivo final se **vuelve a chequear** a la misma escala: lo que se guarda es exactamente lo analizado.
- No cambia la medida de fabricación.

Resultado con los vectores de prueba (oct. 2026): se resuelven entre ~75 % y ~92 % de las zonas de gravedad alta y media; el resto queda para edición manual (casi siempre trazos negros muy finos al lado del hueco, o anillos blancos finos que no se pueden abrir sin cortar un anillo negro).

## 5. Dónde aparece en la app

| Pantalla | Qué se ve | Qué se puede hacer |
|---|---|---|
| **Vectorización → Revisión** | Chip **Fresa OK / Fresa: N lugares** en cada tarjeta; resumen arriba ("N con lugares donde la fresa no llega") | Abrir el chequeo, **Corregir automáticamente**, comparar (Original / Corregido / Qué cambia), **Usar el corregido** (reemplaza el SVG en revisión; se guarda al Confirmar). **Confirmar** con problemas pide confirmación ("Revisar" / "Confirmar igual"); **Confirmar todos** ofrece "Confirmar solo los OK". |
| **Vectorización → Asignar SVG** | Chip por archivo una vez asignado a un sello (antes no se sabe la medida) | Igual que Revisión; "Confirmar asignaciones" avisa si alguno tiene problemas |
| **Pedidos / Producción** (celda Vector, clic derecho) | **Chequear fresa** en vectores SVG | Ver, corregir y **Guardar el corregido en el sello** (sube el SVG nuevo; la medida de fabricación no cambia; dispara el aviso `p1_sello_modificado` como cualquier cambio de vector) |
| **Programas** (hoja: botón **Fresa**; tarjeta: clic derecho → **Chequear fresa**) | Lista de los sellos del programa con su estado | Abrir cada uno, corregir y guardar en el sello (sin aviso p1: escribe directo `archivo_vector_preview`) |

⚠️ Si se corrige el vector de un sello que **ya está armado en Aspire**, el gadget en modo Actualizar no lo reimporta solo (lo reconoce por su marca y lo conserva). Hay que borrarlo del archivo y correr Actualizar eligiendo «reimportar», o usar Rehacer desde cero. El diálogo lo avisa.

## 6. Rendimiento

- La geometría corre en un **Web Worker** (`fresa.worker.ts`, ~88 KB) para no trabar la pantalla; si el navegador no lo soporta, corre en el hilo principal.
- Análisis: 25–400 ms por vector real; corrección + re-chequeo: 0,1–2,5 s.
- Caché en memoria por contenido + medida + versión del algoritmo (`FRESA_ANALYSIS_VERSION`). **No se guarda nada en la base**: Programas recalcula al abrir el chequeo.

## 7. Límites conocidos

- Solo lee **SVG** (EPS/PDF/AI no).
- Un mismo perfil de fresa para todos los tipos de sello. ❓ [Q-VEC-008](../../14-open-questions/vectorizacion.md#q-vec-008).
- No mira trazos negros demasiado finos (frágiles) ni el desbaste con la fresa grande.
- La lista puede ser larga en diseños con muchas líneas finas (p. ej. vetas de madera): son problemas reales con este criterio.

## Implementación relacionada

`src/lib/fresa/{config,pathData,svgShapes,geometry,analyze,fix,engine,exportSvg,chequeoFresa,useFresaReport,guardarCorregido,textos,fresa.worker,workerProtocol}.ts`, `src/components/fresa/{FresaChip,FresaCheckDialog,FresaViewer,FresaVectorDialog,FresaProgramaDialog}.tsx`, integración en `RevisionTab.tsx`, `AsignarTab.tsx`, `pedidos|produccion/Table/cells/CellVector.tsx`, `ProgramCardDesign.tsx`, `ProgramContextMenu.tsx`. Tests: `src/lib/fresa/fresa.test.ts`. Dependencia: `clipper2-ts` (BSL-1.0).
