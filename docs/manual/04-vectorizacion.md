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
2. **Prepará cada imagen** (opcional). Clic derecho sobre un diseño:
   - **Recortar…**: abre el editor de recorte (**Auto**, **Todo**, **Cuadrado**; **Aceptar** para confirmar). Sirve para sacar fondo o bordes que no van en el sello.
   - **Copiar imagen** → retocarla afuera (por ejemplo con IA) → **Reemplazar por Portapapeles**: guarda la versión mejorada **sin borrar la original** del cliente.
   - **Volver a la original**: descarta la versión mejorada.
   - **Abrir imagen en pestaña nueva**, **Guardar imagen**.
3. Tocá **Vectorizar (N créditos)**. Se abre una confirmación con el costo y cómo queda el saldo. Confirmá.
4. Mientras trabaja muestra **Vectorizando… %**. Cuando termina, los resultados pasan a **Revisión**.

## Pestaña Revisión: controlar antes de guardar

⚠️ Nada se guarda en el pedido hasta que lo confirmás acá. Si cerrás o recargás la pestaña, **la revisión se recupera** en este mismo navegador (no en otra PC).

Por cada diseño se ve el antes y el después (**Damero** muestra el fondo a cuadros para ver qué es transparente). Criterio de revisión: fiel al diseño, líneas rectas bien hechas, sin deformaciones.

| Botón | Qué hace |
|---|---|
| **Confirmar** | Guarda el vector en el sello, con la medida pedida |
| **Rechazar** | Lo descarta (el sello vuelve a pendientes) |
| **Cambiar** (SVG) | Reemplaza el resultado por un SVG propio (por ejemplo, uno corregido en Illustrator) |
| **Confirmar todos** / **Descargar todos** | Para toda la tanda |

🤖 Al confirmar, la app escala el vector a la medida pedida y lo mide:
- Si entra bien en la planchuela y no se desvía más de 6 mm de lo pedido, se guarda directo.
- Si no, aparece **Confirmar medida de fabricación** (ver abajo).

## Pestaña Asignar SVG: subir vectores hechos a mano

Para los diseños que vectorizaste en Illustrator u otro programa.

1. **Arrastrá SVG ya hechos** a la pestaña (o soltá un SVG directamente sobre un sello).
2. La app los empareja con los sellos pendientes **por el nombre del archivo** (ignora palabras como "logo", "vector", "final"). Por eso conviene nombrar el archivo como el diseño.
3. Revisá cada emparejamiento; si alguno está mal, cambialo en **Elegir sello…**.
4. Tocá **Confirmar asignaciones**.

También se puede subir un vector a mano desde la celda **Vector** en [Pedidos](03-pedidos.md#archivos-base-vector-y-foto) o [Producción](06-produccion.md).

## Pestaña Lote libre: imágenes sueltas

Para vectorizar imágenes que **no son de un pedido** (pruebas, diseños para redes, sellos estándar). Arrastrá, pegá (Ctrl+V) o hacé clic para subir, tocá **Vectorizar lote** y descargá un ZIP con los SVG. No se guarda nada en los pedidos. También cobra créditos.

## La medida de fabricación

Cada sello tiene dos medidas:

- **Pedida**: la que cargó Ventas.
- **De fabricación**: la del vector real, que es la que se usa para elegir la planchuela, armar el programa y calcular el costo.

Casi siempre son iguales. Cuando el logo tiene otra proporción, o no entra en la planchuela, aparece **Confirmar medida de fabricación**:

- Muestra la medida sugerida, que **mantiene la proporción del diseño** (nunca lo deforma).
- **Acercar a lo pedido**: ajusta lo más cerca posible de la medida pedida.
- **Usar vector medido**: usa la medida real del vector.
- También podés escribir **Ancho (mm)** y **Alto (mm)**. El candado bloquea o libera la proporción.
- Tocá **Confirmar medida**.

Tope de cada planchuela (el lado corto del sello no puede superarlo): 12 → 11,5 mm · 19 → 18 mm · 25 → 24 mm · 38 → 36,5 mm · 63 → sin tope.

Las medidas siempre se expresan **lado largo × lado corto**.
