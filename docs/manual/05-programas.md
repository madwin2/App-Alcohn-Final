# 5. Programas

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
| Candado | **Bloquear** / **Desbloquear** |

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
