# 5. Programas

## Probar la mesa de armado

En `/dev/mesa-programas` podés probar la nueva mesa con datos de ejemplo; Aspire está simulado. El **imantado está siempre activo**: cada sello queda centrado y separado exactamente **8 mm** del siguiente.

- Arrastrá un sello para ubicarlo antes o después de otro, o cambiarlo de planchuela. Los demás se acomodan y la vista previa muestra cómo quedarán.
- Al cambiar el **largo de fabricación**, el diseño conserva su proporción y los sellos de abajo bajan o suben automáticamente. Lo vendido no cambia.
- **Subir** y **Bajar** cambian un puesto. **Al final** lo coloca justo debajo del último sello de esa planchuela.
- **Quitar** cierra el hueco. **Deshacer/Rehacer** permite recuperar todo el acomodo anterior.
- Si no entra o la planchuela está sin material, aparece un aviso y se conserva el armado anterior. Elegí otra medida o planchuela.

No hace falta Ordenar, Fijar ni Soltar: el acomodo es automático y la separación no se modifica.

La vista **2D** oculta las trabas de fijación y muestra las ranuras redondeadas con líneas finas y tenues para destacar los sellos. En **3D/Mecanizado** siguen visibles las trabas.

**3D** muestra toda la mesa en líneas y el relieve estimado de los sellos, con los fondos y pendientes de las fresas configuradas. **Mecanizado** muestra ese mismo relieve con acabado de bronce. Acercá con la rueda para ver los detalles; pasá el cursor sobre un sello para saber si muestra solo la principal o también el repaso completo. El automático necesita un chequeo vigente. El repaso parcial se revisa en Aspire: esta vista no reproduce sus trayectorias.

## Preparar sobre el soporte (nuevo flujo, requiere puesta en marcha)

En la hoja o tarjeta de un programa de la máquina C (G y XL todavía no), abrí **Preparar programa**. Elegí un sello o arrastralo a otra planchuela; podés cambiar medida proporcional, mecanizado, posición, fijarlo o usar **Llevar al final**. **Reacomodar libres** conserva las posiciones fijas. **Deshacer/Rehacer** permite volver atrás. Las medidas vendidas no cambian.

En **Soporte y material**, verificá las posiciones y áreas útiles reales e indicá dónde hay material. En **Plantillas por mecanizado**, subí las plantillas nativas de Aspire y verificá sus herramientas, profundidades y selección automática por capas. Repaso: capas `REPASO CLASICO`, `REPASO 3MM` y `REPASO ALIMENTO`. Estos preparativos deben calificarse con Fede antes del primer uso productivo.

**Guardar preparación** chequea todos los SVG de la ejecución y crea una revisión. El repaso automático decide entre no repasar o incluir todo el sello. También podés elegir sello completo, sin repaso o conservar una selección parcial ajustada en Aspire. Si cambió la geometría o falta análisis, se usa el sello completo y se deja advertencia. La selección parcial sin contactos todavía se verifica en Aspire.

Las observaciones permiten guardar borradores; deben resolverse antes de sincronizar. Si un sello queda fuera por falta de material, usá **Sacar del programa y devolver a pendientes**, después guardá de nuevo. Así no se marca como fabricado junto con los demás.

Abrí Aspire y ejecutá el gadget **3.1** de la máquina → **Sincronizar y recalcular**. Conserva las correcciones del dibujo y consulta cambios incompatibles de la misma propiedad. Para un archivo anterior: **Preparar base** hace respaldo y conserva dibujos; **Vincular el diseño seleccionado** identifica cada sello antes del primer sync. Ante un problema se conserva un respaldo junto al archivo, con extensión `.bak` (para recuperación, copiar y renombrar como `.crv3d`).

De vuelta en la app, **Actualizar informe de Aspire** muestra el resultado sin pisar cambios sin guardar. **Tomar medidas y posición de Aspire** adopta esos valores para el próximo plan. Un programa queda listo después del informe recalculado sin errores y de subir su archivo de la revisión vigente; bajar el ZIP no lo aprueba. Revisá las trayectorias y guardá los TXT como hasta ahora.

El nuevo flujo requiere migración, servidor y gadgets actualizados. Los programas sin preparación conservan el flujo legado que sigue abajo. [Alcance y limitaciones](../02-modules/programas/preparacion-visual.md).

[← Volver al índice](README.md)

Un **programa** es un grupo de sellos que se fabrican juntos en una CNC, en una misma corrida de Aspire. En esta pantalla se arman los programas, se controla que entren en las planchuelas y se sigue su avance. Se llega desde **Programas** en el menú.

