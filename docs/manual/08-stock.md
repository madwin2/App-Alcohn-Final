# 8. Stock

[← Volver al índice](README.md)

Lleva las cantidades de los **insumos de armado** (mangos, tubos, tuercas, varillas, prisioneros, soldadores, bases, cajas y soportes de abecedario), los descuenta solos cuando un pedido se despacha y avisa cuando faltan. También muestra el **consumo de bronce** por mes. Se llega desde **Stock** en el menú.

⚠️ Hoy **no se lleva stock de bronce (planchuelas) ni de packaging**. Solo el consumo de bronce, que se calcula al fabricar.

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

## Consumo de bronce

Muestra cuánto bronce se usó, por planchuela, en un período.

- Se registra **cada vez que un sello pasa a Hecho**: su largo + 0,8 cm de corte. Si se rehace, se cuenta de nuevo.
- Elegí el **Período** (**Desde** / **Hasta**).
- **Total del período**: por **Planchuela**, los **Cm usados**, el **Costo material** y la cantidad de **Sellos**.
- **Día por día**: el detalle diario.

Sirve para saber cuánta planchuela comprar y cuánto se gasta en bronce.
