# ADR-027 · Mesa de armado reemplaza el tablero de Programas

Fecha: 2026-10-17. Estado: **integrada en `/programas`** (2026-10-17) con los datos reales; el prototipo sigue en `/dev/mesa-programas` con datos de ejemplo.

## Problema

Armar un programa pasaba por tres capas: el tablero de bolsillos (soltar sellos), la hoja del programa (+ / Sugerir) y «Preparar programa», un modal técnico con soporte, plantillas y coordenadas. Ubicar los sellos y prepararlos para Aspire eran pasos separados aunque son la misma decisión, y lo que se configura una vez por máquina se mezclaba con cada programa.

## Decisión (del usuario, 2026-10-17)

- **La mesa reemplaza al tablero.** La página de Programas pasa a ser una mesa por máquina (pestañas Chica / Grande / XL) con: la cola de sellos para programar a la izquierda, el soporte real a escala en el centro y el sello elegido más los controles a la derecha. Arrastrar un sello a una planchuela lo suma al programa **y** lo ubica.
- **G y XL usan la misma mesa** para armar y controlar, pero siguen llevándose a Aspire con el ZIP y el gadget anterior hasta calificarlas con el 3.2.
- **Se prioriza el escritorio** (Fede, en la PC del taller). En pantallas chicas la mesa se apila; en el celular es para consultar.
- **Primero un prototipo navegable**, después la conexión a los datos reales.

## Diseño

