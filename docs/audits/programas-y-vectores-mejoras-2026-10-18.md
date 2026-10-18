# Programas y editor de vectores — análisis, mejoras y propuestas (2026-10-18)

Alcance: la mesa de `/programas` con datos reales (programa «15 OCT x15 C», 15 sellos, logos pesados) y el editor del chequeo de fresa. Complementa [mesa-usabilidad-ui-2026-10-17](mesa-usabilidad-ui-2026-10-17.md).

## 1. Hallazgos con datos reales y lo que se corrigió

| # | Hallazgo | Causa | Corrección |
|---|----------|-------|------------|
| 1 | Al abrir, el lienzo se veía al 350 % con dos planchuelas cortadas. | La mesa se encuadraba mientras el programa todavía cargaba (sin sellos); al llegar los sellos la zona de trabajo crecía y nadie re-encuadraba. Además, el zoom era relativo al tamaño del lienzo: si la ventana cambiaba, el dibujo quedaba agrandado. | Re-encuadre automático cuando la zona de trabajo cambia o el lienzo cambia de tamaño, **solo si no se movió la cámara a mano**; si se movió, se conserva la escala que se ve. Ahora abre al ~108 % con todo adentro. |
| 2 | La pestaña se cerraba (Out of Memory). | El aplanado de curvas usaba la medida declarada del SVG (≈11× más fino de lo necesario) y la mesa analizaba todos los sellos a la vez. | Aplanado a 4 µm de la medida real; paso del repaso 0,10 mm. 15 sellos reales con zonas y Mecanizado: ~100 MB estables. |
| 3 | La nota del pedido («hacerlo más grueso», etc.) solo se veía en la cola: al pasar a la mesa desaparecía. | El detalle del sello no la recibía. | Nota en el detalle del sello y un ícono en la lista del programa. |
| 4 | En la lista del programa no se distinguía qué sello era urgente. | — | Marca «vence hoy / venció ayer / prioritario» en rojo. |

## 2. Editor de vectores: funciones nuevas

- **Redondear vértices** (como las esquinas de Illustrator, `editCorners.ts`): corta los dos tramos vecinos —rectos o curvos— donde el arco los toca y los une con un arco circular (error < 0,1 %). Tres formas:
  - editando nodos, un **círculo azul** dentro del vértice elegido: arrastrarlo redondea en vivo y muestra el radio en mm;
  - «Redondear vértice» con el radio elegido (0,05 a 1 mm; si no entra, el máximo posible);
  - con una pieza elegida, **«Redondear internos (N)»**: todas las puntas blancas donde la fresa no entra (se marcan en naranja al pasar por el botón).
- **Copiar, cortar, pegar y duplicar** (Ctrl+C/X/V/D; Ctrl+Shift+V en el mismo lugar): lo pegado queda elegido y corrido 0,5 mm para verlo. Se puede **pegar en el editor de otro sello**: se reescala a su medida en mm (sirve para traer una letra de otro diseño).
- **Girar** 90° a cada lado o a un ángulo libre, y **espejar** horizontal y vertical.
- **Unir** piezas que se pisan en una sola (Ctrl+G), con los agujeros que correspondan. Solo se juntan las que de verdad se tocan; las sueltas quedan intactas (no se les rehacen las curvas).

Pruebas: `editCorners.test.ts` (arco exacto, radio máximo, vértices internos de una L y de un ojo con punta, copiar/pegar con otra escala, giros y espejos, unión).

## 2 bis. Repasos sobre lo hecho (tres pasadas)

1. **Unir** rehacía las curvas de todas las piezas elegidas aunque no se tocaran → ahora agrupa por contacto real y deja intactas las sueltas. Ángulos con decimales («90,0°») → enteros cuando corresponde.
2. **Ojos en forma de hoja de dos nodos** (dos curvas, muy común en vectores trazados) no se detectaban como vértices internos ni se podían redondear → ahora sí (prueba con la forma de la captura). **Pegar varias veces** dejaba las copias apiladas → cada pegada se corre un poco más.
3. **Pegar en otro sello** ubicaba la pieza donde estaba en el dibujo original (podía quedar fuera de la vista) → ahora va al centro de lo que se ve, a su medida en mm. Verificado con el programa real: la nota «Material 24mm, 20mm exacto» de 4708 ahora aparece en el detalle; la mesa abre encuadrada con los 15 sellos.

