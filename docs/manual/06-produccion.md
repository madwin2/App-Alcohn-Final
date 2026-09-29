# 6. Producción

[← Volver al índice](README.md)

Es la lista de **todos los ítems** (un renglón por sello), pensada para el taller: qué hay que fabricar, con qué archivos, medidas, prioridad, fecha límite, vector, programa y máquina. Se llega desde **Producción** en el menú.

Diferencias con otras pantallas:
- **Pedidos** agrupa por pedido y se enfoca en venta y envío. **Producción** lista cada sello y se enfoca en fabricar.
- Los programas **se arman en [Programas](05-programas.md)**. Acá la columna del programa es solo para ver en cuál está cada sello.

## La pantalla

Arriba: **Producción**, buscador (**Buscar producción...**, por diseño, cliente o teléfono), **Ordenar**, **Filtros** y chips para filtrar rápido por estado: **Pendiente**, **En Progreso**, **Completado**, **Revisar**, **Rehacer**.

A diferencia de Pedidos, Producción muestra **todos** los sellos, de cualquier fecha (salvo pedidos web sin pagar). Usá los chips y los filtros para ver lo que te interesa.

### Estados en Producción

Esta pantalla agrupa los estados de fabricación así:

| Chip en Producción | Estados de fabricación que incluye |
|---|---|
| **Pendiente** | Sin Hacer, Programado |
| **En Progreso** | Haciendo |
| **Revisar** | Verificar, Retocar |
| **Completado** | Hecho |
| **Rehacer** | Rehacer |

### Columnas

| Columna | Qué muestra | Qué se puede hacer |
|---|---|---|
| Tarea | Tareas de producción del pedido y quién lo cargó | Ver y crear tareas |
| Fecha / **Fecha Límite** | Cuándo se cargó y cuándo tiene que estar. Marca **⚠️ Próximo a vencer** o **⚠️ Item vencido** | Cambiar o **Eliminar fecha límite** (solo de ese sello) |
| **TIPO** | Clásico, 3MM, Alimento, Lacre, ABC o accesorio | Cambiarlo |
| Diseño | Nombre del diseño. **Multi** si el pedido tiene varios ítems | Clic: **Ver info del pedido** (cliente, WhatsApp, total, envío) |
| Medida | Medida pedida y de fabricación (largo × corto) | — |
| **Notas** | Notas del pedido para producción | Editar |
| Prioridad | **PRIORIDAD** si es prioritario | Prender o apagar |
| **FABRICACIÓN** | Estado de fabricación | Cambiarlo (ver abajo) |
| **VECTORIZADO** | Estado del vector: Base, En Proceso, Vectorizado, Descargado, Error | Cambiarlo a mano |
| Programa | En qué programa está | Clic: **Ver en Programas** |
| Máquina | Máquina del programa, o **Sin programa** | — |
| **ARCHIVO BASE** | Diseño del cliente (o la versión mejorada) | Descargar |
| **VECTOR** | Vector del sello | Subir, reemplazar, descargar, eliminar |

Como en Pedidos, las columnas se pueden achicar, agrandar y mover, y la configuración queda guardada.

### Avisos en el diseño

- **Salió por falta de material**: el sello estaba en un programa y se sacó en Aspire porque no alcanzó la planchuela. No lo metas en la misma planchuela sin revisar.
- También se marca cuando un sello **no entró al Aspire** (casi siempre por un vector EPS).

## Cambiar el estado de fabricación

En la columna **FABRICACIÓN** elegí: **Sin Hacer**, **Programado**, **Haciendo**, **Retocar**, **Verificar**, **Hecho** o **Rehacer**.

- Para cambiar varios a la vez, seleccioná las filas (clic derecho → **Seleccionar fila**) y cambiá el estado en una de ellas.
- ⚠️ Mientras haya filas seleccionadas, **cualquier cambio** de fabricación, tipo, vectorizado o fecha límite se aplica a **todas las seleccionadas**. Deseleccioná cuando termines.
- **Rehacer** abre el diálogo para indicar el motivo ([ver Pedidos](03-pedidos.md#rehacer-un-sello)).
- **Verificar**: usalo cuando no estás seguro de que el sello salió bien y querés que Ventas lo revise.
- **Retocar**: salió un detalle mal que se corrige sin volver a fabricar.

⚠️ Si el sello **está en un programa**, su estado se maneja desde [Programas](05-programas.md). El menú de acá es un atajo para una pieza suelta; para tandas, usá Programas.

⚠️ Pasar a **Pendiente** (Sin Hacer) un sello que está en un programa no lo saca del programa. Para sacarlo, hacelo desde la hoja del programa.

La columna también permite elegir a mano un estado **Aspire** (Aspire C, G, XL y su versión Check). Es de antes de que existiera la pantalla Programas: **ya no hace falta usarlo**, porque Programas lo completa solo.

## Subir o corregir un vector

En la columna **VECTOR**:

- Clic en una celda vacía para subir (SVG recomendado; también EPS, PDF o AI). Si no es SVG, la app avisa.
- Clic derecho: **Reemplazar archivo**, **Descargar archivo**, **Eliminar archivo**.
- Al subir un SVG, la app controla la medida (**Medida OK** o **Confirmar medida de fabricación**; ver [Vectorización](04-vectorizacion.md#la-medida-de-fabricación)).

## Menú de clic derecho

| Opción | Qué hace |
|---|---|
| **Editar item** | Editar los datos del sello |
| **Seleccionar fila** / **Deseleccionar fila** | Para cambios en bloque |
| **Descargar archivo base** | Baja el diseño del cliente |
| **Descargar hoja de fabricación** | Solo abecedarios |
| **Eliminar item** | Borra el sello. ⚠️ No se puede deshacer |

## Tareas de producción

En la columna de tareas, **Nueva tarea de producción**: **Título de la tarea**, **Descripción**, **Fecha límite**, **Estado inicial** y **Asignado a** (opcionales) → **Crear tarea**. Los estados son Pendiente, En progreso y Completada.

## Filtros y orden

- **Filtros** (**Filtros de Producción**): **Rango de fechas** (**Hoy**, **Ayer**, **Esta semana**, **Mes**, **Desde**/**Hasta**), **Estado de producción** y **Estado de vectorización**. **Limpiar filtros** / **Aplicar filtros**.
- **Ordenar** (**Ordenar Producción**): arrastrá los estados para definir cuál va primero y agregá criterios (**Tarea**, **Tipo**, **Diseño**, **Medida**, **Fabricación**, **Programa**, **Estado Aspire**, **Máquina**), cada uno **Ascendente** o **Descendente**.
