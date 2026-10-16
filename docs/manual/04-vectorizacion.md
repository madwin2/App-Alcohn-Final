# 4. Vectorización

[← Volver al índice](README.md)

Acá se convierte el diseño que mandó el cliente (una imagen) en un **vector SVG** listo para Aspire, con la medida pedida. Un sello **no puede entrar a un programa** hasta que tiene su vector. Se llega desde **Vectorización** en el menú.

La vectorización automática usa un servicio externo (Vectorizer.AI) que cobra **créditos**. Los casos difíciles se siguen haciendo a mano en Illustrator y se suben en la pestaña **Asignar SVG**.

La primera vez que entrás aparece un recorrido guiado; lo podés volver a ver o saltear.

## La pantalla

Arriba:

- **Vectorización**, con el recordatorio "Varios logos en una hoja = un crédito" y cuántos vectores hay **en revisión**.
- El **saldo de créditos** que quedan (si dice **Sin saldo**, no se puede vectorizar: avisale a Julián).
- **Maximizar resolución**: agranda las imágenes antes de mandarlas para que el vector salga más prolijo. Dejalo activado.
- **Incluir Rehacer / Prioridad**: además de los sellos Sin Hacer, muestra los que están en **Rehacer**.
- **Padding**: cuánto margen blanco se agrega alrededor de cada diseño.

Pestañas: **Pedidos**, **Lote libre**, **Asignar SVG** y **Revisión**.

## Pestaña Pedidos: vectorizar los sellos pendientes

Muestra los sellos que tienen archivo base pero **todavía no tienen vector**. Los **prioritarios** (marcados **Prio**) van primero; después, los que tienen fecha límite más cercana.

### Cómo se trabaja

1. **Armá la hoja**. Tocá los diseños de la lista de la derecha: se van sumando a la **Hoja a vectorizar**. Varios diseños en una misma hoja cuestan **un solo crédito**, así que conviene llenar la hoja. La barra **Carga de la hoja** muestra cuánto lugar queda; si se llena, se arma otra hoja (se navega con las flechas).
2. **Achicá si hace falta**. En la hoja, cada diseño tiene manijas en las esquinas: arrastrá para escalarlo (mínimo 25%). Sirve cuando un logo simple ocupa de más y querés meter más diseños en el mismo crédito. Doble clic en el diseño vuelve al 100%. El porcentaje aparece arriba a la izquierda si está achicado.
3. **Prepará cada imagen** (opcional). Clic derecho sobre un diseño:
   - **Recortar…**: abre el editor de recorte (**Auto**, **Todo**, **Cuadrado**; **Aceptar** para confirmar). Sirve para sacar fondo o bordes que no van en el sello.
   - **Copiar imagen** → retocarla afuera (por ejemplo con IA) → **Reemplazar por Portapapeles**: guarda la versión mejorada **sin borrar la original** del cliente.
   - **Volver a la original**: descarta la versión mejorada.
   - **Abrir imagen en pestaña nueva**, **Guardar imagen**.
4. Tocá **Vectorizar (N créditos)**. Se abre una confirmación con el costo y cómo queda el saldo. Confirmá.
5. Mientras trabaja muestra **Vectorizando… %**. Cuando termina, los resultados pasan a **Revisión**.

## Pestaña Revisión: controlar antes de guardar

⚠️ Nada se guarda en el pedido hasta que lo confirmás acá. Si cerrás o recargás la pestaña, **la revisión se recupera** en este mismo navegador (no en otra PC).

Por cada diseño se ve el antes y el después (**Damero** muestra el fondo a cuadros para ver qué es transparente). Criterio de revisión: fiel al diseño, líneas rectas bien hechas, sin deformaciones. Tocá la comparación o **Zoom** para ampliar base y vector juntos (misma lupa y arrastre).

| Botón | Qué hace |
|---|---|
| **Confirmar** | Guarda el vector en el sello, con la medida pedida |
| **Rechazar** | Lo descarta (el sello vuelve a pendientes) |
| **Zoom** | Abre base y vector lado a lado con zoom sincronizado |
| **Cambiar** (SVG) | Reemplaza el resultado por un SVG propio (por ejemplo, uno corregido en Illustrator) |
| **Confirmar todos** / **Descargar todos** | Para toda la tanda |

### Chequeo de fresa

Cada tarjeta muestra un chip **Fresa**: la app simula el V-carve de la fresa más fina (cónica de 60°, punta 0,1 mm) a la medida a la que se va a fabricar. Donde el blanco se angosta, la fresa sube y talla menos hondo: eso está bien en rincones y ángulos, pero **entre letras y en los ojos tiene que bajar al menos 0,3 mm** (en sellos de **Alimento, 1 mm**). Si no, las letras se pegan o el ojo se tapa.