- Etapas siempre visibles: **Armado → Revisado → Aspire → Fabricar** (`mesaProgress`). Un solo botón según la etapa: Guardar y chequear, Llevar a Aspire (C) o Bajar ZIP (G/XL).
- **Controles agrupados en lenguaje del taller** (`mesaChecks`): entra en las planchuelas, separación de 8 mm, material, vectores vigentes, máquina configurada y fresa. Son las mismas reglas de `validatePreparation` que usa el servidor. Tocar un aviso elige el sello.
- **Imantado obligatorio por orden** (Q-PROG-023, confirmado 2026-10-17): los sellos quedan centrados, desde el inicio útil de la planchuela, con **exactamente 8 mm entre diseños**. Arrastrar inserta antes/después de otro sello y desplaza la fila; la vista previa ya muestra ese resultado. No permite dejar huecos ni elegir coordenadas libres. **Llenar solo** agrega al final por prioridad, vencimiento y antigüedad.
- **Tamaño y orden**: agrandar/achicar conserva la proporción y desplaza todos los siguientes; también se reacomoda al aplicar una medida desde Fresa, quitar o cambiar de planchuela. Un cambio que no entra de ancho/largo o va a una planchuela sin material se rechaza sin modificar el armado. **Subir/Bajar** intercambia vecinos y **Al final** coloca debajo del último sello. Se retiran Fijar/Soltar y Ordenar: el acomodo es automático, incluyendo sellos antes fijados. El cambio completo admite Deshacer/Rehacer.
- **Distancias vigentes**: no se agrega ajuste de espaciado, tampoco en la configuración de máquina de la mesa. El corte sigue 4 mm debajo del diseño y se reserva el acabado final de 3 mm, según las reglas compartidas. Se conserva la precisión del origen del soporte (sin redondearlo a décimas).
- **La máquina como es (2026-10-17, pedido del usuario):** vertical, como se fabrica, sobre la **fijación real**. Para C se usa el SVG «Base Fijacion sellos STK v2» (el mismo que se importa en Aspire): base 296 × 416 × 16,3 mm, regla en cm, y un canal de 19 × 7,6 mm a cada lado de cada planchuela con las **trabas móviles** que aprietan el bronce (compartido cuando dos planchuelas están a 19 mm). Las posiciones del gadget coinciden con el SVG (`src/lib/programas/fixture.ts`, verificado en tests). G y XL generan su base con la misma regla hasta tener su dibujo real.
- **Tres vistas con cámara continua** (transformaciones 3D de CSS en proyección ortográfica): **2D** lineal en blanco con los diseños rellenos (para armar y arrastrar), **3D** isométrica enteramente en líneas, incluyendo contornos y secciones de las pendientes del relieve, y **Mecanizado** con la misma superficie y cámara, pero material de bronce mate en las planchuelas. La fijación queda en líneas tenues en ambas. Rueda para acercar, arrastrar para mover la vista, botón para encuadrar. Arrastrar desde la cola vuelve a 2D.
- **Relieve compartido** (pedido del usuario, 2026-10-17): `mesaRelief` construye una superficie de profundidad a partir del SVG final (incluye trazos y pintura blanca), orientado y espejado para fabricar; respeta vectores ya preparados. Usa `primaryProfile` (punta configurada 0,6 mm, 15° por lado, 1,7/3 mm según receta) y, cuando corresponde un repaso completo, `FRESA_FINA` (0,2 mm, 30° por lado, hasta 0,6 mm). Calcula centros alcanzables y barrido de la punta, conserva el positivo y no exagera alturas. El repaso automático requiere chequeo vigente del mismo SVG, medida y receta; el parcial/interno o de Aspire no se presume completo. Cada sello informa las pasadas representadas al pasar el cursor.
- **Alcance visual**: es un relieve geométrico estimado sobre una grilla (hasta 520 celdas a lo largo), no una simulación de trayectorias CAM ni una validación de fabricación. No se agregan los 0,5 mm de planeado: la superficie de referencia ya está planeada. `mesaReliefRender` produce líneas y bronce desde la misma malla en un contexto WebGL reutilizado; la caché se invalida al cambiar SVG, medida, receta o repaso. Un fallo muestra «Sin simulación», sin sustituirlo por un dibujo plano. El motor del editor de vectores queda independiente.
- **Relieve con la secuencia real (2026-10-17, POL-089):** la superficie simulada es la más honda que deja cualquiera de las cuatro herramientas: recta de 6 mm (fondo plano donde entra su diámetro), cónicas de 1 mm y 0,6 mm a 15° y, con repaso, la de 0,2 mm a 30° hasta 0,6 mm. Para una cónica con punta plana, «centros alcanzables + barrido de la punta» es exacto; la recta se resuelve con transformada de distancia. Hay margen alrededor del recuadro porque el cajeado de Aspire llega al offset exterior del vector. **3D** dibuja el diseño (lo que queda sin tallar) en blanco sólido y solo las aristas: borde del diseño, pie de las paredes y contorno, sin grilla. **Mecanizado** muestra la misma superficie en bronce mate.
- **Operaciones del frente sobre toda la planchuela (2026-10-17):** a partir de las plantillas nativas de C y los offsets del gadget: planeado 0,5 mm; desbaste exterior de 3 mm con la recta de 6 entre el «Rectángulo exterior» y la isla del sello («Offset 1 vector» = diseño +4 −3,5, cerrado y 0,5 mm más grande); cajeado con la cónica de 15° y punta 1,1 mm dentro del «Offset exterior vector» (+1,5); perfilados; y la ranura del «Corte 6MM» (6 mm, centrada en la línea 4 mm debajo del diseño) hasta −9 mm. Después del rectángulo (3 mm debajo del último corte) la planchuela queda en bruto. El taladrado/roscado no se dibuja: está en el centro del sello y se supone del lado de atrás (Q-PROG-024).
- 🔶 Supuesto visual a confirmar: trabas dibujadas como dos bloques por canal (uno por tramo de ranura) y con 6,5 mm sobre la base. No afecta las reglas de armado.
- **Vista superior simplificada** (pedido del usuario, 2026-10-17): 2D oculta las trabas móviles. Conserva las ranuras de extremos semicirculares con trazo más fino y menor opacidad, para que queden como referencia secundaria. Desde el 2026-10-17 las trabas tampoco se dibujan en 3D/Mecanizado (pedido del usuario); siguen en el modelo de la fijación. No cambia la geometría de fabricación.
- **Idioma visual de la app**: paneles sin borde, píldoras, estado = punto + texto. Sin efectos de color ni brillos (el usuario rechazó el bronce naranja). Los mensajes van en la pantalla y no en toasts, que tapaban el botón principal.
- **Soporte y plantillas salen de la mesa** a un panel de configuración de máquina. La disponibilidad de material sigue siendo de cada corrida (se toca en el encabezado de la planchuela).
- Deshacer/Rehacer (Ctrl+Z), Supr para quitar, Esc para cancelar.

## Usabilidad (respuestas del usuario, 2026-10-17)

- **Recetas mezcladas:** un mismo programa puede llevar Clásico, 3 mm y Alimento. La cola no se separa por receta y «Llenar solo» no la usa como filtro.
- **Programas por día:** lo habitual es uno por día para la Chica y otro para la Grande; a veces hay dos el mismo día para la misma máquina. El selector de programas es un menú corto con fecha, sellos y etapa; un segundo programa del día se nombra «17 oct · 2».
- **Fabricado:** después de «Para fabricar» se marca el programa como fabricado con el mismo flujo actual: «¿Algún sello salió mal?» → No marca todo Hecho; Sí abre la revisión por sello (Hecho / Retocar / Rehacer). El programa queda en solo lectura.
- **Repaso fino:** se rotula 0,2 mm (respuesta «0,2 creo»; coincide con `FRESA_FINA`). 🔶 Confirmar contra la plantilla de repaso de la máquina.
- **Pantalla:** barra de acción fija abajo (etapas, controles resumidos, motivo del bloqueo y un único botón primario), encuadre a la zona de trabajo, rótulos de planchuela siempre legibles, cola por secciones con selección múltiple, «Llenar solo» con vista previa, teclado completo en la mesa. Detalle en `docs/audits/mesa-usabilidad-ui-2026-10-17.md`.

