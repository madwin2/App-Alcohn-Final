# 3. Pedidos

[← Volver al índice](README.md)

Es la pantalla central de Ventas. Acá se cargan los pedidos, se sigue cada sello, se suben las fotos, se confirman los pagos y se cargan los seguimientos. Se llega desde **Pedidos** en el menú (es la pantalla que se abre al entrar a la app).

## Contenido

- [La pantalla](#la-pantalla)
- [La tabla](#la-tabla)
- [Cargar un pedido nuevo](#cargar-un-pedido-nuevo)
- [Editar un pedido](#editar-un-pedido)
- [Agregar o eliminar ítems](#agregar-o-eliminar-ítems)
- [Archivos: base, vector y foto](#archivos-base-vector-y-foto)
- [Cambiar estados](#cambiar-estados)
- [Subir fotos de sellos terminados](#subir-fotos-de-sellos-terminados)
- [Cobrar: de Foto Enviada a Transferido](#cobrar-de-foto-enviada-a-transferido)
- [Cargar los seguimientos antes de ir al correo](#cargar-los-seguimientos-antes-de-ir-al-correo)
- [Rehacer un sello](#rehacer-un-sello)
- [Prioridad y fecha límite](#prioridad-y-fecha-límite)
- [Tareas de un pedido](#tareas-de-un-pedido)
- [Buscar, filtrar y ordenar](#buscar-filtrar-y-ordenar)
- [Ficha del cliente](#ficha-del-cliente)
- [Links de Andreani](#links-de-andreani)
- [Abecedarios: hoja de fabricación](#abecedarios-hoja-de-fabricación)
- [Exportar ventas](#exportar-ventas)

## La pantalla

Arriba a la izquierda: el título **Pedidos** y un resumen (**Total**, **Sin hacer**, **Hecho**).

Arriba a la derecha, de izquierda a derecha:

| Botón | Para qué |
|---|---|
| Buscador (**Buscar pedidos...**) | Buscar por cliente, teléfono, diseño, etc. |
| **Toda la base** | Buscar también en pedidos viejos ([ver abajo](#buscar-filtrar-y-ordenar)) |
| **Ordenar** | Elegir el orden de la tabla |
| **Filtros** | Filtrar por fechas, estados, tipo, canal y quién cargó |
| **Subir Fotos** | Subir varias fotos de sellos terminados de una vez |
| **Subir seguimientos** | Cargar el PDF de etiquetas del correo |
| **Exportar ventas** | Bajar un archivo con las ventas |
| **Nuevo** | Cargar un pedido nuevo |

### Qué pedidos se ven

- Por defecto, los pedidos de los **últimos 6 meses**, más los pedidos más viejos que **todavía no se despacharon**.
- Los pedidos de la tienda web **solo aparecen cuando están pagados**. Los que no se pagaron se ven en [Comercial Web](10-comercial-web.md).
- La tabla se actualiza sola cuando otra persona cambia algo (tarda un par de segundos).

## La tabla

Cada **fila** es un pedido. Si el pedido tiene varios ítems, tocá la celda **Diseño** (**Click para expandir**) o **Ver items** para abrirlo: aparece un renglón por ítem, y ahí se editan los estados y archivos de cada uno.

⚠️ Una fila con **fondo rojizo** es un pedido con algún sello **sin archivo base ni vector**: falta el diseño.

### Columnas

| Columna | Qué muestra | Qué se puede hacer |
|---|---|---|
| (indicador) | En qué paso está el pedido: Hecho → Foto → Transferido → Etiqueta → Lista → Despachado → Enviado | — |
| **Fecha** | Día en que se cargó | — |
| **Cliente** | Nombre y apellido | Clic: abre la [ficha del cliente](#ficha-del-cliente) |
| **Contacto** | Teléfono | Clic: copia el número |
| **Tipo** | Tipo de sello: Clásico, 3MM, Alimento, Lacre, ABC (o el accesorio) | Cambiar el tipo |
| **Diseño** | Nombre del diseño | Clic: abre los ítems |
| **Empresa** | Transportista y modalidad (Andreani, Correo Argentino, Vía Cargo, DHL, Retiro en Persona) | Cambiarla. Con Andreani muestra el link asignado (clic para copiarlo); con DHL, un botón para copiar la dirección |
| **Seña** | Lo que pagó de seña | Editar (en modo edición) |
| **Valor** | Precio total | Editar (en modo edición) |
| **Restante** | Lo que falta pagar, **incluido el envío** si corresponde. "(envío pendiente)" = todavía no se sabe el costo del envío | — |
| **Prioridad** | 🔥 si es prioritario | Clic: prender o apagar |
| **Fabricación** | Estado de fabricación | Cambiarlo |
| **Venta** | Estado de venta | Cambiarlo (solo si está **Hecho**) |
| **Envío** | Estado de envío | Cambiarlo (solo si la venta está **Transferido**) |
| **Seguimiento** | Número de seguimiento o **Sin asignar** | Editar (en modo edición) |
| **Base** | Diseño original del cliente | Subir, reemplazar, descargar |
| **Vector** | Diseño vectorizado | Subir, reemplazar, descargar |
| **Foto** | Foto del sello terminado | Subir, reemplazar, descargar |
| Tareas | Tareas del pedido | Ver y crear tareas |
| Cargos | Cobros adicionales por rehacer | Marcar como cobrado |
| Fecha límite | Fecha en que tiene que estar despachado | Poner o cambiar |

La tabla se adapta a cada uno: podés **arrastrar el borde de una columna** para cambiar el ancho y **arrastrar el encabezado** para moverla. Tu configuración queda guardada.

### Menú de clic derecho

Clic derecho sobre un pedido o un ítem:

| Opción | Qué hace |
|---|---|
| **Editar pedido** | Activa el [modo edición](#editar-un-pedido) de esa fila |
| **Agregar sello** | Agrega un ítem al pedido |
| **Eliminar sello** | Borra ese ítem (solo en el renglón de un ítem) |
| **Quitar link Andreani** / **Reasignar link Andreani** | Ver [Links de Andreani](#links-de-andreani) |
| **Descargar hoja de fabricación** | Solo en abecedarios |
| **Eliminar pedido** | Borra el pedido entero con todos sus ítems. ⚠️ No se puede deshacer |

## Cargar un pedido nuevo

⚠️ **Sin seña no se toma un trabajo.** El diseño y la medida pueden completarse después, pero la seña tiene que estar.

Tocá **Nuevo**. Se abre **Nuevo Pedido** en pasos.

### Paso 1: el cliente

1. Escribí el **Teléfono** primero. Si el cliente ya compró, la app lo reconoce y completa sus datos (**✓ Datos del cliente cargados automáticamente**). También lo busca por email.
2. Completá o revisá **Nombre**, **Apellido**, **Teléfono** y, si lo tenés, **Email**.
3. **Canal de contacto**: WhatsApp, Instagram, Facebook, Email, Web u Otro.
4. **Pedido internacional**: marcalo solo si el cliente es de otro país y elegí el **País**. Los montos se cargan en la moneda de ese país y el envío queda como DHL Internacional.
5. **No enviar aviso de confirmación al cliente**: marcalo solo si estás cargando tarde un pedido que el cliente ya sabe que se tomó, para que no le llegue el WhatsApp de confirmación.
6. Tocá **Continuar a Pedido**.

Si el cliente ya existía y cambiaste su nombre, teléfono o email, la app **actualiza** sus datos.

### Paso 2: el diseño

1. **Tipo de Ítem**: Sello, Abecedario, Soldador Eléctrico, Mango de Golpe o Base para Remachadora.
2. Para un **sello**:
   - **Nombre del Diseño** (obligatorio). Usá un nombre que lo identifique (la marca del cliente, por ejemplo).
   - **Medida** en milímetros: `40×40`, o un solo número (`35`) si es cuadrado o redondo. Siempre largo × corto.
   - **Tipo de Sello**: Clásico, Alimento, Lacre o ABC. (El tipo **3MM** no está en el alta: se cambia después en la columna **Tipo**).
   - Con la medida cargada, la app **sugiere el valor** según la lista de precios (precio con transferencia). Si hacés un descuento, cambialo.
3. Para un **soldador**, elegí la **Potencia** (100 W o 200 W). Para un **abecedario**, completá tipografía, altura de letra, mayúsculas/minúsculas y letras extras. En soldadores, mangos y bases el valor lo pone la lista de precios.
4. **Notas**: cualquier aclaración para Producción.
5. **Valores**: **Valor Total** y **Seña**. El **Restante** se calcula solo.
6. **Transportista y Estado**:
   - **Transportista**: Andreani, Correo Argentino o Vía Cargo (domicilio o sucursal), Retiro en Persona o DHL Internacional. Si todavía no se sabe, dejalo vacío: un pedido sin transportista se trata como Correo Argentino.
   - **Estado de Fabricación**: normalmente **Sin Hacer**.
   - **🔥 Pedido Prioritario** y **📅 Fecha Límite** si corresponde ([ver abajo](#prioridad-y-fecha-límite)).
7. **Archivos**: **Archivo Base** (lo que mandó el cliente: imagen o PDF) y, si ya lo tenés, **Archivo Vector**.

### Paso 3: más diseños o terminar

- Si el cliente pidió más de un sello, tocá **Agregar Diseño** (o **Agregar Otro Diseño**) y cargá el siguiente. Arriba aparecen pestañas con cada diseño cargado; con **+ Nuevo diseño** agregás otro.
- Cuando terminaste, tocá **Crear Pedido** / **Finalizar Pedido (N diseños)**.

🤖 Al crear el pedido:
- Al cliente le llega un WhatsApp confirmando el pedido (salvo que hayas marcado no avisar).
- El pedido queda en **Señado** y **Sin Hacer**, a tu nombre.
- Si el vector que subiste no es SVG, la app te avisa antes de crear.

⚠️ Del **primer diseño** se toman el transportista y la fecha límite de todo el pedido: un pedido tiene un solo envío.

## Editar un pedido

Clic derecho → **Editar pedido**. La fila queda marcada y podés escribir directamente en **Cliente**, **Contacto**, **Diseño**, **Seña**, **Valor** y **Seguimiento**.

- **Enter** o hacer clic afuera guarda.
- **Escape** cancela.

Si escribís un número de seguimiento que no corresponde a la empresa elegida (por ejemplo, un número de Andreani en un pedido de Correo), la app te pregunta **Seguimiento y empresa no coinciden**: podés cambiar la empresa, **Continuar sin cambiar** o **Cancelar**.

## Agregar o eliminar ítems

- **Agregar**: clic derecho → **Agregar sello**. Se abre **Agregar Ítem al Pedido** con los mismos campos que el alta (diseño, medida, tipo, notas, valores, estados, archivos). Tocá **Agregar Ítem**.
- **Eliminar**: abrí el pedido, clic derecho sobre el ítem → **Eliminar sello**.

🤖 En los dos casos al cliente le llega un WhatsApp con el pedido actualizado. Si agregás un ítem a un pedido que ya estaba pagado o con foto, Ventas recibe un aviso.

## Archivos: base, vector y foto

Cada ítem tiene tres archivos. En la celda:

- **Clic** en una celda vacía: subir.
- **Clic** en una celda con archivo: ver o reemplazar.
- **Clic derecho**: descargar.

| Archivo | Qué es | Formatos |
|---|---|---|
| **Base** | Lo que mandó el cliente | JPG, PNG, PDF |
| **Vector** | El diseño vectorizado para fabricar | SVG (recomendado), EPS, PDF, AI |
| **Foto** | Foto del sello terminado | JPG, PNG |

- Si reemplazás la **base**, se borra el vector anterior (hay que volver a vectorizar).
- Al subir un **vector**, la app mide el diseño:
  - Si coincide con la medida pedida, dice **Medida OK**.
  - Si se desvía 6 mm o más, aparece **Confirmar medida de fabricación** con la medida sugerida. Podés tocar **Acercar a lo pedido**, **Usar vector medido** o escribir ancho y alto (el candado mantiene la proporción). Tocá **Confirmar medida**.
- Los EPS pueden quedar sin miniatura: igual quedan guardados y se pueden descargar.
- ⚠️ Subir la **foto** le manda un WhatsApp al cliente. Ver [Subir fotos](#subir-fotos-de-sellos-terminados).

La vectorización normalmente se hace en la pantalla [Vectorización](04-vectorizacion.md); acá se puede subir un vector hecho a mano.

## Cambiar estados

Cada estado es un desplegable. En la fila del pedido cambia **todos** los ítems; en el renglón de un ítem, solo ese.

- **Fabricación**: lo cambia sobre todo Producción. Si elegís **Rehacer**, se abre el [diálogo de rehacer](#rehacer-un-sello).
- **Venta**: solo se habilita cuando el ítem está **Hecho**. Si todos los ítems quedan en el mismo estado, el pedido toma ese estado.
- **Envío**: solo se habilita cuando la venta está **Transferido**. En general lo cambian solas las pantallas de [Envíos](07-envios.md) y la carga de seguimientos; tocarlo a mano es para casos especiales (retiro en persona, Vía Cargo).

Qué significa cada estado: ver [Lo básico](README.md#los-tres-estados-de-cada-ítem).

## Subir fotos de sellos terminados

La foto es la prueba para el cliente de que su sello está listo y el pedido de pago del resto. Se sube **por ítem**, apenas ese ítem está Hecho.

### Varias fotos a la vez (lo habitual)

1. Tocá **Subir Fotos**.
2. **Seleccionar Fotos** y elegí todas las fotos del día.
3. Para cada foto, en **Asignar a sello:** elegí a qué sello corresponde. Solo aparecen sellos **Hecho**, con venta **Señado** y **sin foto**.
4. Tocá **Asignar Foto** en cada una, o asigná todas juntas.

- Si cerrás la ventana antes de asignar, las fotos **quedan guardadas** como **Foto pendiente** para la próxima vez.
- Si algún pedido es de **Andreani**, antes de asignar la app verifica que haya **links de Andreani** disponibles (hace falta uno por pedido). Si faltan, aparece **Faltan links de Andreani**:
  - **Esperar a que estén disponibles**: las fotos quedan en la ventana; andá a cargar links ([Envíos](07-envios.md#andreani)) y después volvé y asigná.
  - **Asignar de todas formas**: se asignan igual, pero a los clientes de Andreani les puede llegar el mensaje sin link.

### Una sola foto

Clic en la celda **Foto** del ítem y elegí la imagen.

🤖 Al subir la foto:
- La venta pasa a **Foto Enviada**.
- Al cliente le llega por WhatsApp la foto con lo que falta pagar:
  - Si es el último ítem con foto del pedido, le cobra el **total restante del pedido**.
  - Si el pedido es de **Andreani**, le cobra solo el producto y le manda el **link de Andreani** para que cargue sus datos y pague el envío ahí.
  - Si no eligió transportista, le pregunta si prefiere Andreani o Correo.
  - Si es Correo, le cobra el total con el envío.
  - Con **3 sellos o más**, el envío es gratis.
- Empieza a correr el plazo: a los **10 días** sin pago pasa a **Deudor**.

⚠️ Reemplazar una foto por otra **vuelve a mandar** el mensaje al cliente.

## Cobrar: de Foto Enviada a Transferido

Cuando el cliente paga el resto:

- Si es **Correo Argentino**: cargá sus datos de envío en [Envíos](07-envios.md). Al guardarlos, la venta pasa sola a **Transferido**. (Los datos de envío se cargan **solo después del pago**.)
- En otros casos, cambiá **Venta** a **Transferido** en la tabla.

**Transferido** significa que pagó **todo**, incluido el envío si correspondía. Con Andreani el envío lo paga el cliente en la página de Andreani.

## Cargar los seguimientos antes de ir al correo

Con este paso el pedido pasa a **Despachado** y al cliente le llega su número de seguimiento. Se hace **justo antes de llevar los paquetes al correo**.

1. Bajá el PDF de etiquetas desde MiCorreo (o Andreani).
2. Tocá **Subir seguimientos**.
3. En **Origen del PDF** elegí **Correo Argentino** o **Andreani**.
4. **Seleccionar PDF**. La app lee cada etiqueta y la empareja con un pedido por el **nombre del destinatario**. Te muestra:
   - **Se van a actualizar**: los que coincidieron.
   - **Sin match en pedidos**: elegí el pedido a mano o **Dejar sin asignar**. Solo aparecen pedidos **Hecho**, con venta **Foto Enviada** o **Transferido** y sin seguimiento.
   - **Ambiguos**: hay más de un pedido con el mismo nombre; elegí el correcto.
   - **Ya asignado**: el pedido ya tenía otro seguimiento.
5. Tocá **Aplicar seguimientos**.
6. Tocá **Descargar PDF con previews**: es el PDF para imprimir, con etiquetas de 100 × 152 mm, los logos y los datos del pedido al pie. Imprimilo en la Zebra.

🤖 Qué cambia:

| | Correo Argentino | Andreani |
|---|---|---|
| Seguimiento | Se carga | Se carga |
| Estado de envío | **Despachado** | **Etiqueta Lista** (pasa a Despachado cuando Andreani registra el ingreso) |
| Venta | Pasa a **Transferido** si no lo estaba | No cambia |
| WhatsApp al cliente | Sale el número de seguimiento y el envío pasa a **Seguimiento Enviado** | Cuando pase a Despachado |

Al llegar a **Seguimiento Enviado** se descuentan del stock los insumos del envío. Si falta algo, aparece **Falta stock para este envío** y se crean tareas de reposición.

## Rehacer un sello

Cuando un sello hay que fabricarlo de nuevo (salió mal en la máquina, error de medida/vector/Aspire, reclamo del cliente, daño en el envío):

1. En **Fabricación**, elegí **Rehacer** (en la fila del pedido para todos los ítems, o en el renglón de uno).
2. Se abre **Rehacer**. Elegí el **Motivo**:
   - Error detectado en máquina
   - Error en la Medida
   - Error en el Vector
   - Error en Programación Aspire
   - Reclamo del cliente (antes de entregar)
   - Daño o error en el envío
   - Reclamo del cliente (después de entregar)
   - Otro (hay que describirlo)
3. Escribí qué pasó y qué hay que cambiar.
4. Si corresponde **cobrarle algo al cliente** (depende de quién fue el error), marcá **Corresponde cobrar algo al cliente** y poné **Monto** y **Concepto**.
5. Confirmá.

🤖 Qué pasa:
- El sello vuelve a **Rehacer** y queda **prioritario**.
- Si ya tenía foto, se borra y la venta vuelve a **Señado**.
- Si el pedido ya tenía envío, vuelve a **Sin Envío** (el seguimiento viejo queda guardado en el historial).
- Producción y Ventas reciben un aviso.
- Al cliente le llega un WhatsApp avisando que se va a rehacer. Es a propósito: el cliente sabe que hubo un error y que va a demorar.

El cobro adicional aparece en la columna de cargos como **Cobro adicional pendiente**. Cuando lo cobrás, marcalo **Cobrado**. ⚠️ Este cobro **no se suma** al restante del pedido: hay que pedírselo al cliente aparte.

## Prioridad y fecha límite

- **Prioridad** (🔥): el sello pasa primero en Vectorización y en Programas, y Producción recibe un aviso. Se prende con un clic en la columna **Prioridad** o al cargar el pedido. Todo sello que pasa a Rehacer queda prioritario solo.
- **Fecha límite**: la fecha en que el pedido tiene que estar **listo y despachado**. Clic en la celda → **Establecer fecha límite** o **Editar**. Aplica a todos los ítems del pedido.

🤖 Con fecha límite, Producción recibe un aviso cuando faltan 3 días o menos para que venza un sello que no está Hecho, y Logística cuando faltan 3 días o menos para despachar.

## Tareas de un pedido

En la columna de tareas:

1. Tocá la celda para ver las **Tareas del pedido**.
2. Agregá una: **Título de la tarea**, **Descripción** y **Fecha límite** (opcionales) → **Crear tarea**.
3. Cambiá el estado: **Pendiente**, **En progreso**, **Completada**.

## Buscar, filtrar y ordenar

### Buscar

Escribí en **Buscar pedidos...**: nombre, teléfono, diseño, etc.

Para buscar un pedido viejo (más de 6 meses y ya despachado), activá **Toda la base** y escribí **al menos 4 letras**. Con menos de 4, la búsqueda sigue siendo sobre la vista normal.

### Filtros

**Filtros** abre **Filtros de Pedidos**:

- **Rango de fechas**: por **Mes**, o **Desde** / **Hasta**.
- **Estado de fabricación**, **Estado de venta**, **Estado de envío**.
- **Tipo** de sello.
- **Medio de contacto** (WhatsApp, Instagram, Facebook, Mail, Web).
- **Quién lo subió**: la persona que cargó el pedido.

### Ordenar

**Ordenar** abre **Configurar Ordenamiento**:

- Elegí uno o más criterios (**Fecha**, **Cliente**, **Fabricación**, **Venta**, **Envío**, **Valor**, **Restante**), cada uno **Ascendente** o **Descendente**.
- Si ordenás por fabricación, arrastrá los estados para elegir cuál va primero.

## Ficha del cliente

Clic en el nombre del cliente. Muestra:

- Si es **Recurrente** (más de un pedido).
- Teléfono (con botón a **WhatsApp**) y email, con botón para copiarlos.
- Resumen: cantidad de **Pedidos**, total **Facturado**, **Pendiente** de cobro, **Último pedido**.
- El historial de pedidos con sus ítems y direcciones de envío.

## Links de Andreani

Los pedidos de Andreani usan un **link** que el cliente completa y paga en la página de Andreani. Los links se generan antes y quedan en un "pool" ([ver Envíos](07-envios.md#andreani)). La app asigna uno a cada pedido cuando se le manda la foto.

En la columna **Empresa** se ve el link asignado; clic para copiarlo. Con clic derecho:

- **Quitar link Andreani**: lo borra del pedido.
- **Reasignar link Andreani**: le da un link nuevo y lo copia para que se lo mandes al cliente.

Si no hay links disponibles, aparece **Sin links Andreani disponibles — generá más**.

## Abecedarios: hoja de fabricación

En un ítem **Abecedario**, clic derecho → **Descargar hoja de fabricación**. Baja un PDF con los datos del abecedario para Producción.

## Exportar ventas

**Exportar ventas** baja un archivo CSV con fecha, teléfono, nombre, valor y mail de **todos los pedidos cargados** (los últimos 6 meses más los no despachados, o toda la base si está activado **Toda la base**). ⚠️ No respeta los filtros ni el buscador. Los pedidos internacionales se exportan en pesos. Sirve, por ejemplo, para cargar públicos en publicidad.
