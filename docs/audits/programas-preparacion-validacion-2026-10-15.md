# Validación local de la preparación de programas

Fecha: 2026-10-15. Sin consultas/escrituras a Supabase en vivo, migraciones aplicadas ni despliegues. Los datos de interfaz son ficticios.

## Comprobado

- `npm test`: **474 pruebas, 52 archivos, todas pasan**. Incluye soporte/material/pertenencia/separación transversal, operaciones derivadas, contratos, adopción de planchuela real, conservación de la elección del repaso, fuente vigente, comparación de dos pasadas con punta fina configurada 0,2, nombres reales/selectores de plantillas, cobertura previa al paquete, seis comprobaciones sobre informes capturados de Aspire y ocho casos del simulador aislado.
- Compilación con `npx vite build`: correcta; conserva la advertencia existente sobre tamaño de bundles.
- `deno check --no-lock --node-modules-dir=none supabase/functions/programa-sync/index.ts`: correcto.
- `aspire-gadgets/preparation/test_sync.py`: **26 pruebas Lua 5.1** con SDK simulado, incluido recorrido repetido, cambio de planchuela/corte, tamaño sin escalar taladro, bloqueo ante geometría/auxiliar incorrectos, fallo de CAM, plantilla alterada y deduplicación. Cubre retorno falso de carga con trayectorias reales, retorno verdadero sin carga, estadísticas vacías, selección manual inmediatamente antes de recalcular, repaso interior, adaptación de capas de Alimento, orden independiente del orden de subida, recuperación de trayectoria borrada e identidad duplicada. Compilan los tres gadgets.
- `scripts/test-preparation-migration.mjs`: PostgreSQL local en memoria (PGlite), sin credenciales. Aplica la migración y verifica CAS (incluido null), permisos, pertenencia, revisiones viejas, errores, confirmación de archivo, nuevo informe en el mismo plan, cambio de fuente, comienzo de fabricación y bloqueo. Incluye un trigger que reproduce el `dirty` legado por fila y una cascada de dos sellos.
- Interfaz en `/dev/preparacion-programas`: cambio proporcional 30×12 → 40×16 mm, cambio por selector, guardado de revisión, apertura de comparación Clásico/Alimento con 0,4/0,5 mm y arrastre a otra planchuela. Se revisaron disposición de escritorio y compacta.
- Lint de todos los archivos nuevos TS/TSX usando una configuración temporal con el nombre correcto del preset: sin errores ni advertencias. No se cambió la configuración global del repositorio.

**Simulación interactiva posterior:** `/dev/preparacion-programas` compara plan/resultados en memoria con ocho SVG ficticios, cuatro casos, cortes/taladros derivados y registro de pasos. Prueba visible en el navegador: envío inicial, corrección del detalle de Marca A, traslado p19 → p38 a Y=-180, guardado/segundo envío sin conflicto, aumento de medida en Aspire y app, conflicto de tamaño y resolución usando la app. El caso de ancho inválido detuvo el envío sin crear un armado. Ocho pruebas automáticas cubren también la decisión de conservar Aspire entre envíos, pieza ausente y eliminación del plan sin perder la referencia visual previa. No se ejecutan SDK/CAM, no se verifican contactos, no se aprueba fabricación ni se escribe en producción. Lint focalizado sin errores y ningún error de tipos en los archivos de la simulación; persisten los bloqueos globales indicados debajo.

## Checks globales pendientes por problemas existentes

- `npm run typecheck` falla en archivos existentes de Pedidos, Producción, calendarios, mocks y servicios; incluye los errores previos de `ArrayBuffer` y `ASPIRE_DESCARGADO` en `programs.service.ts`. No se detectan errores nuevos de tipos en el editor, contratos, comparación ni paquete.
- `npm run lint` no inicia: `.eslintrc.cjs` referencia `@typescript-eslint/recommended` como config, donde corresponde el preset `plugin:@typescript-eslint/recommended`. Se registró la limitación; no se mezcló su corrección global con esta implementación.

