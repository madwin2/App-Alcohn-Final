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
| Toolpath del detalle | **V-carve** en Aspire: donde el blanco se angosta, la fresa sube sola | Q-VEC-011 |
| Profundidad final del detalle | 0,6 mm | Q-CNC-008 |
| Profundidad mínima (entre letras y en ojos) | **0,3 mm** ("lo mínimo mínimo") | Q-VEC-011 |
| Profundidad mínima en sellos **Alimento** | **1 mm** | Q-VEC-011 |
| Polaridad | Negro = relieve del sello; blanco = se saca | Q-CNC-008 |

Con la punta a profundidad *d*, la fresa ocupa en la superficie un círculo de radio `r(d) = 0,05 + d · tan 30°`. A 0,3 mm: **r ≈ 0,223 mm → un canal más angosto que ≈ 0,45 mm se talla menos hondo que la mínima** (Alimento: ≈ 1,25 mm para 1 mm).

**Idea central (2026-10-14):** con V-carve la fresa nunca "deja de pasar": pierde profundidad. Un blanco angosto igual queda marcado, más arriba. Por eso no alcanza con medir distancias: importa **dónde** se pierde profundidad. Entre dos letras distintas y en los ojos de las letras tiene que llegar sí o sí a la mínima (si no, se pegan o se tapan); en rincones, ranuras y ángulos dentro de una misma pieza alcanza con que la punta marque. La versión anterior (0,4 mm y todo lo que no llegaba en gris como problema) marcaba de más: en 12 sellos reales bajó de 116 a 42 lugares.

El tipo de sello sale de `sellos.tipo` / `stampType` y viaja en el `FresaTarget` (`alimento: true`) → `fresaProfile()`.

La medida importa: el chequeo se hace **a la medida de fabricación** (la que usa el gadget para escalar en Aspire). Si no está confirmada, se usa la que va a resultar al confirmar el vector (misma lógica que `saveSelloVector`: medida pedida → `resolveFabricationSize`).

## 3. Cómo detecta (✅ `analyze.ts`)

1. Lee el SVG como pintura (`svgShapes.ts`): `path` (todos los comandos, sintaxis compacta de Illustrator, arcos), `rect`, `circle`, `ellipse`, `polygon`, `polyline`, `line`; transformaciones anidadas; colores por atributo, `style=""` y clases de `<style>`; rellenos blancos restan; trazos (`stroke`) se convierten en relleno. Texto vivo e imágenes incrustadas se avisan (no se pueden analizar).
2. Arma la región negra en micrones enteros (Clipper2, booleanas exactas).
3. Calcula el blanco alrededor del diseño y su **apertura morfológica** con radio r(mínima): todo lo que la fresa talla a la profundidad mínima o más. Lo que queda afuera se talla menos hondo.
4. Clasifica cada zona menos honda según **qué se pierde**:

| Tipo | Qué es | Gravedad |
|---|---|---|
| **Letras que se pegan** (`paso_angosto`) | Un **puente** poco hondo que une **dos piezas negras distintas**: el tramo exacto donde el canal se corta. Si el canal es poco hondo en otros lados pero no se corta, no se avisa | **Alta** |
| **Hueco que se tapa** (`hueco_cerrado`) | Un ojo de letra donde la fresa no llega a la mínima en casi ningún lado (≥ 85 % del ojo) | **Alta** |
| **Rincón o ranura angosta** (`rincon`) | Ranura o rincón dentro de una misma pieza | **Baja** ("marca menos hondo · OK"). **Media** ("se pierde el detalle") solo si la fresa casi no entra (< 0,05 mm) en ≥ 0,15 mm² |
| **Ángulo** (`angulo`) | Punta que se afina hacia adentro (V entre dos trazos) | **Baja** (igual que rincón) |

5. **Mapa de profundidad** (`depthBands`): franjas de lo que se talla menos hondo que la mínima — no se saca / 0–⅓ / ⅓–⅔ / ⅔–mínima. En el visor se ve como degradé azul ("Ver qué tan hondo baja la fresa"), en lugar del gris de "no llega".

Las esquinas normales (zonas < 0,03 mm² o de largo < 0,25 mm) y las esquinas del dominio de cálculo (afuera del diseño) no se informan. También estima el ancho del hueco y a qué profundidad baja la fresa ahí (niveles de 0,05 mm; 0,1 mm en Alimento). Zonas cercanas de igual gravedad se agrupan en "lugares" para la lista.

