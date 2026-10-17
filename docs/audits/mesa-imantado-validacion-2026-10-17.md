# Mesa de armado: separación exacta

Fecha: 2026-10-17. Alcance: `/dev/mesa-programas`, datos de ejemplo en memoria. Regla confirmada por el usuario en Q-PROG-023; decisión ADR-027.

## Resultado verificado

✅ `mesa.test.ts`: 17 casos cubren crecimiento/reducción con desplazamiento de los siguientes, antiguos fijados, inserción en medio, movimiento hacia arriba/abajo, filas de distintos largos, traslado con cierre del origen, quitar, Subir/Bajar, Al final, falta de ancho/material/largo, fin de corte/acabado, fila llena reordenable en C/G/XL, precisión del origen, modificación de geometría desde Fresa e invalidación de su chequeo. Se comprueban 8 mm exactos y cortes a 4 mm por debajo del diseño (4 mm por encima del siguiente).

✅ Navegador, escritorio 1600 × 1000: Estudio Luna 12×30 → 16×40 desplaza Taller Río 10 mm; reducir a 10×25 lo sube 15 mm. Al final pone Luna inmediatamente debajo de Río. Arrastrarlo arriba restaura el orden y el espaciado; Bajar, Deshacer y Rehacer restauran las filas completas. Un largo de 100 mm se rechaza por ancho y conserva la medida y las posiciones anteriores. El inspector muestra posición en la fila y los controles disponibles; desaparecen Fijar/Soltar y Ordenar. No se guardó ni sincronizó a producción.

## Comprobaciones

- `npm test`: **57 archivos, 531 pruebas aprobadas**.
- `npm run typecheck`: **103 errores fuera de los archivos modificados en esta tarea**; ninguno en mesa, sus componentes, página o changelog. Incluye problemas de mocks, Pedidos, calendarios y tipos de buffers, ya registrados en la [validación anterior](programas-preparacion-validacion-2026-10-15.md).
- `npm run lint`: no inicia por la referencia global `@typescript-eslint/recommended` en `.eslintrc.cjs`; limitación preexistente documentada en la validación anterior.
- ESLint focalizado en los ocho archivos TS/TSX modificados, con configuración temporal y el preset `plugin:@typescript-eslint/recommended`: **sin errores ni advertencias**. No se cambió la configuración del repositorio.
- `git diff --check`: sin errores de espacios.

## Límites y seguimiento separado

- No modifica gadgets, parámetros CAM, estados de producción, DB ni integraciones. La validación del corte es geométrica; no es una prueba física de CNC.
- La mesa prioriza escritorio. En el visor compacto de 876 × 824 se observó superposición de paneles al apilarse la grilla; queda registrado para un ajuste responsive separado. Esta tarea no cambia la estructura responsive de paneles.
