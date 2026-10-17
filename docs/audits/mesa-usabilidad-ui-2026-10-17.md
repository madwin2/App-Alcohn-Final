# Mesa de armado — análisis de usabilidad y UI (2026-10-17)

Alcance: prototipo `/dev/mesa-programas` (`MesaArmado`, `MesaQueue`, `FixtureScene`, `MesaInspector`, `MesaChecklist`, `MachineSetupSheet`). Recorrido en el navegador a 1600×900 y 800×600, más lectura del código. Usuario objetivo: Fede, en la PC del taller (ADR-027).

Leyenda de prioridad: **P0** rompe o esconde la tarea principal · **P1** fricción diaria · **P2** pulido / profesionalización.

---

## 1. La tarea, en una línea

Elegir qué sellos van hoy → ubicarlos en las planchuelas de la máquina → corregir lo que la app marque → guardar y chequear → llevar a Aspire → confirmar que volvió.

Cada decisión de abajo se mide contra eso: **cuántos clics, cuánto hay que leer y cuánto hay que recordar** para llegar de la cola a «Para fabricar».

---

## 2. Problemas verificados (P0)

| # | Problema | Dónde | Por qué importa |
|---|----------|-------|-----------------|
| 1 | **El botón principal desaparece al elegir un sello.** El inspector es largo, el panel derecho scrollea y «Guardar y chequear» + los controles quedan debajo del pliegue. | `MesaArmado.tsx:226-254` | Justo cuando se está trabajando, la acción siguiente y el estado de los controles no se ven. Obliga a deseleccionar o scrollear para guardar. |
| 2 | **Rótulos de planchuelas superpuestos.** «25 mm» y «12 mm» (y sus «libres») se pisan cuando las planchuelas están juntas; en 3D flotan y se cruzan con los sellos. | `FixtureScene.tsx:333-347` | Es el dato con el que se decide dónde va cada sello y es ilegible. |
| 3 | **La mesa ocupa poco lugar útil.** El encuadre inicial muestra la base entera (296×416 mm); un sello de 12×30 mm queda en ~25 px. La regla central y la base se llevan la mitad del lienzo. | `FixtureScene.tsx:180` (`fit`) | Para ver el diseño hay que hacer zoom cada vez. En 3D/Mecanizado los relieves —el trabajo más caro de la pantalla— se ven como manchas. |
| 4 | **Dos botones primarios blancos compitiendo**: «Llenar solo» (cola) y «Guardar y chequear» (derecha). | `MesaQueue.tsx:332`, `MesaArmado.tsx:250` | El ojo va a «Llenar solo», que es una acción masiva que cambia todo el programa. Lo primario debe ser el siguiente paso del flujo. |
| 5 | **No hay indicador de «cambios sin guardar»** salvo que el CTA vuelva a decir «Guardar». | `MesaArmado.tsx:95` | Con el CTA fuera de vista (#1), no hay ninguna señal de que la revisión guardada ya no es la que se ve. |

---

## 3. Arquitectura de la pantalla (propuesta)

Hoy: cabecera con máquina, programas y etapas → tres columnas (cola · mesa · detalle + controles + CTA).
El problema de fondo es que **el estado del programa y su próxima acción están repartidos** en tres lugares: etapas arriba a la derecha, controles y CTA abajo a la derecha, porcentaje cargado arriba de la mesa.

Propuesta:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [C · G · XL]   Programa ▾ 17 oct · 3 sellos · sin guardar        ⚙ máquina │  barra superior
├──────────────┬─────────────────────────────────────────┬───────────────────┤
│ COLA         │  ┌ lienzo ─────────────────────────────┐ │ DETALLE           │
│ buscar       │  │ [2D|3D|Mec]  − 100 % +  ⤢  ⌖ sel.  │ │ (sello elegido o  │
│ ▸ Urgentes 4 │  │                                     │ │  resumen del      │
│ ▸ Esta semana│  │      planchuelas (encuadre útil)    │ │  programa)        │
│ ▸ Resto      │  │                                     │ │  ··· scroll ···   │
│              │  └─────────────────────────────────────┘ │                   │
│ [Llenar solo]│  25 mm 338 libres · 12 mm … (leyenda)   │                   │
├──────────────┴─────────────────────────────────────────┴───────────────────┤
│ ● Armado ─ ○ Revisado ─ En Aspire ─ Para fabricar │ 2 avisos ▸ │ [Guardar y chequear] │  barra de acción fija
└────────────────────────────────────────────────────────────────────────────┘
```

Claves:

1. **Barra de acción fija abajo** (resuelve #1 y #5): etapas + resumen de controles («todo ok» / «2 avisos ▸» que abre la lista) + el único botón primario. Siempre visible, en el mismo lugar, para cada etapa.
2. **Columna derecha = solo detalle.** Sin sello elegido muestra el resumen del programa (sellos por receta, por planchuela, avisos) en vez de «Tocá un sello de la mesa». La lista «Antes de Aspire» pasa a ser un popover/expansión de la barra inferior.
3. **Controles del lienzo dentro del lienzo** (flotantes arriba a la izquierda), con zoom visible en %, «encuadrar todo» y «encuadrar selección». Fuera del lienzo solo queda la leyenda de planchuelas.
4. **Selector de programa como menú** (`17 oct · 3 sellos · Revisado`) en lugar de píldoras sueltas con un número sin rótulo («17 oct 3» hoy no dice que 3 son sellos).
5. **Quitar la franja de prototipo** cuando pase a `/programas` (ya previsto) y unificar el nombre de la máquina: hoy conviven «Chica / Grande / XL» y «máquina C».

---

## 4. Cola «Para programar» (P1)

| Hoy | Mejora |
|-----|--------|
| Filtro Todos / Urgentes (hay que elegir). | **Secciones** fijas: *Urgentes* (prioritario o vence ≤ 3 días), *Esta semana*, *Resto*. Se ven todas a la vez y el orden ya cuenta la prioridad. |
| El «+» aparece solo con hover. | Siempre visible en un tono bajo; además **doble clic** suma y **Enter** suma el enfocado. |
| Un sello por vez. | **Selección múltiple** (Ctrl/Shift + clic, checkboxes en hover) → «Sumar 5 a la mesa» / arrastrar el grupo. Es la forma natural de «armar el de hoy». |
| «1 sello no entra en esta máquina» sin acción. | Hacerlo un enlace: muestra cuál, por qué (ancho > planchuela más ancha) y en qué máquina sí entra («Ver en G»). |
| Miniatura de 44 px, receta y medida en texto gris. | Chip de receta con color/forma consistente con el inspector (Clásico / 3 mm / Alimento) y medida en tabular. Al pasar el mouse, vista previa grande. |
| No se sabe dónde entraría. | Al hacer hover/arrastrar, **resaltar en la mesa las planchuelas donde entra** (y opacar las que no). Hoy se descubre recién al soltar. |
| «Llenar solo» primario y arriba de todo. | Botón secundario al pie de la cola, con **vista previa** antes de aplicar («Sumaría 7: 4 urgentes, 3 de esta semana · Aplicar»). Hoy aplica directo y se apoya en Ctrl+Z. |

❓ Para definir el agrupamiento falta saber si **conviene armar un programa con una sola receta** o si mezclar Clásico / 3 mm / Alimento en la misma corrida es normal (ver §10).

---

## 5. Lienzo de la mesa (P0–P1)

**Encuadre y lectura**
- Encuadre inicial **a la zona de planchuelas** (ancho de las barras + margen, alto hasta el último sello + reserva), no a la base completa. «Encuadrar todo» sigue disponible.
- **Encuadrar selección** (tecla `F`): al elegir un sello en la cola de avisos o en la lista, la cámara va a él. En 3D/Mecanizado es la única forma razonable de ver el relieve.
- Zoom visible en % con − / + y doble clic para acercar; hoy la rueda es la única vía y no hay indicación del nivel.
- Rótulos de planchuela con **anti-colisión**: si dos quedan a menos de N px, alternar altura o mostrar solo el nominal y pasar «libres» a la leyenda inferior. En 3D, rótulos en pantalla (proyectados), no en el plano inclinado.

**Interacción**
- Mover sellos solo funciona en 2D. En 3D/Mecanizado, al intentar arrastrar, mostrar un aviso breve («Para mover, volvé a 2D — tecla 1») en vez de no hacer nada.
- **Teclado** para el sello elegido: `↑/↓` subir/bajar en la planchuela, `←/→` cambiar de planchuela, `Supr` quitar, `Esc` deseleccionar, `Tab` recorre los sellos. Hoy los sellos no son enfocables (son `div` con `onPointerDown`).
- Clic derecho → menú contextual con lo del inspector (receta, al final, fresa, quitar).
- El fantasma al arrastrar ya muestra válido/ inválido; sumar el **motivo** cuando es inválido («no entra: 32 mm de ancho») al lado del cursor, que hoy solo muestra nombre y medida.

**Señales visuales**
- El punto ámbar de «revisar fresa» (7 px) es poco visible a la escala inicial; escalarlo con el zoom inverso (como los rótulos) y repetirlo en el resumen.
- Un sello elegido debería resaltar también su **fila en la cola de avisos** y su posición en la leyenda (número de orden 1 de N).
- Planchuela sin material: hoy baja a 30 % de opacidad y el rótulo dice «sin material». Agregar un rayado para que se lea como «no disponible» y no como «apagada».

**Texto de ayuda inferior**
- La línea «arrastrá para cambiar el orden… · Supr quita · tocá «libres»…» es una pared de atajos que nadie lee. Reemplazar por **ayuda contextual** (una sola frase según lo que pasa: arrastrando, sello elegido, vista 3D) y un botón `?` con la hoja de atajos.
- «Tocá «libres» para marcar sin material» es una función escondida en un rótulo. Llevarla a la leyenda de planchuelas como interruptor explícito.

---

## 6. Inspector del sello (P1)

| Hoy | Mejora |
|-----|--------|
| Vista previa de 176 px que abre la fresa al clic, más un botón «Fresa» abajo: dos caminos a lo mismo, uno escondido. | Dejar la vista previa con un botón visible «Ver fresa» encima, y el estado de la fresa al lado (punto + resultado). |
| «planchuela» con opciones deshabilitadas sin motivo visible (solo `title`). | Mostrar el motivo debajo al pasar o en el propio botón («19 · no entra»). |
| «repaso fino 0,1». | ⚠️ La simulación y lo que confirmó el usuario usan **0,2 mm a 30°**. Revisar el rótulo contra la plantilla real antes de pasar a producción. |
| Orden: Subir / Bajar / Al final. | Mantener, más los atajos de teclado (§5). |
| «Quitar» sin confirmación. | Está bien (hay deshacer), pero el aviso debería traer **«Deshacer»** como acción, no solo mencionar Ctrl+Z. |
| Largo de fabricación con − / +. | Mostrar la consecuencia en vivo: «los 3 de abajo bajan 2 mm» y si deja de entrar, el aviso en rojo antes de aplicar. |
| Sin sello elegido: «Tocá un sello de la mesa». | Resumen del programa (ver §3.2). |

---

## 7. Controles y etapas (P1)

- **Controles «Antes de Aspire»**: cuando todo está ok, colapsar en una línea («6 de 6 controles ok»). Con avisos, mostrar solo los que fallan, cada uno con su acción («Ir al sello», «Abrir fresa», «Configurar máquina»).
- Hoy el grupo con error se abre solo, pero los ítems son texto rojo/ámbar de 12 px. Darles el mismo formato que la lista de avisos de la cola: nombre del sello + problema + acción.
- **Etapas**: además de los cuatro puntos, decir **qué falta** para avanzar al lado del botón («Falta: chequear 3 sellos»). `progress.blocking` ya calcula ese texto; hoy aparece abajo en gris.
- «En Aspire»: mientras la app espera al gadget, mostrar un estado vivo («Esperando a Aspire… · abrí el gadget 3.2») con tiempo transcurrido y opción «Ya lo corrí, revisar de nuevo». Hoy solo aparece un aviso de 5 s.
- G y XL (Aspire viejo): el aviso en gris al pie es fácil de pasar por alto. Ponerlo en la barra de acción junto al botón «Bajar ZIP para Aspire».

---

## 8. Configuración de máquina (P2)

El `MachineSetupSheet` usa otro lenguaje visual (bordes, `text-xs`, checkboxes nativos) que el resto de la mesa. Llevarlo a los mismos `Panel` / píldoras / puntos de estado. Además:
- Mostrar una **mini vista** de la fijación que se actualice al editar Centro X / Ancho útil / Final Y, en vez de tres números sueltos por planchuela.
- Al editar un valor, avisar que la verificación se pierde **antes** de que pase (hoy se destilda sola).

---

## 9. Legibilidad, accesibilidad y robustez (P1–P2)

- **Tamaños**: mucho texto a 11–12 px en `zinc-500` sobre casi negro (contraste ≈ 4:1; las etapas futuras en `zinc-600` no llegan a 3:1). En una PC de taller, a distancia de brazo, subir el piso a 13 px y `zinc-400` para información que hay que leer.
- **Escala de la mesa**: los rótulos ya se escalan con el zoom (`fontPx`), bien; aplicar lo mismo a los indicadores de aviso y al contorno del sello elegido.
- **Foco y teclado**: las píldoras tienen foco nativo pero sin anillo visible; los sellos de la mesa no son enfocables; el arrastre desde la cola no tiene alternativa de teclado (el «+» la cubre si se hace visible).
- **Rendimiento**: en 3D/Mecanizado cada sello calcula su relieve con WebGL. Con una mesa llena (40–60 sellos) conviene calcular solo los visibles y mostrar progreso («Simulando 12 de 40»).
- **Persistencia**: el historial de deshacer y el borrador se pierden al recargar. Para producción: guardar el borrador local por programa y avisar al salir con cambios sin guardar.
- **Pantallas angostas**: a 800 px los controles de la mesa se cortan y «Imantado · 8 mm» se pisa con el inspector. Aunque la prioridad es escritorio, definir un ancho mínimo y pasar los controles del lienzo a un menú.

---

## 10. Preguntas abiertas (no se inventa el proceso)

Antes de cerrar algunas propuestas falta información del negocio:

1. **Mezcla de recetas**: ¿un programa puede llevar Clásico, 3 mm y Alimento juntos o se arma por receta? Define si la cola se agrupa por receta y si «Llenar solo» debe respetarla.
2. **Programas por día y máquina**: ¿Fede arma uno por máquina por día o varios? Define si el selector de programas es un menú simple o una lista con historial.
3. **Después de «Para fabricar»**: ¿qué sigue en la pantalla (hoja de fabricación, marcar como fabricado, imprimir)? Hoy la mesa termina en un aviso verde.
4. **Repaso fino**: ¿el rótulo correcto es 0,1 o 0,2 mm? (§6)
5. **PC del taller**: resolución y distancia de uso, para fijar el tamaño mínimo de texto.
6. Q-PROG-024 (taladrado y espesor) sigue abierta y afecta lo que muestra Mecanizado.

---

### Respuestas (2026-10-17)

1. Sí, un programa puede mezclar recetas → la cola se agrupa por urgencia, no por receta.
2. Por lo general uno por día para la Chica y uno para la Grande; a veces dos para la misma máquina → selector como menú corto.
3. Se marca como fabricado con el modal actual (¿salió todo bien? → revisión por sello).
4. 0,2 mm, confirmado.
5. No condiciona el diseño.
6. Q-PROG-024 respondida: taladrado por atrás; planchuela de 10 mm con 0,5 de planeado y corte de 9 (quedan unidos 0,5 mm).

## 11. Orden de trabajo sugerido

| Paso | Contenido | Prioridad | Esfuerzo |
|------|-----------|-----------|----------|
| 1 | Barra de acción fija (etapas + controles resumidos + único primario + «sin guardar») | P0 | M |
| 2 | Encuadre a la zona de planchuelas, encuadrar selección, zoom visible | P0 | S |
| 3 | Rótulos con anti-colisión y leyenda de planchuelas (libres + sin material) | P0 | S |
| 4 | «Llenar solo» secundario con vista previa | P0 | S |
| 5 | Cola por secciones, «+» visible, selección múltiple, planchuelas válidas al arrastrar | P1 | M |
| 6 | Teclado en la mesa, menú contextual, motivo en el fantasma | P1 | M |
| 7 | Inspector: resumen sin selección, motivos visibles, «Deshacer» en el aviso | P1 | S |
| 8 | Estado vivo de «En Aspire» y aviso de G/XL en la barra | P1 | S |
| 9 | Tipografía/contraste, foco visible | P1 | S |
| 10 | Configuración de máquina con el mismo lenguaje y mini vista | P2 | M |
| 11 | Relieve solo de lo visible, borrador local | P2 | M |

Los pasos 1–4 son los que más cambian el día a día y se pueden hacer sobre el prototipo actual sin tocar la lógica de `mesa.ts`.

## 12. Implementado (2026-10-17)

Todos los pasos 1–11 sobre el prototipo `/dev/mesa-programas`:

- **Barra de acción fija** (`MesaActionBar`): etapas Armado → Revisado → En Aspire → Para fabricar → **Fabricado**, resumen de controles con lista desplegable («Ir al sello»), motivo del bloqueo, «sin guardar» y un único botón primario. Espera viva de Aspire con tiempo y «Mandar de nuevo». **Marcar fabricado** usa el flujo actual: «¿Algún sello salió mal?» → revisión por sello (Hecho / Retocar / Rehacer); el programa queda en solo lectura.
- **Lienzo**: encuadre inicial a la zona de trabajo (de ~100 % a ~240 % en C), encuadrar sellos / sello elegido / base entera, zoom visible con − / +, doble clic para acercar. Rótulos de planchuela sin superposición y siempre de frente en 3D. Al arrastrar o señalar un sello en la cola se resaltan las planchuelas donde entra y se apagan las otras; junto al cursor se ve «Planchuela 25 · lugar 2 de 4» o el motivo del rechazo. Planchuela sin material rayada. Marcas de selección y aviso de tamaño constante con el zoom.
- **Teclado**: 1/2/3 vistas, 0 encuadrar, F ir al sello, + / −, ↑ ↓ orden, ← → planchuela vecina donde entre (`moveToNeighbor`), Tab recorre los sellos, Supr, Esc, Ctrl+Z / Ctrl+Mayús+Z, Ctrl+S guardar. Hoja de atajos con «?». Menú de clic derecho con las mismas acciones.
- **Cola**: secciones Urgentes / Esta semana / Más adelante (`queueSection`), «+» siempre visible, doble clic o Enter suma, selección múltiple (Ctrl/Mayús + clic) con «Sumar a la mesa», vista previa grande con la nota del pedido, los que no entran con motivo y «Ver en Grande». **Llenar solo** pasa a secundario y muestra la vista previa en la mesa antes de aplicar.
- **Detalle**: sin sello elegido, resumen del programa (recetas, planchuelas con libres e interruptor de material, lista de sellos para ir a cada uno). Con sello: ver fresa visible, motivo en planchuelas deshabilitadas, ± deshabilitados con motivo si no entra, consecuencia del cambio de largo, «Repaso fino 0,2». Avisos con **Deshacer**.
- **Programas**: menú con fecha, sellos y etapa; el segundo del día se llama «17 oct · 2».
- **Máquina**: hoja con el mismo lenguaje visual, vista de la fijación y aviso de que editar quita la verificación.
- **Robustez**: el relieve 3D se calcula solo para los sellos visibles, con progreso («Simulando relieve · 4 de 17»); borrador del prototipo en el navegador; aviso al salir con cambios sin guardar; texto mínimo 12–13 px en `zinc-400` y foco visible en todos los controles.

Verificado en el navegador a 1600×900: llenar con vista previa, flechas con motivo de rechazo, menú contextual, 3D/Mecanizado con relieve progresivo, guardar (Ctrl+S), controles, Aspire simulado, fabricado con revisión, segundo programa del día, Grande. `npm test`: 58 archivos, 548 pruebas.

## 13. Zonas de fresa sobre la mesa (2026-10-17)

- Interruptor «Fresa» en el lienzo (tecla Z, se recuerda en el navegador). Disponible en 2D, 3D y Mecanizado.
- `useStampZones` corre el mismo `chequearSvg` que la ventana de la fresa y ubica las zonas: en 2D sobre la imagen del SVG (`imageBox`), en 3D/Mecanizado con la transformación del lienzo del relieve (espejo, giro y estiramiento a la caja de lo negro).
- Las zonas reales miden décimas de mm (2–3 px a 400 %): se agregan un aro de tamaño fijo por zona alta/media y un contador por sello; leyenda con progreso y cantidad de sellos para corregir.
- Verificado en el navegador: en el ejemplo, 4 sellos con zonas «hay que corregir»; en Mecanizado las zonas de «PS» caen en los rincones entre los bloques de la S, igual que en 2D.