Umbrales en `DEFAULT_ANALYSIS_OPTIONS` (calibrados con 10 vectores reales de octubre 2026). ❓ Ver [Q-VEC-007](../../14-open-questions/vectorizacion.md#q-vec-007).

## 4. Cómo corrige (✅ `fix.ts`, `layout.ts`, `moveSvg.ts`, `exportSvg.ts`)

Objetivo: **adaptar el diseño para que la fresa pase**, como lo haría Fede, eligiendo la operación por lugar. Nunca se "muerde" el diseño con un círculo (la primera versión lo hacía y rompía las letras; reemplazada el 2026-10-14).

**Armado del diseño** (`layout.ts`): las piezas negras se agrupan en letras (una letra con sus partes sueltas, p. ej. la i y su punto) y renglones. De cada renglón se calcula si es **recto** (letras de alto parecido sobre una misma base; un texto en arco no lo es) y su **alineación** (izquierda / derecha / centrada, comparando solo renglones rectos). Los marcos, contornos y dibujos grandes quedan **fijos**.

**Operaciones, en este orden:**

1. **Ángulos** (`angulo`, gravedad baja): punta que se afina hacia adentro. Se aceptan así: la fresa no llega a 0,4 mm pero igual pasa a ~0,1 mm y queda marcado (confirmado por el equipo, [Q-VEC-010](../../14-open-questions/vectorizacion.md#q-vec-010)). No se tocan.
2. **Letras que se pegan** (`paso_angosto` entre letras distintas): se **mueven letras enteras**, sin cambiar su forma.
   - Si en un renglón ≥ 40 % de los pares de letras están justos, se **abre el espaciado de todo el renglón por igual** (hasta 0,5 mm entre letras): queda parejo, no "CE RRO".
   - Si son pares sueltos, se separa solo ese par.
   - La alineación manda qué se mueve: alineado a la izquierda → se corre lo de la derecha; a la derecha → lo de la izquierda; centrado → los dos lados por igual. Entre renglones, los de arriba suben y los de abajo bajan.
   - Corrimiento máximo 0,8 mm. Solo se aplica si mejora (menos lugares con problema, ninguno nuevo) y si no encima piezas. Texto en arco o piezas fijas: no se mueven.
3. **Ojos chicos** (`hueco_cerrado`): offset paralelo del ojo hacia afuera, lo justo.
4. **Ranuras** (`rincon`, `paso_angosto` dentro de una pieza): se ensanchan en paralelo.
   - En 3 y 4 **ningún trazo negro puede quedar por debajo de 0,4 mm** (`MIN_BLACK_WIDTH_MM`, confirmado por el equipo). Si para abrir el hueco habría que afinar de más, ese lugar queda para editar a mano.

Siempre: **nunca cambia la topología** (no parte piezas, no une huecos, no borra detalles); no cambia la medida de fabricación; **no escala** el diseño (ver Q-VEC-010: escalar solo si es imprescindible y con confirmación de quien revisa — no implementado).

**SVG resultante**: las letras movidas se trasladan **en sus propias curvas** (comandos absolutos, nada pasa a polígono). Solo las figuras con offset pasan a polígonos finos (error < 2 µm), marcadas `data-alcohn="corregido-fresa"`; lo demás queda byte a byte. El movimiento solo se aplica si el SVG es "pintura simple" (sin rellenos blancos ni trazos); si no, se aplican solo los offsets. El archivo final se **vuelve a chequear** a la misma escala.

Resultado con vectores reales (oct. 2026): textos con letras justas (OliFlowers, Cerro Colorado, Samadhi) se resuelven moviendo letras, sin sacar negro. Siguen para edición manual: ojos rodeados de trazos finos (sacar más afinaría por debajo de 0,4 mm) y texto en arco.

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
- Análisis: 25–400 ms por vector real; corrección + re-chequeo: 0,2–8 s (hasta ~20 s en diseños con cientos de piezas), en el worker.
- Caché en memoria por contenido + medida + versión del algoritmo (`FRESA_ANALYSIS_VERSION`). **No se guarda nada en la base**: Programas recalcula al abrir el chequeo.

## 7. Límites conocidos

- Solo lee **SVG** (EPS/PDF/AI no).
- Dos perfiles: general (0,3 mm) y Alimento (1 mm). ❓ Profundidad final del V-carve en Alimento: [Q-VEC-011](../../14-open-questions/vectorizacion.md#q-vec-011).
- Texto en arco pegado a un aro (p. ej. "Rockets Butchery"): se detecta bien, pero la corrección no lo resuelve (no mueve letras en arco).
- No mira trazos negros demasiado finos (frágiles) ni el desbaste con la fresa grande.
- La lista puede ser larga en diseños con muchas líneas finas (p. ej. vetas de madera): son problemas reales con este criterio.

## Implementación relacionada

`src/lib/fresa/{config,pathData,svgShapes,geometry,analyze,layout,fix,moveSvg,engine,exportSvg,chequeoFresa,useFresaReport,guardarCorregido,textos,fresa.worker,workerProtocol}.ts`, `src/components/fresa/{FresaChip,FresaCheckDialog,FresaViewer,FresaVectorDialog,FresaProgramaDialog}.tsx`, integración en `RevisionTab.tsx`, `AsignarTab.tsx`, `pedidos|produccion/Table/cells/CellVector.tsx`, `ProgramCardDesign.tsx`, `ProgramContextMenu.tsx`. Tests: `src/lib/fresa/fresa.test.ts`. Dependencia: `clipper2-ts` (BSL-1.0).
