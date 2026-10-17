# Chequeo de fresa

## Selección del repaso 0,2 por ganancia (2026-10-17, POL-090)

✅ `passes.ts` (`fineGainRegion`, `repasoSelection`): la 0,2 se elige **donde talla al menos `REPASO_MIN_GAIN_MM` (0,10 mm) más hondo que la 0,6**, para cualquier profundidad hasta el final del repaso (0,6 mm), y en zonas de al menos 0,03 mm². No depende del tipo de zona: entran ranuras, pasos entre letras, ojos y ángulos cerrados; un vértice abierto, un borde recto o un cuadrado sólido dan poca o ninguna ganancia y no entran. Se seleccionan las **piezas negras que bordean** cada zona (las dos, si es entre letras).

- Reemplaza el criterio anterior, que solo tomaba zonas «alta/media» de la primera fresa: en Magui Lucero dejaba afuera la ranura baja de la E (0,64 mm, la 0,6 llegaba a 0,05 y la clasificaba «baja»). Con la ganancia entran las dos ranuras; la 0,2 pasa por 9 de 16 piezas (no I, L, la primera U, la I grande ni las patas). Probado en `passes.test.ts` con el vector real (`__fixtures__/magui-lucero.svg`).
- 0,10 y 0,15 mm eligen las mismas piezas en ese caso; 0,05 elige casi todo y 0,30 deja afuera pasos reales (U–C, R–O).
- Chequeo individual: un veredicto único («Con el repaso 0,2 se separa todo · pasa por N de M piezas»); se abre en «Qué deja la 0,6» con lo que saca el repaso en verde agua y, en cada lugar, si lo resuelve el repaso.
- Mesa: con «Fresa» activado, cada sello muestra lo que saca la 0,2 (verde agua) y lo que ni la 0,2 resuelve (rojo/ámbar); con repaso «Sin repaso», todo lo que deja la 0,6.
- **Gadget (2026-10-17):** al guardar, cada sello lleva en `fine.pieces` las piezas elegidas, normalizadas a la caja del diseño **ya ubicado** (0 a 1, origen arriba a la izquierda; `placedRepasoPieces`: espejo en X y, si es apaisado, giro 90° antihorario = trasponer; sin cambios si el vector ya está mecanizado). El gadget (`partialFine` en `SyncPreparation.lua`) recorre el grupo del sello y copia a la capa REPASO solo los contornos de esas piezas (el de afuera y sus agujeros). Cada pieza tiene que coincidir con sus contornos a menos de 0,3 mm; prueba también el giro de 180° y, si el diseño es simétrico y no se sabe cuál es, repasa las dos. Si alguna pieza no coincide, **repasa el sello completo** con un aviso (`FINE_FALLBACK`): nunca repasa menos de lo pedido. «Completo» sigue repasando todo y un gadget anterior ignora `fine.pieces` (repasa todo).
- 🔶 Sin probar en Aspire: la capa REPASO, el tallado V de la 0,2 sobre un subconjunto de letras (equivale a lo que el equipo hacía a mano seleccionando en la capa VECTOR) y el sentido del giro de `RotationMatrix2D`. Si el giro fuera el opuesto, el gadget igual lo encuentra con la prueba de 180°. La simulación 3D de la mesa todavía dibuja la 0,2 en todo el sello.

## Comparación de dos pasadas (implementación 2026-10-15)

✅ `passes.ts` compara la principal configurada 0,6 mm / 15° por lado (final Clásico 1,7; 3MM/Alimento 3) con la fina **configurada 0,2 mm**, física 0,1 mm / 30° por lado (final 0,6 en todos; Q-PROG-020). `FRESA_ALIMENTO` usa referencia inferior 0,4 y comparación a 0,5; el 1 mm corresponde a la principal. Análisis **v6**, caché por receta/opciones. Profundidades relativas al planeado previo de 0,5 mm; las plantillas conservan ese inicio y un único Z0.