- **Zonas de fresa en la mesa (pedido del usuario, 2026-10-17):** botón «Fresa» (tecla Z) que muestra sobre cada sello las zonas del mismo chequeo que la ventana de la fresa (`chequearSvg`, misma medida y receta, caché compartida): rojo «hay que corregir», ámbar «se pierde el detalle», contorno gris «marca menos hondo · OK». En 2D van sobre el dibujo derecho; en 3D y Mecanizado, espejadas y acostadas igual que el relieve. Cada zona importante lleva un aro de tamaño fijo y cada sello un contador, porque las zonas suelen medir décimas de mm. Solo se analizan los sellos visibles. Es orientativo: corregir se hace en «Ver fresa».

## Integración en /programas (respuestas del usuario, 2026-10-17)

- **La mesa es la vista de entrada** de Programas. «Todos los programas» abre el tablero de siempre (ABC, terminados, papelera, bloqueo, historial, sincronizar archivo, archivos base) hasta pasarlos a la mesa. La vista elegida se recuerda en el navegador.
- **Asignación al instante**, como el tablero: sumar un sello en la mesa llama a `addStampsToProgram` y quitarlo a `removeStampFromProgram` con `restoreMode: PREVIOUS` (igual que «Preparar programa»). Deshacer hace la operación inversa. Si el servidor rechaza, la mesa vuelve a lo que tiene el programa.
- **Chica**: el armado es la preparación (`programa_preparacion`); «Guardar y chequear» chequea la fresa y guarda una revisión (`guardar_programa_preparacion`). Al abrir un programa sin preparación se muestra el soporte de la última preparación de la máquina sin copiar nada; al guardar por primera vez se usa `inheritMachineSetup`, que copia las plantillas. «Llevar a Aspire» baja el paquete actual (`downloadPackage`) y la mesa relee la preparación hasta ver la revisión sincronizada. El archivo vale para la revisión si se subió después de guardarla.
- **Grande y XL**: la mesa guarda solo qué sellos van (respuesta del usuario). El orden en pantalla no se guarda y se reacomoda al recargar; Aspire los ubica con el gadget anterior. La fresa se chequea en memoria («Chequear la fresa») antes de «Bajar ZIP». Aspire queda hecho cuando el gadget sincronizó y el programa no cambió después.
- **Fabricado**: si todo salió bien, `setFabricationStateForProgram(HECHO)`; si no, `setStampFabricationStates` por sello. Un programa con todos sus sellos en Hecho / Verificar / Retocar / Rehacer se muestra como fabricado y queda en la mesa dos días; después se ve en «Todos».
- **Cada programa sigue en su flujo** (hallado al revisar con datos reales, 2026-10-17): una Chica que ya fue a Aspire con el gadget anterior (sin preparación, con sync, archivo o ZIP) se trata como G/XL. La mesa no le ofrece guardar una preparación, porque la pasaría al gadget 3.2 y vencería lo hecho en Aspire. Con el gadget anterior no aplican los controles de soporte y plantillas, y un programa ya sincronizado no vuelve a pedir el chequeo de fresa.
- Los avisos repetidos por sello («falta verificar las plantillas de CLASICO») se agrupan en una línea con la cantidad y la acción «Configurar».
- **Solo lectura** si el programa está bloqueado o en fabricación, igual que «Preparar programa».
- Reconciliación con realtime y otras PCs: `reconcileMesa` suma al final lo asignado afuera y quita lo que se sacó, sin pisar las operaciones en curso (probado en `mesa.test.ts`).

## Alternativas descartadas

- Mantener el tablero y abrir la mesa al tocar un programa: el usuario eligió reemplazarlo.
- Planchuelas sueltas, verticales, sin fijación (primer prototipo): pantalla vacía, sellos diminutos y textos ilegibles.
- Planchuelas acostadas como barras de bronce con brillo naranja (segundo prototipo): rechazado porque la fabricación es vertical y por los efectos llamativos.
- Arrastre nativo HTML5 desde la cola: no funciona en táctil y no se puede verificar con eventos sintéticos; se usan eventos de puntero.
- Imantar únicamente para evitar solapamientos: permitía espacios arbitrarios y no reacomodaba al cambiar medidas. El orden automático prioriza distancias uniformes; no admite fijar una coordenada como excepción.

## Pendiente

Conectar a los datos reales (programas, sellos elegibles, `programa_preparacion`, plantillas por máquina), reemplazar la ruta `/programas`, mover allí terminados, papelera y bloqueo. Manual y changelog describen el alcance de prototipo; actualizar ese alcance al publicarlo.

Código: `src/lib/programas/mesa.ts` (lógica y tests), `src/components/programas/Mesa/`, `src/app/dev/ProgramasMesaSandboxPage.tsx`.
