# Mesa: relieve lineal y bronce — 2026-10-17

Alcance: prototipo `/dev/mesa-programas`, datos de ejemplo. Sin escrituras en producción ni cambios de trayectorias CNC.

- ✅ `npm test`: 58 archivos, 538 pruebas aprobadas. Siete nuevas pruebas cubren pendientes de 15°/30°, profundidad por receta, huecos inaccesibles, conservación del positivo, repaso, invalidación del chequeo y proyección de altura.
- ✅ Navegador local: ambas vistas cargan los tres relieves de ejemplo sin errores de consola. Acercar permite ver contornos y pendientes; Mecanizado conserva la geometría con bronce. Cambiar a Clásico, seleccionar repaso completo y agrandar regeneran el relieve; Deshacer restaura las tres operaciones.
- ✅ ESLint de los archivos modificados: aprobado con configuración temporal que corrige solo la resolución del preset. No se modificó la configuración del proyecto.
- ⚠️ `npm run typecheck`: persisten 103 errores previos en el repositorio; ninguno en los archivos de este cambio.
- ⚠️ `npm run lint`: no inicia por el preset inexistente `@typescript-eslint/recommended` de `.eslintrc.cjs`.

La superficie es una estimación geométrica discretizada según los perfiles configurados. No representa las trayectorias reales de Aspire, el repaso parcial ni una certificación de acceso de la herramienta. Ver [ADR-027](../13-decisions/ADR-027-mesa-de-armado.md).

## Ampliación: secuencia real de herramientas (2026-10-17)

- ✅ `machiningSequence`: desbaste recto 6 mm, cajeado cónico 1 mm 15°, perfilado 0,6 mm 15° y fino 0,2 mm 30° (POL-089). Pruebas: fondo plano del desbaste donde entra y nada en un canal de 4 mm; ranura de 0,8 mm donde no entra la punta de 1 mm pero sí la de 0,6; la secuencia nunca queda menos honda que una herramienta sola; el diseño nunca se toca.
- ✅ Vista 3D lineal: diseño en blanco sólido y solo aristas (sin grilla ni curvas intermedias), verificado con prueba y en el navegador.
- ✅ `npm test`: 58 archivos, 542 pruebas. Sin errores de tipos en los archivos de la mesa ni en la consola.
- 🔶 «Cónica de 1 mm» interpretada como punta plana de 1 mm de diámetro; confirmar con la herramienta real. Sigue siendo una estimación geométrica, no las trayectorias de Aspire.

## Ampliación: frente completo de la planchuela (2026-10-17)

- ✅ Leídas las 12 plantillas nativas de C: capas seleccionadas, profundidades y herramientas (el cajeado es Grabado 15° con punta 1,1 mm, no 1 mm).
- ✅ `stampIsland`, `faceDepth` y `barSegments` (14 pruebas del relieve): isla cerrada +0,5 mm, offset exterior +2 mm, desbaste a 3 mm afuera, cajeado a la profundidad de la receta adentro, ranuras de corte de 6 mm a −9 y resto en bruto.
- ✅ Navegador: planchuela con sellos rebajada, islas en relieve, fondo del cajeado y escalón del corte; la planchuela sin sellos queda en bruto. `npm test`: 58 archivos, 545 pruebas.
- ❓ Q-PROG-024: lado del taladrado/roscado y espesor real de la planchuela frente al corte a −9 mm.

## Corrección visual del 3D (2026-10-17)

- ⚠️ (reemplazado) Aristas de pliegue en la vista lineal (giro de la normal > 28°, una línea por arista): pie de letras y de la isla, borde del cajeado y rincones; se quitó el contorno del recuadro de la malla, que dibujaba un rectángulo flotante sobre la planchuela rebajada.
- ✅ El margen de la isla ya no sale de la planchuela (el primer sello arranca en la punta y su isla flotaba fuera).
- ✅ Mecanizado sin costuras: una cara plana se pinta del mismo color en la malla y en las cajas de la planchuela (bruto/planeado, rebaje de 3 mm, fondo del corte).

## Lineal limpia (2026-10-17)

- ✅ Se reemplazaron los pliegues (generaban puntos y rayitas por la discretización) por curvas de nivel en las alturas que son aristas reales: borde del diseño, pie de sus paredes, borde y pie de la isla. Se descartan trazos de menos de 1 mm.
- ✅ Una sola línea por arista: la planchuela se dibuja como sólido escalonado (`BarSolid`); la tapa de cada tramo dibuja su contorno, los laterales solo la arista de abajo y puntas/escalones solo sus aristas verticales. Los laterales de la fijación ya no dibujan contorno propio.
- ✅ Mismo trazo (0,17 mm) y tono en las líneas del relieve y de las cajas. 545 pruebas.