✅ Se informa beneficio geométrico, rango o diseño pendiente; no se generan trayectorias ni se certifica la selección parcial. En Preparar programa se chequean los SVG al guardar y se usa repaso completo cuando falta análisis vigente. Ver [flujo implementado](../programas/preparacion-visual.md). Las políticas de bloqueo de fresa siguen en Q-VEC-009.

> Lógica: `src/lib/fresa/*` (motor puro + Web Worker) · UI: `src/components/fresa/*` · Sandbox: `/dev/chequeo-fresa` (solo en desarrollo)
> Decisión: [ADR-024](../../13-decisions/ADR-024-chequeo-de-fresa-en-vectorizacion.md) · Datos de la fresa: [Q-CNC-008](../../14-open-questions/produccion-fabricacion.md#q-cnc-008)
> Implementado el 2026-10-14 (rama `feat/chequeo-fresa-vectorizacion`).

## 1. Para qué

✅ Detecta **dónde la fresa más fina no llega a la profundidad mínima** en un vector y lo corrige solo donde hace falta. Era el mayor trabajo manual de Fede en Aspire: agrandar, mover nodos y hacer offsets cuando el texto queda muy junto (Q-CNC-008).

Se hace **al vectorizar**, no en Aspire: el error se ve y se corrige antes de que el sello entre a un programa, y el archivo de Aspire no se carga con capas extra (pedido del equipo: las capas de más generan errores de selección).

**Límite frente a la selección del repaso**: se compara accesibilidad de ambas herramientas configuradas, pero no se calculan trayectorias ni se certifica selección parcial sin contactos. La base C usa perfilados nativos interior/exterior y selección fina manual (Q-PROG-020); no se cambia el tipo nativo por su nombre coloquial V-carve. Fede amplía la selección si toca el resto del sello (Q-PROG-017/POL-082).

## 2. Criterio (✅ `src/lib/fresa/config.ts`)

| Dato | Valor | Fuente |
|---|---|---|
| Fresa más fina | Cónica, física 0,1 mm / **configurada 0,2 mm**, **30° por lado (60° total)** | Q-CNC-008, Q-PROG-020 |
| Toolpath del detalle | **V-carve** en Aspire: donde el blanco se angosta, la fresa sube sola | Q-VEC-011 |
| Profundidad final del detalle | 0,6 mm | Q-CNC-008 |
| Profundidad mínima (entre letras y en ojos) | **0,3 mm** ("lo mínimo mínimo") | Q-VEC-011 |
| Perfil Alimento | Principal: referencia 1 mm, final 3 mm. Fina: referencia 0,4–0,5 mm, final 0,6 mm | Q-PROG-018, Q-VEC-011 |
| Polaridad | Negro = relieve del sello; blanco = se saca | Q-CNC-008 |

✅ **Q-VEC-011/POL-085**: Alimento idealmente se resuelve con la primera fresa. Si requiere repaso, buscar unos 0,4–0,5 mm. No exigir 1 mm a la fina ni usar el mínimo general de 0,3 como sustitución. El corte rígido y tratamiento de avisos siguen por calibrar (Q-VEC-007/009).

Con la punta configurada a profundidad *d*, el radio es `r(d) = 0,1 + d · tan 30°`. A 0,3 mm: **r ≈ 0,273 mm → canal mínimo ≈ 0,55 mm**. En Alimento a 0,4 mm: ≈ 0,66 mm; a 0,5 mm: ≈ 0,78 mm. Se modela el margen CAM deliberado, manteniendo el diámetro físico por separado.

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

**Texto en arco** (✅ 2026-10-14): antes de armar renglones se buscan **círculos por los que pasan los centros de varias letras** (típico de los sellos redondos: un texto arriba, otro abajo, estrellas entre los dos, todo sobre el mismo círculo). Se acepta un círculo si tiene al menos 3 letras seguidas encima, si de verdad se curva y si no corta un renglón recto por la mitad (así un bloque de texto recto nunca se toma por arco). Las letras del círculo se ordenan por ángulo y se cortan en **tramos** donde hay un salto grande (en "Rockets Butchery": ROCKET'S, BUTCHERY y cada estrella). De cada tramo se guarda centro, radio y el radio del borde de adentro (donde las letras quedan más juntas).

**Operaciones, en este orden:**

1. **Ángulos** (`angulo`, gravedad baja): punta que se afina hacia adentro. Se aceptan así: la fresa no baja a la profundidad mínima pero igual pasa a ~0,1 mm y queda marcado (confirmado por el equipo, [Q-VEC-010](../../14-open-questions/vectorizacion.md#q-vec-010)). No se tocan.
2. **Letras que se pegan** (`paso_angosto` entre letras distintas): se **mueven letras enteras**, sin cambiar su forma.
   - Si en un renglón ≥ 40 % de los pares de letras están justos, se **abre el espaciado de todo el renglón por igual** (hasta 0,5 mm entre letras): queda parejo, no "CE RRO".
   - Si son pares sueltos, se separa solo ese par.
   - **Bloques de texto** (✅ 2026-10-15): si el renglón forma bloque con otros (mismo ancho y ambos bordes alineados, como un nombre y su tagline; o, al abrir todo el renglón, misma alineación y ancho a menos de 5 %), esos renglones **se ensanchan en la misma proporción** para que el bloque siga parejo. Separar un par suelto solo arrastra a renglones justificados. Si con el bloque no se puede, se prueba el renglón solo.
   - La alineación manda qué se mueve: alineado a la izquierda → se corre lo de la derecha; a la derecha → lo de la izquierda; centrado → los dos lados por igual. Entre renglones, los de arriba suben y los de abajo bajan.
   - **Texto en arco**: lo mismo, pero a lo largo del arco (las letras giran alrededor del centro del círculo; se mide la apertura en el borde de adentro). Si una letra del arco está pegada a **otra cosa** (un aro, el dibujo), **todo el tramo se acerca o se aleja del centro** en sentido radial, como achicar o agrandar el radio del arco. Si no hay lugar (el tramo está encajado entre dos aros y otra letra choca del otro lado), se corre **solo esa letra** hacia el centro o hacia afuera: queda un poco fuera de la curva de sus vecinas. Tope: 8 % del alto de la letra, entre 0,15 y 0,35 mm (dueño, 2026-10-15: "lo que se necesite sin deformarlo mucho"; [Q-VEC-012](../../14-open-questions/vectorizacion.md#q-vec-012)). Las letras se trasladan, no se giran: en décimas de mm no se nota.
   - Corrimiento máximo 0,8 mm. Solo se aplica si mejora (menos lugares con problema, ninguno nuevo), si no encima piezas y si **no acerca dos piezas que ya estén a menos del hueco mínimo** (se mide la distancia real: junto a una punta filosa, como la de una estrella, el análisis informa el mismo ancho aunque la punta casi toque). Piezas fijas: no se mueven. Para el espaciado parejo se prueban varios pasos y queda el que más resuelve (en un arco el hueco entre letras es una cuña).
3. **Ojos chicos** (`hueco_cerrado`): offset paralelo del ojo hacia afuera, lo justo.
4. **Ranuras** (`rincon`, `paso_angosto` dentro de una pieza): se ensanchan en paralelo.
   - En 3 y 4 **ningún trazo negro puede quedar por debajo de 0,4 mm** (`MIN_BLACK_WIDTH_MM`, confirmado por el equipo). Si para abrir el hueco habría que afinar de más, ese lugar queda para editar a mano.

Siempre: **nunca cambia la topología** (no parte piezas, no une huecos, no borra detalles) y **nunca empeora**: si el resultado tiene más lugares con problema que el original, no se propone ningún cambio.

**Mantener la medida** (✅ 2026-10-15): abrir espacios puede dejar el diseño más ancho o más alto. El gadget escala cada vector por su **lado largo** a la medida de fabricación, así que un diseño que creció se achicaría en Aspire y los huecos se volverían a cerrar. Por eso, después de corregir:
1. Si el diseño creció, se **encaja en la caja original** con una escala pareja (sin deformar): todo, ícono incluido, se achica lo mismo. En el SVG es un grupo con `transform` marcado `data-alcohn="encaje-medida"`; el `viewBox` y el `width`/`height` no cambian.
2. Se chequea así, como va a quedar fabricado. Si al achicar vuelven a aparecer problemas, se **re-planifica sobre el diseño achicado** (los espacios se abren lo necesario para que, después de encajar, sigan alcanzando). Hasta 4 vueltas; queda la mejor.
3. Ningún lado queda más grande que el original. Al guardar el vector de un sello que ya tiene medida de fabricación (Pedidos, Producción, Programas), se guarda la medida del resultado, para que coincida con el dibujo y el gadget no lo vuelva a escalar. En Revisión y Asignar SVG la medida se calcula sola al confirmar.

**Agrandar como último recurso** (✅ 2026-10-15, Q-VEC-010): si después de todo quedan lugares, se prueba agrandar **todo el sello** de a 1 % hasta 6 % (`MAX_SCALE_UP`, provisorio) y sin pasar el tope de la planchuela (si no se sabe la planchuela de un sello ya fabricable, no se ofrece). Si con eso se resuelve todo, el diálogo lo ofrece como **"Último recurso: agrandar a A × B mm y usar"**: nunca se aplica solo, lo confirma quien revisa, y cambia la medida de fabricación del sello.

**SVG resultante**: las letras movidas se trasladan **en sus propias curvas** (comandos absolutos, nada pasa a polígono). Solo las figuras con offset pasan a polígonos finos (error < 2 µm), marcadas `data-alcohn="corregido-fresa"`; lo demás queda byte a byte. El movimiento solo se aplica si el SVG es "pintura simple" (sin rellenos blancos ni trazos); si no, se aplican solo los offsets. El archivo final (con el encaje) se **vuelve a chequear** a la misma escala que el original.

Resultado con vectores reales (oct. 2026): textos con letras justas (OliFlowers, Cerro Colorado, Samadhi) se resuelven moviendo letras, sin sacar negro. **Rockets Butchery** (40 mm): de 18 lugares a 13; se resuelven las 5 letras pegadas al aro (C, O, ' y S de ROCKET'S, corridas solas 0,04–0,09 mm hacia adentro porque abajo tienen el círculo interior; BUTCHERY entera 0,10 mm hacia adentro). Lo que queda no es texto en arco que se pueda mover: las estrellas están a 0,22 mm del aro **y** del círculo (la suma no alcanza para que pase la fresa de los dos lados: habría que achicarlas), y el resto es el lobo, los cuchillos y el círculo interior (piezas fijas, ojos con trazos finos). Siguen para edición manual: ojos rodeados de trazos finos (sacar más afinaría por debajo de 0,4 mm) y piezas encajadas sin lugar.

## 4 bis. Edición manual (✅ 2026-10-15, `editDoc.ts`, `curveFit.ts`, `FresaEditor.tsx`)

Botón **Editar a mano** en el diálogo del chequeo (sobre el original o sobre el corregido). Abre un editor en el mismo lugar del visor, con el **chequeo de fresa recalculado al soltar cada cambio** (lugares en rojo/amarillo y la medida actual del dibujo).

**Modelo** (`editDoc.ts`): el SVG se pasa a nodos con manijas (como Illustrator), en unidades del viewBox y con las transformaciones aplicadas; arcos, círculos, elipses y rectángulos redondeados pasan a curvas cúbicas. Una **pieza** es un contorno lleno con sus agujeros directos (una letra con su ojo); lo que está adentro de un agujero (las letras dentro de un aro) es otra pieza. Solo funciona con SVG de rellenos oscuros (sin blancos ni trazos), que es lo que sale de Vectorizer.AI e Illustrator; si no, avisa.

| Herramienta | Qué hace |
|---|---|
| **Mouse** (sin herramientas que elegir, 2026-10-15) | **Izquierdo**: clic elige (al pasar se resalta lo que se va a agarrar), arrastrar mueve, arrastrar en el fondo elige varias, **tiradores de las esquinas** escalan parejo (esquina opuesta fija; Alt: desde el centro; se ve el %), **doble clic** en una pieza edita sus nodos (acerca centrado en el clic si los nodos quedan a menos de 9 px; Esc, «Listo» o clic en el fondo terminan). **Rueda**: zoom; **apretada** + arrastrar: moverse (también Espacio + arrastrar). **Derecho**: menú contextual (pieza: nodos, acercar, ±1 %, engordar/afinar, simplificar, borrar; nodo: esquina, suave, borrar; fondo: elegir todo, ver todo, deshacer, rehacer). Se sacó la herramienta «Mano»: los tres botones movían la vista y el izquierdo tenía que cambiar de modo. Flechas del panel o del teclado con paso elegible (0,02–0,5 mm; Shift ×10). |
| **Varias piezas** | Rectángulo en el fondo, Shift+clic (sumar/sacar), Ctrl+A. Todas las operaciones se aplican a la selección (tamaño desde el centro del conjunto; grosor pieza por pieza, calculado sobre el original). |
| **Guías e imán** (G) | Al arrastrar, la caja de lo elegido se imanta (6 px en pantalla) a bordes y centros de las demás piezas y al centro del diseño, con guía violeta; Shift restringe a un eje; Ctrl suelta el imán. Los nodos se imantan a la x/y de los otros nodos de la pieza (`editTools.ts`). |
| **Relieve 3D** | Simulación del V-carve (`vcarveRelief.ts`): en cada punto del blanco, profundidad = distancia al negro / tan(flanco), con tope en la profundidad final (0,6 mm; Alimento 3 mm); el negro queda arriba. Grilla de hasta 700 celdas sobre lo que se ve (más un margen del radio de la fresa), transformada de distancia exacta (Felzenszwalb) y luz rasante (hillshade, relieve exagerado ×3) en colores de bronce. Se recalcula al soltar cada cambio y al terminar de hacer zoom; mientras se arrastra se ve el dibujo normal. Es una simulación aproximada (no reemplaza la vista previa de Aspire). |
| **Medidas** | Desplazamiento en vivo al arrastrar y cotas en mm al vecino más cercano de cada lado (cajas que se enfrentan). |
| **Alinear / Espaciar parejo** | Un renglón de íconos (con tooltip). Con 2+: alinear bordes o centros. Con 3+: mismo espacio entre piezas, sin mover las de los extremos. |
| **Tamaño** | −1 % / +1 % o un porcentaje; parejo (sin deformar), desde el centro de lo elegido. |
| **Grosor**: Afinar / Engordar | Offset interior / exterior en paralelo (Clipper), devuelto con el mismo método que «Simplificar» (`fitClosedRing` → `simplifySub`: esquinas reales, curvas controladas contra el contorno exacto), error 0,01 mm. **Bug corregido (2026-10-15)**: antes las curvas se ajustaban sin control y en letras con esquinas se salían de la forma (0,3–3 mm en logos reales; la «a» se rompía al afinar). Ahora el desvío medido contra el offset exacto es ≤ 0,024 mm. |
| **Nodos** (doble clic, botón «Editar nodos» o A) | Ver y arrastrar nodos y manijas de la pieza elegida; en un nodo suave, mover una manija gira la otra para que no quede quiebre. Si en pantalla quedan a menos de 9 px se muestran como puntos (no se pueden tocar) y la ayuda pide acercarse. **Esquina** (`setNodeCorner`: sin manijas) y **Suave** (`setNodeSmooth`: manijas alineadas de vecino a vecino, un tercio de cada tramo), en el panel y en el clic derecho. Supr borra el nodo elegido. "Todos los nodos" los muestra en todo el dibujo. |
| **Quitar nodos de más** | Saca nodos repetidos y nodos en medio de una recta. **No cambia la forma.** Los nodos de más se ven en naranja. |
| **Simplificar** | El botón dice antes cuántos nodos quedan ("577 → 22 nodos"). Muestrea el contorno, saca la forma mínima con **Douglas-Peucker** (en una recta llena de nodos, con nodos casi encimados o con el zigzag de la vectorización, quedan solo las dos puntas) y detecta las esquinas reales midiendo el giro con un tramo a cada lado (no nodo contra nodo). Las esquinas apenas redondeadas (el giro repartido en 2-3 nodos muy juntos) se miran como grupo. Entre esquinas: recta si es recta; si no, pocas curvas (Schneider, el mismo de `simplify` en Paper.js y VectorCraft). **Control final**: cada tramo se compara con el original en los dos sentidos; si se va más de 1,5× el error, se usa la forma mínima (rectas), así nunca se deforma. **Error máximo elegido** (0,005–0,05 mm). |
| **Borrar** (tacho en el encabezado de «Pieza», Supr) **/ Borrar motas (N)** | Borra lo elegido, o todas las piezas sueltas de menos de 0,05 mm² (restos de la vectorización). |
| **Zoom** | Control −, +, «Ver todo» y ancho en mm abajo a la izquierda del lienzo, igual al del visor del chequeo. |
| **Ver** | Tecla 0 o botón: ver todo. Tecla F o botón: acercar a lo elegido. |
| **Deshacer / Rehacer** | Ctrl+Z / Ctrl+Y (hasta 80 pasos). **Descartar** pide confirmación si hay cambios. |

El panel muestra el estado en vivo con **Ir a: 1 2…** (acerca la vista a cada lugar), la medida del sello y avisos de cada acción; la ayuda debajo del lienzo cambia según la herramienta y lo elegido, y **Atajos** lista el teclado. El zoom se conserva al cambiar de herramienta (solo "ver todo" o la tecla 0 reencuadran).

**Panel estable (2026-10-15)**: el panel tiene estructura fija para que nada se corra al tocar un botón (pedido: tocar «+1 %» dos veces seguidas sin que el botón se mueva). Todos los controles están siempre (deshabilitados si no aplican), los textos que cambian tienen alto fijo, los avisos flotan sobre el dibujo y se van solos, el estado de la fresa muestra el último resultado mientras re-chequea («actualizando»), la referencia del relieve y los atajos flotan sobre el lienzo (no lo achican), y «Terminar edición / Cancelar» quedan fijos abajo aunque el panel tenga scroll. El conteo de «Simplificar» se calcula 350 ms después del último cambio (cada clic bloquea ~12 ms en vez de ~200 ms con 776 nodos). El teclado escucha en todo el editor, no solo en el lienzo.

**Terminar edición** devuelve el resultado al diálogo como una corrección más ("Se hizo N cambios a mano"), re-chequeado a la misma escala; se usa con **Usar el corregido** como siempre. Si el dibujo cambió de medida (se agrandó o movió algo hacia afuera), el editor lo avisa y al guardar se usa la medida nueva.

**VectorCraft**: se tomó la idea (el método de simplificación de su `pathops` es el de Schneider), no el código: se escribió en TypeScript para no sumar Rust/WebAssembly. Su editor (Rust/egui) no se puede reusar en la app.

## 4 ter. Corrección automática al vectorizar (✅ 2026-10-15, `chequeoFresa.ts`, `RevisionTab.tsx`)

Cada vector que entra a **Revisión** pasa solo por `autoCorregir` (en segundo plano, de a uno, cacheado por contenido + medida):

1. Chequeo de fresa a la medida con que se va a guardar.
2. Si hay lugares (`revisar`), `corregirSvg` (sección 4).
3. Siempre, `simplificarSinDeformar`: modelo editable (`editDoc.ts`) → `removeRedundant` → `simplifyDoc` con error **0,02 mm**; se re-chequea a la misma escala y se acepta solo si **no cambia la medida (±0,05 mm) ni empeora el chequeo**; si no, prueba **0,01 mm**; si no, no simplifica. Pide ahorrar al menos 5 % de nodos. Queda como operación `simplificar` ("Se simplificó de N a M nodos sin cambiar el diseño").

`corregirYSimplificar` es lo mismo sin el chequeo inicial; lo usa el botón **Corregir automáticamente** del diálogo en todas las pantallas (si la fresa ya llega, el botón dice **Simplificar nodos**).

**Elegir versión** (Revisión): `ReviewItem.originalSvg` guarda el vector como salió (o el cargado con «Cambiar») y `ReviewItem.fresaChoice` qué versión es `svg`: `original`, `auto` o `manual`. Si la automática cambió algo y todavía no se eligió, **queda elegida**; la tarjeta muestra **Guardar: Original | Automático (| A mano)** y **Ver / editar** abre el diálogo con la corrección ya hecha (`initialFix`), con **Editar el corregido / Editar el original** y **Usar el original**. Confirmar guarda `svg`. «Cambiar» borra `originalSvg` y `fresaChoice` (el archivo nuevo es el original). La versión agrandada (último recurso) sigue siendo una decisión manual en el diálogo.

## 5. Dónde aparece en la app

| Pantalla | Qué se ve | Qué se puede hacer |
|---|---|---|
| **Vectorización → Revisión** | Chip **Fresa OK / Fresa: N lugares** en cada tarjeta; resumen arriba ("N con lugares donde la fresa no llega"); **Guardar: Original \| Automático** con la corrección ya hecha (4 ter) | Elegir versión; abrir el chequeo con la corrección hecha, comparar (Original / Corregido / Qué cambia), editar el corregido o el original, **Usar el corregido** / **Usar el original** (se guarda al Confirmar). **Confirmar** con problemas pide confirmación ("Revisar" / "Confirmar igual"); **Confirmar todos** ofrece "Confirmar solo los OK". |
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
- Perfiles finos: general (referencia 0,3 mm, final 0,6 mm) y Alimento (referencia inferior 0,4, comparación adicional 0,5, final 0,6). La principal está separada: punta configurada 0,6 mm/15°, final 1,7/3 mm; el ≈1 mm de Alimento se usa como referencia principal. La calibración y certificación del recorte parcial siguen pendientes ([Q-VEC-011](../../14-open-questions/vectorizacion.md#q-vec-011), POL-085). AUD-PROG-005 conserva el hallazgo previo.
- Texto en arco: se mueve entero (radial o a lo largo del arco) o, poco, letra por letra. No se achica ni se gira ninguna letra; una pieza encajada entre dos aros sin lugar de ningún lado (p. ej. las estrellas de "Rockets Butchery") queda para editar a mano.
- No mira trazos negros demasiado finos (frágiles) ni el desbaste con la fresa grande.
- La lista puede ser larga en diseños con muchas líneas finas (p. ej. vetas de madera): son problemas reales con este criterio.

## Implementación relacionada

`src/lib/fresa/{editDoc,editTools,vcarveRelief,curveFit,config,pathData,svgShapes,geometry,analyze,layout,fix,moveSvg,engine,exportSvg,chequeoFresa,useFresaReport,guardarCorregido,textos,fresa.worker,workerProtocol}.ts`, `src/components/fresa/{FresaEditor,FresaChip,FresaCheckDialog,FresaViewer,FresaVectorDialog,FresaProgramaDialog}.tsx`, integración en `RevisionTab.tsx`, `AsignarTab.tsx`, `pedidos|produccion/Table/cells/CellVector.tsx`, `ProgramCardDesign.tsx`, `ProgramContextMenu.tsx`. Tests: `src/lib/fresa/fresa.test.ts`. Dependencia: `clipper2-ts` (BSL-1.0).