| Chip | Qué significa |
|---|---|
| **Fresa OK** (verde) | La fresa llega bien en todo el diseño |
| **Fresa: N lugares** (rojo o amarillo) | Hay lugares donde no llega: letras muy juntas, ojos de letras chicos, ranuras finas |
| **Sin chequeo** | No se pudo leer el archivo (por ejemplo, texto sin convertir a curvas) |

#### Corrección automática al vectorizar

Apenas un vector llega a Revisión, la app **lo corrige sola** en segundo plano (mientras tanto la tarjeta dice "Corrigiendo y simplificando…"):

- Si la fresa no llega en algún lugar, aplica la **corrección automática** (ver abajo).
- Siempre **simplifica los nodos sin cambiar el diseño**: las rectas llenas de nodos quedan con un nodo por esquina y las curvas con pocos nodos. Prueba sacar todo lo posible (la forma se mueve como mucho 0,02 mm, mucho menos de lo que marca la fresa más fina) y, si eso cambiara la medida o empeorara el chequeo de fresa, prueba con 0,01 mm; si tampoco, no simplifica.

En la tarjeta aparece **Guardar: Original | Automático** (y **A mano** si lo editaste), con lo que hizo la corrección (por ejemplo, "Se simplificó de 776 a 508 nodos sin cambiar el diseño"). Si la automática cambió algo, **queda elegida**; tocá **Original** para guardar el vector tal como salió. **Ver / editar** abre el chequeo con la corrección ya hecha, donde podés compararla, **Editar el corregido** o **Editar el original** a mano, o **Usar el original**. El original nunca se pierde: lo podés volver a elegir hasta que confirmás. **Cambiar** (cargar otro SVG) lo toma como nuevo original y lo vuelve a corregir.

Tocá el chip para abrir el **Chequeo de fresa**:

1. A la izquierda, el diseño con los lugares marcados y numerados (rojo = **Hay que corregir**, amarillo = **Se pierde el detalle**). Rueda del mouse para acercar, arrastrá para mover, **Ver todo** para volver.
2. A la derecha, la lista: tocá un lugar y la vista va directo ahí. Dice el ancho del hueco y a qué profundidad llega la fresa.
3. **Profundidad**: un degradé azul muestra lo que se talla menos hondo que la mínima (más oscuro = menos hondo). **Mostrar ángulos y rincones**: lugares donde la fresa sube y marca menos hondo. Están bien así; por eso están ocultos y la corrección no los toca.
4. **Corregir automáticamente** (en Revisión ya viene hecho; en otras pantallas, el botón; si la fresa ya llega bien, el botón dice **Simplificar nodos**): adapta el diseño para que entre la fresa, como se haría a mano, y después simplifica los nodos sin cambiar el diseño:
   - **Letras o renglones muy juntos**: corre letras enteras sin deformarlas, respetando la alineación (si el bloque está alineado a la izquierda, corre hacia la derecha). Si casi todo el renglón está justo, abre el espaciado de todo el renglón por igual.
   - **Bloques de texto**: si ese renglón va justificado con otro (por ejemplo, el nombre y el tagline del mismo ancho), el otro también se ensancha en la misma proporción, para que sigan parejos.
   - **Texto en arco**: separa a lo largo del arco o acerca/aleja el texto del centro; si hace falta, corre una letra sola un poquito.
   - **Ojos chicos y ranuras**: los agranda en paralelo, siempre que ningún trazo negro quede de menos de 0,4 mm.
   - Abajo del botón dice qué hizo (por ejemplo, "Se abrió el espaciado de 1 renglón, se ensanchó 1 renglón del mismo bloque para que quede parejo"). Lo que no puede arreglar sin romper el diseño (ojos rodeados de trazos finos, piezas encajadas sin lugar) queda marcado para editar a mano. Si el resultado fuera peor que el original, no propone nada.
   - **No cambia la medida del sello**: si al abrir espacios el diseño quedó más ancho, achica todo parejo (ícono incluido) para que entre en la misma medida, y lo vuelve a chequear así. Abajo dice cuánto se achicó.
   - **Último recurso**: si igual quedan lugares y agrandar el sello un poco (hasta 6 %, sin pasar el tope de la planchuela) los resuelve, aparece **Agrandar a A × B mm y usar**. Cambia la medida de fabricación: usalo solo si es imprescindible.
