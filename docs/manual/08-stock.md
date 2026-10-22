# 8. Stock

[← Volver al índice](README.md)

Lleva las cantidades de los **insumos de armado** (mangos, tubos, tuercas, varillas, prisioneros, soldadores, bases, cajas y soportes de abecedario), los descuenta solos cuando un pedido se despacha y avisa cuando faltan. También muestra el **consumo de bronce** por mes. Se llega desde **Stock** en el menú.

El **bronce** se lleva **pieza por pieza** (ver [Stock de bronce](#stock-de-bronce)). El **packaging** todavía no tiene stock.

## Cómo funciona

### Qué consume cada ítem

Cuando un pedido llega a **Seguimiento Enviado**, la app descuenta del stock:

| Ítem del pedido | Descuenta |
|---|---|
| **Sello** | 1 tubo 80 mm, 1 prisionero, 1 varilla, 1 mango, 1 tuerca |
| **Abecedario** | 1 tubo 125 mm, 1 mango, 1 varilla, 1 prisionero, 1 tuerca, 1 soporte, 1 caja |
| **Soldador** 100 W o 200 W | 1 soldador **adaptado** de esa potencia (si no hay, 1 sin adaptar) |
| **Mango de golpe** | 1 mango de golpe |
| **Base para remachadora** | 1 base + 1 aluminio para base |

"Adaptar" un soldador es cortarle la punta y hacerle una rosca M6 para enroscar el sello.

- El descuento se hace **una sola vez** por pedido y **siempre completo**. Si no alcanza, el número queda **en rojo (negativo)**: significa que se usó más de lo cargado.
- Si un pedido vuelve atrás (por ejemplo, por un Rehacer), el stock **no se repone**.

### Cuánto hace falta

La columna **Necesario (pendientes)** suma lo que consumirían los pedidos **no enviados de los últimos 60 días** (o deudores) que **todavía no se descontaron**.

## La tabla (Resumen rápido)

| Columna | Qué es |
|---|---|
| **Ítem** | El insumo. Badge **Negativo** / **Bajo** si aplica |
| **Stock actual** | Cuántos hay en el sistema (rojo si negativo) + casilla **Conteo físico** |
| **Necesario (pendientes)** | Cuántos harían falta para los pedidos pendientes |
| **Responsables por faltante** | Quién recibe la tarea de reposición cuando falta ese insumo (se puede elegir más de una persona) |
| **Acciones** | **Guardar conteo** |

### Conteo físico

Escribí en **Conteo físico** cuántos hay realmente y tocá **Guardar conteo**. Eso deja el stock en ese número y registra el ajuste. Usalo después de contar lo que hay en el depósito (recomendado tras cualquier cambio grande del sistema).

### Elegir responsables

Elegí una o más personas en **Responsables por faltante**. Cuando falte ese insumo:

🤖 Al abrir su Inicio, a cada responsable le aparece una tarea de reposición en **Stock pendiente** y un aviso de **stock bajo** en la campanita. Cuando se carga el ingreso desde el Inicio ([ver Inicio](02-inicio.md#stock-pendiente)), la tarea se cierra.

## Stock de bronce

Muestra cada planchuela que hay en el taller, **pieza por pieza**, con su largo. Lo importante no es solo cuántos centímetros quedan, sino **qué filas se pueden armar**: dos piezas de 200 no sirven para una fila de 400.

| Columna | Qué es |
|---|---|
| **Planchuela** | El ancho. Badge **Contar** si la app necesita que cuentes ese ancho; **Pedir** si hay que comprar |
| **Piezas útiles** | El largo de cada pieza (desde 25 mm). Abajo, cuántos retazos hay |
| **Total útil** | La suma de las piezas útiles |
| **Para mecanizar** | Por máquina: cuántas filas completas salen (400 en la Chica, 250 en la Grande y la XL) y qué piezas más cortas hay |
| **Alcanza / pedir** | Para cuántos días alcanza al ritmo de los últimos 60 días y, si hace falta, qué pedir (p. ej. «1 m → 2 × 400 + 1 × 200») |

### Cómo se mueve solo

- 🤖 **Cuando se termina un programa** (todos sus sellos en Hecho, Verificar o Rehacer), cada fila se descuenta de **la pieza más corta en la que entra**. Nadie tiene que elegir la pieza.
- En la Grande y la XL, si no hay ninguna pieza de hasta 250, usa una más larga (sobresale).
- Si a una pieza le quedan **menos de 25 mm**, pasa a **retazo**.
- Un sello que se marca Hecho **sin estar en un programa** no descuenta pieza; la diferencia aparece en el próximo conteo.
- Si se terminó una fila y no había ninguna pieza que alcanzara, el ancho queda con el badge **Contar**.

### Cuando llega bronce

Tocá **Llegó bronce** y escribí, en cada ancho que vino, los cortes como los pediste: `2x400 + 200`, `2 × 400, 200` o `400 400 200`. Dejá vacío lo que no vino.

### Contar

Tocá **Contar** en un ancho: aparece la lista de piezas que la app cree que hay. Corregí los largos, quitá las que no están y sumá las que falten, y tocá **Guardar conteo**. Hacelo cuando llega una compra o cuando aparece el badge **Contar**.

⚠️ **La primera vez**: el stock arranca con un conteo. Hasta que se cargue alguna pieza, terminar un programa no descuenta nada.

### Aviso para pedir

🤖 Cuando el bronce útil de un ancho alcanza para **menos de 7 días**, Julián y Producción reciben un aviso en la campanita con el pedido sugerido (para unos 30 días). El aviso se va solo cuando se carga la compra.

### En la mesa de Programas

Sin un sello elegido, en el resumen de la derecha, debajo de cada planchuela se ven las piezas que hay de ese ancho. Si ninguna alcanza para la fila que estás armando, lo dice en amarillo. Es solo informativo: no bloquea nada.

## Consumo de bronce

Muestra cuánto bronce se usó, por planchuela, en un período.

- Se registra **cada vez que un sello pasa a Hecho**: su largo + 0,8 cm de corte. Si se rehace, se cuenta de nuevo.
- Elegí el **Período** (**Desde** / **Hasta**).
- **Total del período**: por **Planchuela**, los **Cm usados**, el **Costo material** y la cantidad de **Sellos**.
- **Día por día**: el detalle diario.

Sirve para saber cuánta planchuela comprar y cuánto se gasta en bronce.