## Calificación nativa local

Se abrió una copia de la base C en **Aspire 10.514**, se exportaron **12 plantillas nativas** y se contrastaron selectores/diámetros/operaciones con el usuario (Q-PROG-019–022). Las dos de perfilado fino y Corte Forma tienen selección manual. El original facilitado conserva tamaño **36.480.000 bytes** y fecha de modificación inicial. No se ejecutó CNC ni se generaron TXT.

Instrumentos locales: `InspectBase.lua` exporta sin modificar el job; `build-preparation-qualification.mjs` genera una prueba geométrica limitada a una copia cuyo nombre empieza por `Base C - prueba funcional`. No suben datos ni ejecutan CNC. Archivos de salida en carpeta temporal `alcohn-aspire-c-qualification`; original facilitado sin modificaciones.

**Prueba geométrica nativa completada:** movimiento de p25 a p38 y escala 12×30 →18×45 mm conservan ID del dibujo; corte de destino 46 mm y taladro de 6 mm comprobados. Offsets y rectángulos generados se verifican contra el plan. Guardado, marcador y respaldo local comprobados en la copia. Se corrigieron lectura de `RawId` y lectura de parámetros del job con dos argumentos, diferencias reales frente al mock. Esta prueba no recalculó CAM ni certifica el repaso.

**CAM nativo:** Clásico y 3MM con ocho trayectorias válidas cada uno; Alimento con nueve, incluido Corte Forma. Se comprobó orden taladrado/roscado, planeado/cajeado y fino/corte aunque la lista de entrada esté desordenada. Aspire 10.514 devuelve `false` al cargar plantillas que efectivamente agrega: se exige incremento real de cantidad, recálculo y estadísticas válidas con movimiento. El recálculo general alteraba la selección manual del fino y llegó a tomar la línea de corte; se corrigió con selección explícita antes de cada recálculo individual. El inicio de la trayectoria fina quedó dentro de la pieza seleccionada. No se considera suficiente un texto general de recálculo.

**Recorrido completo `QualifyFlow.lua`: cinco sincronizaciones por la función de producción `PreparationSync.run`**, con dos dibujos ficticios importados mediante `ImportSVG`, agrupado real y archivo guardado:

1. Importar y combinar Clásico/3MM.
2. Desplazar un detalle interno en Aspire y mover el sello a otra planchuela desde el plan; conserva ID del dibujo y no reimporta.
3. Escalar proporcionalmente conservando la corrección, con taladro de diámetro constante y auxiliares comprobados.
4. Cambiar a Alimento, adaptar los selectores 3MM y recalcular perímetro después del fino.
5. Conservar un único detalle en la operación interior, sin asignar automáticamente todos los ojos a esa pasada.

Las cinco revisiones guardaron marcador y respaldo, emitieron informe recalculado con comprobación de auxiliares y completaron la subida **simulada localmente**. Los informes reales se conservaron sin datos comerciales en `src/lib/programas/__fixtures__/aspire-c-flow.json`; el validador del servidor los acepta sin observaciones. Hubo dos importaciones en total, sin reimportación por movimiento/escala. La corrección aparece en el SVG observado antes y después de la escala.

## Pendiente de validación operativa

No se probó el recorrido contra Supabase en producción ni se aplicó la migración/despliegue. Hay que revisar programas representativos con Fede, verificar márgenes físicos del soporte y calificar G/XL después. La certificación automática de selección parcial sin contactos y la simulación volumétrica acumulada no están implementadas; el automático respalda con sello completo. Las muestras prueban importación, sincronización, CAM y guardado nativos, sin certificar acabado físico.

Ver [puesta en marcha](../02-modules/programas/preparacion-visual.md#puesta-en-marcha-y-validación-pendiente) y [ADR-026](../13-decisions/ADR-026-preparacion-programas-por-revision.md).