5. Compará con **Original**, **Corregido** y **Qué cambia** (en celeste, lo que cambió).
6. **Editar a mano** (con una corrección hecha: **Editar el corregido** o **Editar el original**): abre un editor en el mismo lugar, para lo que la corrección automática no resuelve. Arriba a la derecha ves si la fresa separa todo, los lugares numerados (**Ir a: 1 2…** acerca la vista a cada uno) y la medida del sello. La fresa se vuelve a chequear sola cada vez que soltás un cambio.
   - **El mouse, sin elegir herramientas** (como en Illustrator):
     - **Clic izquierdo**: tocá una pieza (una letra, el ícono) para elegirla; se pinta de azul con su medida. Arrastrala para moverla, o usá las flechas del panel o del teclado (eligís cuánto: 0,02 a 0,5 mm).
     - **Esquinas** de lo elegido (cuadraditos): arrastralas para agrandar o achicar parejo, sin deformar; mientras arrastrás ves el %. Con **Alt**, desde el centro.
     - **Doble clic** en una pieza: editar sus nodos (si están muy juntos, acerca la vista justo lo necesario donde hiciste doble clic). Aparece **Editando nodos** arriba a la izquierda; **Esc**, **Listo** o un clic en el fondo terminan.
     - **Clic derecho**: un menú con lo que se puede hacer ahí. En una pieza: editar nodos, acercar, agrandar/achicar 1 %, engordar/afinar, simplificar, borrar. En un nodo: **Esquina** (sin manijas), **Suave** (manijas alineadas) o borrar. En el fondo: elegir todo, ver todo, deshacer, rehacer.
     - **Rueda**: acercar o alejar. **Rueda apretada** y arrastrar (o **Espacio** + arrastrar): moverse por el dibujo.
   - **Varias piezas**: arrastrá un rectángulo en el fondo, o **Shift+clic** para sumar o sacar; **Ctrl+A** elige todo. Mover, tamaño, grosor y borrar se aplican a todas juntas.
   - **Guías e imán** (botón del imán o tecla G): al arrastrar, lo que movés se pega a los bordes y centros de las otras piezas y al centro del diseño, y aparece una línea violeta. **Shift** mientras arrastrás: solo en horizontal o solo en vertical (no se desalinea el renglón). **Ctrl**: suelta el imán. Al mover nodos, se alinean con los otros nodos de la pieza.
   - **Relieve 3D** (casilla en la barra): muestra cómo queda tallado, con luz, como si miraras el sello de bronce. Lo de arriba (lo que marca) es bronce claro; lo tallado se oscurece cuanto más hondo, hasta la profundidad final. Si entre dos letras o en un ojo se ve claro, la fresa no bajó ahí. Se puede seguir editando encima; al soltar cada cambio se recalcula.
   - **Medidas**: mientras arrastrás ves cuánto moviste; con algo elegido ves en celeste el espacio en mm a las piezas vecinas.
   - **Alinear y espaciar** (un renglón de íconos; pasá el mouse para ver qué hace cada uno): con 2 o más piezas, alinear bordes izquierdos, centros, derechos, de arriba, centros o de abajo (la base del renglón); con 3 o más, **espaciar parejo ↔ / ↕**: deja el mismo espacio entre todas, sin mover las de las puntas. Sirve para emparejar el espaciado de un renglón.
   - **Tamaño**: −1 % / +1 %, o un porcentaje. Parejo, sin deformar, desde el centro de la pieza.
   - **Grosor**: **Afinar** (offset interior) o **Engordar** (offset exterior) los mm que pongas, en paralelo y con curvas suaves. El resultado queda a menos de 0,02 mm del offset exacto: las esquinas se conservan y la letra no se deforma.
   - **Nodos** (doble clic en la pieza, botón **Editar nodos** o tecla **A**): ves sus nodos. Si están muy juntos aparecen como puntitos: acercate (rueda o **F**) y se vuelven cuadraditos que podés arrastrar. Tocá un nodo para ver sus manijas (círculos). En el panel: **Esquina**, **Suave** y borrar el nodo elegido (también **Supr**).
   - **Quitar de más (N)** (los naranjas): saca nodos repetidos o en medio de una recta, sin cambiar la forma. **Simplificar**: debajo dice cuántos nodos van a quedar (por ejemplo «Quedarían 22 de 577 nodos»). Las rectas llenas de nodos quedan con un nodo en cada esquina y las curvas con pocos nodos; la forma cambia como mucho lo que elegís (0,005 a 0,05 mm). Con una pieza elegida se aplica solo a esa.
   - **Borrar** (el tacho rojo al lado de la medida de lo elegido, o **Supr**) y **Borrar motas (N)** (piezas sueltas de menos de 0,05 mm², restos de la vectorización; si no hay, el botón está apagado).
   - **Zoom**: abajo a la izquierda del dibujo, **−**, **+** y **Ver todo** (igual que en el chequeo), con el ancho que se ve en mm. Tecla **0**: ver todo; **F** o el botón del visor: acercar a lo elegido. **Atajos** muestra la lista.
   - **Ctrl+Z** deshace, **Ctrl+Y** rehace. **Terminar edición** (siempre a la vista, abajo del panel) vuelve al chequeo con lo editado para compararlo y usarlo; **Cancelar** pregunta antes de tirar los cambios.
   - **El panel no se mueve**: todos los controles están siempre en el mismo lugar (apagados cuando no se pueden usar, por ejemplo Alinear con una sola pieza) y lo que hiciste aparece en un aviso que flota arriba del dibujo y se va solo. Así podés tocar **+1 %** o una flecha varias veces seguidas sin que el botón se corra. Mientras la fresa se vuelve a chequear, se sigue viendo el último resultado con «actualizando». Los atajos de teclado (Ctrl+Z, flechas, Supr) funcionan aunque hayas tocado un botón del panel. Solo funciona con vectores de rellenos negros (sin blancos ni trazos).