La primera vez que entrás aparece un recorrido guiado.

## Contenido

- [Conceptos](#conceptos)
- [La pantalla](#la-pantalla)
- [Armar un programa](#armar-un-programa)
- [La hoja del programa](#la-hoja-del-programa)
- [Llevarlo a Aspire con el gadget](#llevarlo-a-aspire-con-el-gadget)
- [Fabricar y marcar el avance](#fabricar-y-marcar-el-avance)
- [Quitar sellos, bloquear y borrar](#quitar-sellos-bloquear-y-borrar)
- [Programas terminados](#programas-terminados)
- [Vista lista](#vista-lista)
- [Archivos base de cada máquina](#archivos-base-de-cada-máquina)

## Conceptos

| Concepto | Qué es |
|---|---|
| **Máquina** | **Chica** (C), **Grande** (G) o **XL**. Cada una tiene su archivo base de Aspire y su gadget. Los abecedarios se arman aparte (máquina ABC) |
| **Planchuela** | La barra de bronce de la que salen los sellos: 12, 19, 25, 38 o 63 mm. Se elige por el **lado corto** del sello |
| **Qué planchuelas acepta cada máquina** | Chica: 12, 19, 25 y 38 mm (hasta 400 mm de largo cada una) · Grande: 12 y 38 mm (hasta 250 mm) · XL: 63 mm (hasta 250 mm) |
| **Carga** | Cuánto del largo de cada planchuela ya está ocupado. Cada sello ocupa su **lado largo + 8 mm** de corte |
| **Gadget** | El script que corre dentro de Aspire y arma el programa solo: importa los vectores, los escala, los ubica en su planchuela y aplica las trayectorias según el tipo de sello |

Qué sellos pueden entrar a un programa: solo **sellos** (no accesorios), **con vector**, en estado **Sin Hacer** o **Rehacer**, que **no estén en otro programa** y cuya planchuela acepte esa máquina.

Criterio para armar: 1) los **prioritarios**, 2) los pedidos **más viejos**, 3) **aprovechar la planchuela** completa. Se pueden mezclar tipos de sello. Lo normal es **un programa por día por máquina**.

## La pantalla

Arriba: buscador (**Buscar programas...**), **Filtros**, **Ordenar** y **Nuevo Programa**. También están los archivos base de cada máquina ([ver al final](#archivos-base-de-cada-máquina)).

La vista normal es un **tablero**:

- **Tres columnas: Chica, Grande y XL.** En cada una, los programas que todavía no terminaron, como hojas en bolsillos. Un bolsillo vacío dice **Ranura libre**.
- A la derecha, el panel **Vectores**: los sellos listos para programar que todavía no están en ningún programa. Los prioritarios se marcan en rojo; cada sello indica en qué máquinas entra y si tiene una nota del pedido. Si no hay nada, dice **No hay vectores listos**.
- Abajo del panel: la carpeta **Terminados** y la **Papelera**.

El número rojo de **Programas** en el menú cuenta los sellos listos para programar que son prioritarios o vencen en 3 días o menos.

## Armar un programa

### Arrastrando (lo más rápido)

- Arrastrá un sello del panel **Vectores** a un **bolsillo vacío** de una máquina: se crea un programa nuevo con la fecha de hoy y ese sello.
- Arrastrá más sellos **sobre el programa** para sumarlos.

Si el sello no entra en esa máquina (por su planchuela), aparece **No entra en esta máquina**.

### Con Sugerir

1. Abrí la hoja del programa (clic en la tarjeta).
2. Tocá **+** para abrir **Agregar diseños**.
3. Tocá **Sugerir**: la app agrega sellos por prioridad y antigüedad hasta llenar las planchuelas. Si no entra nada más, dice **Sin espacio**.
4. También podés buscar, filtrar por tipo o planchuela y agregar sellos uno por uno.

### Con Nuevo Programa

**Nuevo Programa** abre **Crear Nuevo Programa**: **Fecha de Producción**, máquina, **Nombre del Programa** (se genera solo), **Descripción (opcional)** y los sellos (**Agregar sellos al programa**). Muestra el **Largo estimado**. Tocá **Crear Programa**.

El nombre se arma solo con la fecha, la cantidad de sellos y la máquina, por ejemplo **17 SEP x7 C**, y se actualiza cuando agregás o sacás sellos.

🤖 Al agregar un sello a un programa, su estado de fabricación pasa a **Programado**.

## La hoja del programa

Clic en una tarjeta abre la hoja completa (formato A4, la **Hoja de producción**):

| Parte | Qué muestra |
|---|---|
| **Fecha**, **Sellos**, **Carga** | Datos generales |
| Estado | **Borrador**, **Listo para Fabricar**, **En fabricación**, **Finalizado**, o el candado si está bloqueado |
| **Aspire** | Vista previa del archivo de Aspire, si ya se subió (**Sin archivo** si no). Indica si se sincronizó con el gadget (**Sync gadget**) o subiendo el archivo (**Sync archivo**) |
| Avisos | Diferencias entre la app y lo que realmente quedó en Aspire (ver abajo) |
| **Diseños** | Los sellos del programa. **✕** para quitar uno, **!** si tiene nota del pedido, la medida al pasar el mouse |
| **Carga por planchuela** | Cuánto se usa de cada planchuela |
| **+** | Agregar diseños |
| **Descargar Aspire** / **Descargar paquete** | Ver [gadget](#llevarlo-a-aspire-con-el-gadget) |
| **Fresa** | Chequeo de fresa de todos los sellos del programa (ver abajo) |
| Candado | **Bloquear** / **Desbloquear** |

### Chequeo de fresa del programa

Antes de llevar el programa a Aspire, tocá **Fresa** en la hoja (o clic derecho en la tarjeta → **Chequear fresa**). Aparece la lista de sellos con su chip: **Fresa OK** o **Fresa: N lugares** donde se pierde el diseño (letras que se pegan u ojos que se tapan porque la fresa no baja a la profundidad mínima: 0,3 mm; 1 mm en sellos Alimento), a la medida de fabricación de cada sello. Los que no son SVG (por ejemplo EPS) no se pueden chequear.

Tocá **Ver** en un sello para abrir el detalle, corregirlo automáticamente y **Guardar el corregido en el sello** (funciona igual que en [Vectorización](04-vectorizacion.md#chequeo-de-fresa)).

⚠️ Si el sello **ya está armado en el Aspire**, el gadget no lo vuelve a importar solo al correr Actualizar: borralo del archivo de Aspire y corré Actualizar eligiendo **reimportar**, o usá **Rehacer desde cero**.

### Avisos de la hoja

| Aviso | Qué pasó | Qué hacer |
|---|---|---|
| **No entró: …** / **N sellos no entraron al Aspire** | El gadget no pudo importar ese sello (casi siempre porque el vector es EPS) | Re-vectorizarlo en SVG y volver a correr el gadget |
| **… en otra planchuela** | En Aspire quedó en una planchuela distinta de la planificada | Revisar en Aspire |
| **N sellos sacados siguen en el Aspire: correr Actualizar** | Sacaste sellos del programa en la app, pero siguen en el archivo de Aspire | Correr el gadget en modo Actualizar |

### Estados del programa

| Estado | Cuándo |
|---|---|
| **Borrador** | Recién creado, o se cambió algo después de llevarlo a Aspire |
| **Listo para Fabricar** | El gadget ya subió el archivo de Aspire (o se descargó el paquete) |
| **En fabricación** | Algún sello está **Haciendo** o **Retocar** |
| **Finalizado** | Todos los sellos están **Hecho** (o Verificar). Pasa a Terminados |

## Llevarlo a Aspire con el gadget

El gadget está instalado en la PC de cada CNC (uno por máquina).

1. En la PC de la máquina, abrí en Aspire el **archivo base** de esa máquina.
2. Corré el gadget de esa máquina (**ArmarPrograma_Chica**, **ArmarPrograma_Grande** o **ArmarPrograma_XL**). La primera vez pide la **clave de instalación** (la tiene Julián).
3. Elegí el programa de la lista (muestra los programas no terminados de esa máquina).
4. Si el archivo ya tiene sellos, elegí el modo:
   - **Actualizar** (recomendado): agrega lo que falta y **no toca** lo que ya estaba ni tus correcciones a mano.
   - **Rehacer desde cero**: borra todo lo que armó el gadget y lo vuelve a armar.
   - **Solo recalcular**: recalcula trayectorias.
5. Si faltan sellos que antes estaban, el gadget pregunta: **"Los borré a propósito (sin material)"**, **"Se perdieron, reimportar"** o **"Decidir después"**. Los que marcás como borrados a propósito vuelven a quedar pendientes en la app.
6. El gadget importa los vectores, los ubica, arma las planchuelas y recalcula trayectorias. Al final muestra un resumen (los errores arriba).

🤖 El gadget le avisa a la app qué quedó realmente en Aspire, sube el archivo y la hoja pasa a **Listo para Fabricar** con la vista previa. Si algún sello no entró, Producción recibe un aviso.

**Sin internet**: en la hoja tocá **Descargar paquete**. Baja un ZIP con los vectores y el archivo base; descomprimilo en la PC y, al correr el gadget, elegí esa carpeta. (Si el programa ya tiene archivo de Aspire subido, el botón es **Descargar Aspire** y baja ese archivo.)

⚠️ Solo se importan vectores **SVG** (o DXF). Los EPS viejos fallan: hay que re-vectorizarlos.

## Fabricar y marcar el avance

Lo que pasa fuera de la app: guardar las trayectorias, pasarlas por **pendrive** a la CNC, preparar la planchuela y correr la máquina.

En la app:

1. Cuando dejás la máquina corriendo: clic derecho sobre el programa → **Cambiar estado** → **Haciendo**. Todos los sellos pasan a **Haciendo**.
2. Cuando terminó, cortaste los sellos y los **probaste en cuero**: arrastrá el programa a la carpeta **Terminados** (o clic derecho → **Hecho**). Todos los sellos pasan a **Hecho**.
3. Si salió mal: clic derecho → **Rehacer**.

🤖 Al marcar **Hecho**: Ventas recibe el aviso "N sellos fueron terminados", se registra el bronce consumido y los sellos aparecen en la cola **Enviar foto** del Inicio.

⚠️ **Rehacer** desde el menú del programa **no pide motivo** (a diferencia de Pedidos y Producción). Si un solo sello salió mal, conviene marcar el programa como Hecho y hacer el Rehacer de ese sello desde [Pedidos](03-pedidos.md#rehacer-un-sello) o [Producción](06-produccion.md), así queda registrado el motivo.

⚠️ Un sello rehecho sigue asociado a su programa viejo y **no vuelve a aparecer en el panel Vectores**. Es un problema conocido.

## Quitar sellos, bloquear y borrar

- **Quitar un sello**: **✕** en la hoja. Elegí **Mantener el estado anterior** (vuelve al estado que tenía, normalmente Sin Hacer) o **Elegir un estado nuevo**.
- **Bloquear** (candado): impide agregar, quitar o borrar. Igual se pueden cambiar los estados de fabricación. **Desbloquear** lo vuelve a Borrador.
- **Borrar**: arrastrá el programa a la **Papelera** (o clic derecho → **Eliminar**). Pide confirmación y a qué estado devolver los sellos. No se puede borrar un programa bloqueado.
- **Cambiar la fecha**: desde la hoja (con el programa desbloqueado).

⚠️ Cambiar algo de un programa que ya estaba **Listo para Fabricar** lo vuelve a **Borrador**: hay que volver a correr el gadget en modo Actualizar.

## Programas terminados

Clic en la carpeta **Terminados** abre el fichero de programas finalizados, con buscador por nombre. **Cerrar hoja** para volver.

## Vista lista

**Ordenar** → **Vista** → **Lista** muestra los programas como tarjetas clásicas. Tiene funciones que no están en el tablero:

- **Subir el archivo de Aspire a mano** (sin gadget): la app lo lee y, si hay diferencias, abre **Diferencias con el Aspire** para decidir sello por sello (**Sacarlo del programa y devolverlo a pendientes**, **Dejarlo**, **Agregarlo al programa**, **Ignorar por ahora**).
- **Revisar los Hecho sello por sello**: **¿Algún sello salió mal?** → **Sellos a retocar o rehacer**, marcando cada uno **Hecho**, **Retocar** o **Rehacer**.
- **Ver historial** del programa.

## Archivos base de cada máquina

Arriba de la pantalla, **Máquina C**, **Máquina G** y **Máquina XL** muestran el archivo base de Aspire (**Aspire .crv3d**) y el gadget de cada una. Se reemplazan subiendo uno nuevo. Solo hay que tocarlos cuando cambia la plantilla de la máquina.

### Controles del nuevo flujo (implementación local pendiente de habilitar)

Usá el gadget **3.2** de la máquina con la nueva preparación. Si volvés a corregir o recalcular en Aspire, la app exige el archivo de ese último resultado, aunque no hayas cambiado el plan en la app. Si aparece que el resultado cambió durante la subida, volvé a sincronizar y subir desde la copia actual. Una descarga de ZIP o una subida anterior no dejan listo ese resultado nuevo. La activación del servidor y la instalación del gadget forman parte de la puesta en marcha pendiente.

**Reacomodar libres** busca lugar en otras planchuelas disponibles cuando una se llena y respeta los sellos fijados. Al cambiar de planchuela, el gadget rehace el corte con el ancho correspondiente. Al agrandar el diseño conserva su borde superior y el tamaño del taladro.

**Tomar medidas y posición de Aspire** reconoce también la planchuela real. Si la pieza quedó entre posiciones o fuera del soporte, hay que corregirla antes de adoptar. La sincronización exige comprobar los auxiliares y recalcular antes de aprobar el archivo. La primera prueba real se realiza con la máquina C y Aspire 10.5; G y XL se validarán después.

En **Plantillas por mecanizado**, cargá una trayectoria por archivo. Las principales conservan su número de etapa y sus capas automáticas. **Plantilla de repaso habitual · sello completo** recibe el perfilado exterior manual de la base; **Plantilla de repaso interior · detalle puntual** recibe el interior. Para conservar una selección de Aspire, elegí también si corresponde al perfilado habitual o a **Solo detalle interior**. No se repasan ambos lados automáticamente.

En **Alimento**, cargá las mismas principales de **3 mm** y, en **Corte perimetral**, la plantilla **Corte Forma**. La sincronización adapta las capas de las principales y selecciona el perímetro correspondiente; conserva inicio 3,5 mm y pasada 5,5 mm. El repaso precede al corte, y el planeado precede al cajeado. Si falta una trayectoria o el recálculo no produce mecanizado válido, la revisión queda pendiente con el motivo.

Las pruebas locales en Aspire 10.514 cubrieron importar dos sellos, combinar recetas, conservar una corrección interna al mover/agrandar, cambiar a Alimento y conservar un solo detalle para repaso interior. Falta habilitar el servidor con autorización y revisar programas representativos con el operario. La selección parcial automática sin contactos todavía no está disponible; el automático usa sin repaso o sello completo.

### Probar sin pedidos reales (solo versión de desarrollo)

Abrí `/dev/preparacion-programas`. Hay ocho sellos ficticios y cuatro casos: programa combinado, falta de material, un sello fuera del ancho y dos sellos demasiado juntos.

La pantalla abre en **Aspire real · archivos locales**. Para continuar una prueba descargada:

1. Usá **Restaurar armado de prueba** con el JSON del armado. Recupera el plan y su revisión; no aprueba fabricación ni adopta un informe guardado dentro del archivo.
2. Usá **Leer informe de Aspire** con el `app-report-rN.json` producido por el instrumento local. Solo acepta el programa y la revisión abiertos. Verás los dibujos, medidas y mecanizados leídos de Aspire, y sus advertencias si las hay.
3. Abrí **Preparar el programa de prueba**. El editor y el chequeo al guardar usan el dibujo corregido del informe; los datos vendidos se conservan. **Tomar medidas y posición de Aspire** sigue siendo explícito.
4. Guardá, descargá el armado nuevo, ejecutá la sincronización local en la copia C y leé su informe nuevo. Mientras tanto, la pantalla conserva el resultado anterior e indica que falta sincronizar. Leer un archivo viejo no lo presenta como resultado de la revisión nueva.

Las líneas rojas y taladros celestes que aparecen en la app se derivan del armado; la vista previa del mecanizado sigue revisándose en Aspire. Estos controles leen archivos locales en el navegador y no los suben a producción. Recargar reinicia la memoria; restaurá el armado y volvé a leer el informe para continuar.

Para usar el ensayo auxiliar de lógica, elegí **Prueba lógica sin Aspire**:

1. Tocá **Simular envío a Aspire** para ver ambos armados.
2. Tocá **Corregir detalle en Aspire simulado**. Abrí **Preparar el programa de prueba**, mové Marca A a una posición libre y **Guardá preparación**. Volvé a simular: el dibujo corregido se conserva.
3. Tocá **Agrandar sello 1 en Aspire +10 %** y cambiá también su medida en el editor. Guardá y simulá: aparecen **Resolver conflicto: usar app** y **Resolver conflicto: conservar Aspire**.
4. Cerrá el editor para comparar los armados y leer el registro. Los cortes del plan aparecen rojos y los taladros celestes. Cambiar de caso o recargar reinicia todo.

El ejemplo guarda únicamente en memoria. No abre Aspire, no calcula trayectorias ni verifica contactos de la fresa; no modifica pedidos, material ni estados reales.

**Prueba con Aspire real:** **Descargar armado para prueba real** guarda un JSON del plan que tenés guardado, con los dibujos ficticios. Si el armado tiene errores, bloquea la descarga. Ese archivo se utiliza con el instrumento local de calificación y las plantillas reales de C; no abre Aspire por sí solo ni es un botón de sincronización de producción. El ensayo del 16/10/2026 importó ocho sellos, calculó quince trayectorias y conservó una corrección al mover/agrandar desde la app. Se guardó una copia independiente y se ejecutó su vista previa de mecanizado. [Resultado y límites](../audits/programas-aspire-real-2026-10-16.md).