## 2 ter. Pedido del usuario: menos ruido y simulación fiel (2026-10-18)

- **Sin recuadro** alrededor de cada sello en la vista 2D de la mesa (cargaba la vista). Se conserva el contorno al elegir, arrastrar o si hay un error.
- **Zonas de fresa**: ya no se dibuja lo que saca la 0,2 (manchas verde agua por todos lados, también en espacios vacíos: eran pasos angostos entre letras donde la 0,2 talla un poco más, correctos pero inútiles de ver). Solo queda lo que **ni con la 0,2** sale (rojo/ámbar, con el número) y una etiqueta **«sin 0,2»** en los sellos donde la 0,6 alcanza. Lo mismo en la ventana de la fresa: sin manchas, con el veredicto y la nota por lugar.
- **Automático vs. completo en la simulación**: «Automático» sin chequeo vigente dibujaba solo la 0,6 (se veía mal), pero el gadget en ese caso repasa **el sello completo**. Ahora la simulación hace lo mismo que el gadget: completo y automático sin chequear → repaso en todo el sello; automático chequeado → repaso solo en las piezas elegidas (y la 0,6 en el resto); automático chequeado sin necesidad → sin repaso.

## 3. Propuestas para Programas (valor en el día a día)

Ordenadas por impacto. Ninguna inventa reglas de negocio: donde hace falta una definición, está marcada.

1. **Estado de fresa en la cola, antes de armar.** Un punto por sello (ok / con repaso / para corregir) usando el chequeo ya hecho en vectorización. Permite corregir vectores antes de que el sello esté en la mesa, en vez de descubrirlo al guardar. ❓ Falta saber si el chequeo de vectorización queda guardado por sello o hay que recalcularlo.
2. **Hoja de producción desde la mesa.** Hoy está en el tablero («Todos los programas»). En la mesa: botón «Hoja» con la misma hoja. Es lo que se imprime para el taller.
3. **Borrador del armado protegido.** Si se cierra el navegador antes de «Guardar y chequear», hoy se pierde el orden de la Chica. Guardar el borrador local por programa y ofrecer recuperarlo.
4. **Aviso de programas atrasados.** Al entrar: «Ayer quedó 15 OCT C sin fabricar» con acceso directo.
5. **Tiempo de máquina.** El gadget ya devuelve los segundos de mecanizado de Aspire: mostrarlos en la barra («≈ 2 h 10 min») para planificar el día.
6. **Buscar en la mesa** (Ctrl+F): ir a un sello por nombre en programas largos.
7. **Vista de lo fabricado por día** en la mesa (historial corto): qué salió, qué se rehízo; hoy hay que ir al tablero.
8. **Sugerencia de planchuela por ancho.** Cuando un sello entra en dos planchuelas, sugerir la que deja menos desperdicio. ❓ Definir el criterio (ahorro de material o de cambios de planchuela).

## 4. Propuestas para el editor de vectores (vectorizar)

1. **Restar / intersectar** (resto del Pathfinder): sacar una forma de otra (por ejemplo, abrir un ojo tapado dibujando un círculo y restándolo).
2. **Dibujar formas básicas** (rectángulo, círculo, línea con grosor): para reponer un punto de la «i», un marco o un subrayado.
3. **Corregir solo lo marcado**: botón en cada lugar del chequeo («Separar estas letras», «Abrir este ojo») en lugar de la corrección general.
4. **Medir**: tocar dos puntos y ver la distancia en mm (útil para comprobar el 0,3 mm entre letras).
5. **Grosor mínimo en vivo**: pintar en el dibujo los trazos negros de menos de 0,4 mm (se rompen en el bronce).
6. **Texto a curvas con una tipografía**: escribir un texto corto (teléfono, fecha) y que quede en curvas, para agregar sin pasar por Illustrator. ❓ Definir qué tipografías.
7. **Pegar desde Illustrator**: leer el portapapeles del sistema cuando trae SVG.
8. **Comparar antes / después** con un deslizador sobre el dibujo (hoy está como pestañas en el chequeo).
9. **Atajo para «ir al siguiente lugar»** (tecla N) y resolverlos en orden.

## 5. Pendiente de verificar

- Repaso por piezas en Aspire (gadget 3.2): sin probar en la máquina.
- Las funciones nuevas del editor se probaron en el entorno de prueba (`/dev/chequeo-fresa`) y con pruebas automáticas; falta usarlas en un vector real del taller.