7. **Usar el corregido** elige esa versión para guardar; **Usar el original**, el vector como salió. Se guarda en el pedido cuando tocás **Confirmar**. También podés **Descargar** el corregido para terminarlo en Illustrator.

Si confirmás un vector con lugares donde la fresa no llega, la app pregunta antes (**Revisar** o **Confirmar igual**). **Confirmar todos** ofrece **Confirmar solo los OK**.

🤖 Al confirmar, la app escala el vector a la medida pedida y lo mide:
- Si entra bien en la planchuela y no se desvía más de 6 mm de lo pedido, se guarda directo.
- Si no, aparece **Confirmar medida de fabricación** (ver abajo).

## Pestaña Asignar SVG: subir vectores hechos a mano

Para los diseños que vectorizaste en Illustrator u otro programa.

1. **Arrastrá SVG ya hechos** a la pestaña (o soltá un SVG directamente sobre un sello).
2. La app los empareja con los sellos pendientes **por el nombre del archivo** (ignora palabras como "logo", "vector", "final"). Por eso conviene nombrar el archivo como el diseño.
3. Revisá cada emparejamiento; si alguno está mal, cambialo en **Elegir sello…**.
4. Cuando un SVG ya tiene sello asignado, aparece su chip **Fresa** (ver [Chequeo de fresa](#chequeo-de-fresa)). Antes de asignarlo no se puede chequear porque no se sabe la medida.
5. Tocá **Confirmar asignaciones**. Si alguno tiene lugares donde la fresa no llega, la app avisa (**Revisar** o **Guardar igual**).

También se puede subir un vector a mano desde la celda **Vector** en [Pedidos](03-pedidos.md#archivos-base-vector-y-foto) o [Producción](06-produccion.md).

## Pestaña Lote libre: imágenes sueltas

Para vectorizar imágenes que **no son de un pedido** (pruebas, diseños para redes, sellos estándar). Arrastrá, pegá (Ctrl+V) o hacé clic para subir, tocá **Vectorizar lote** y descargá un ZIP con los SVG. No se guarda nada en los pedidos. También cobra créditos.

## La medida de fabricación

Cada sello tiene dos medidas:

- **Pedida**: la que cargó Ventas.
- **De fabricación**: la del vector real, que es la que se usa para elegir la planchuela, armar el programa y calcular el costo.

Casi siempre son iguales. Cuando el logo tiene otra proporción, o no entra en la planchuela, aparece **Confirmar medida de fabricación**:

- Muestra la medida sugerida, que **mantiene la proporción del diseño** (nunca lo deforma).
- **Acercar a lo pedido**: ajusta lo más cerca posible de la medida pedida (si lo pedido ya supera el tope, lleva el lado chico al tope).
- **Usar vector medido**: usa la medida real del vector.
- También podés **escribir Ancho (mm) y Alto (mm)** a mano (coma o punto decimal). Al hacer click se selecciona todo; Enter confirma. El candado bloquea o libera la proporción.
- Tocá **Confirmar medida**.

Si pediste el sello al máximo de la planchuela (ej. 40×40), el lado chico del vector se lleva solo al tope (36,5 mm) y el otro sale por proporción, sin aviso — salvo que el lado largo se aleje 6 mm o más.

Tope de cada planchuela (el lado corto del sello no puede superarlo): 12 → 11,5 mm · 19 → 18 mm · 25 → 24 mm · 38 → 36,5 mm · 63 → sin tope.

Las medidas siempre se expresan **lado largo × lado corto**.
