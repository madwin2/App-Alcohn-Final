# Prueba desde la app hacia Aspire C real

Fecha: **2026-10-16**. Aspire **10.514**, máquina C. Usuario autorizó probar el recorrido real en una copia. Datos ficticios; sin consultas/escrituras a Supabase, migraciones, despliegues, TXT ni CNC. No se hizo commit.

## Recorrido comprobado

1. Desde `/dev/preparacion-programas`, **Descargar armado para prueba real** guardó el plan r1 de ocho SVG ficticios, con Clásico, 3MM y Alimento distribuidos entre cuatro planchuelas.
2. El generador de calificación leyó esa descarga y las doce plantillas nativas exportadas previamente de la copia C. No reemplazó el plan por otro armado programado en el instrumento. Las rutas ficticias de plantillas de la demo no se usan como archivos.
3. `QualifyApp.lua` abrió otra copia `App C - prueba real.crv3d` desde `Base C - prueba funcional.crv3d`, retiró únicamente los objetos conocidos de calificación y llamó a la misma función `PreparationSync.run` usada por los gadgets. Guardado y respaldos son reales; `postReport`/`upload` quedan locales.
4. Primera revisión: **8 importaciones, 8 dibujos, 4 planchuelas, 15 trayectorias válidas**. Incluye principales Clásico/3MM/Alimento, repaso y `Corte Forma` al final. Las estadísticas nativas tienen longitud de avance o penetración positiva.
5. Un instrumento de edición desplazó **0,5 mm** el detalle interno de Marca A mediante el SDK dentro de Aspire, sin cambiar la caja exterior ni actualizar su referencia de sincronización. Registró ID, SVG y huella antes/después.
6. En el editor real de la app: Marca A **p19 → p38**, inicio **Y=-180**, ancho **12 →16 mm** y largo proporcional **30 →40 mm**. Se guardó r2, ejecutando el chequeo de los ocho SVG, y se descargó nuevamente desde el botón.
7. Segunda revisión en Aspire: **0 importaciones**, los **8 IDs de dibujo se conservaron**, Marca A quedó en **X=235,351; Y=-180; 16×40 mm** y su huella normalizada coincidió con la del detalle corregido. El recálculo de las quince trayectorias y la comprobación de auxiliares fueron correctos.
8. En el panel nativo **Preestrenar trayectorias**, se ejecutó **Simular todas Trayectorias**. La simulación terminó sin aviso de error; se revisó la vista 3D y se guardó el job.

## Evidencia

En `%TEMP%/alcohn-aspire-c-qualification/`: `app-plan-r1.json`, `app-plan-r2.json`, `app-report-r1.json`, `app-report-r2.json`, `app-summary-r1.json`, `app-summary-r2.json`, `app-native-edit.json`, `app-qualification.txt`, `aspire-real-3d.png` y `App C - prueba real.crv3d`.

La base original facilitada conserva SHA256 **6C740CACEDFFA2CB5B86F25536280DA17D0C3EF8A14B924C1261B8F4202EBE0B**, igual antes y después. El gadget temporal `Alcohn Qualification/InspectBase.lua` se respaldó para el ensayo y se restauró a su diagnóstico de solo lectura al finalizar.

Los planes/informes/IDs nativos ficticios están capturados en `src/lib/programas/__fixtures__/aspire-c-app.json`. `nativeApp.test.ts` verifica ambos informes contra el contrato del servidor y la conservación de la geometría, IDs y trayectorias.

## Límites observados

- R1 no tenía análisis de repaso y R2 no tenía un informe nativo cargado en el ejemplo: se emitieron avisos `FINE_FALLBACK` y se incluyeron sellos completos como respaldo conservador. R2 confirmó una corrección de geometría real; no se trató el análisis de la fuente sin corregir como certificación de esa corrección.
- La vista previa no mostró un aviso de error, pero esto **no certifica acabado físico ni ausencia de contactos laterales**. La selección parcial automática continúa pendiente; el ensayo no la implementa ni la valida.
- El recorrido usa una descarga y un instrumento local preparados para calificación. No es aún una conexión operativa app-servidor-Aspire ni una prueba del paquete servido por producción.
- No se verificaron límites físicos con el operario ni G/XL. Permanecen los requisitos de puesta en marcha documentados en el módulo.
- El nuevo botón está solo en desarrollo; no se anuncia como funcionalidad disponible en producción en el changelog del equipo.

## Comprobaciones de código

### Retorno del informe a la app y tercera revisión

Se incorporaron lectura y restauración local en `/dev/preparacion-programas`, con modo real por defecto y observaciones de simulación independientes. La app restauró la descarga r2, leyó `app-report-r2.json` y mostró los ocho SVG/medidas reales. No se adoptó el plan automáticamente ni se aprobó fabricación. En el editor se movió Marca A de Y=-180 a **Y=-240** manteniendo 16×40 mm, se guardó r3 y se descargó.

El guardado analizó los SVG nativos: ocho huellas normalizadas coinciden con las observadas, **dos sellos necesitan repaso y seis no**. La nueva ejecución en Aspire mantuvo los ocho IDs, hizo **cero importaciones**, recalculó **trece trayectorias válidas** (una de repaso Clásico para los dos sellos), guardó el job y emitió **r3 sin observaciones**. La app leyó r3 correctamente y rechazó después r2 sin sustituir el resultado vigente. También se comprobó que ejecutar una simulación y volver al modo real conserva el informe nativo.

Esto resuelve el respaldo por falta de análisis observado en la prueba r2 para esta muestra. La decisión usa el análisis geométrico existente; no certifica acabado físico ni contactos laterales ni implementa selección parcial automática. No se repitió la vista previa volumétrica de r3: la vista previa documentada arriba corresponde a r2, y el recálculo/estadísticas comprobados aquí corresponden a r3.

Evidencia adicional en la misma carpeta temporal: `app-plan-r3.json`, `app-report-r3.json`, `app-summary-r3.json`; descarga del navegador `prueba-aspire-c-r3.json`. Captura ficticia en `aspire-c-roundtrip.json`, comprobada por `nativeApp.test.ts`. El diagnóstico temporal de Aspire volvió a restaurarse después del ensayo. No hay nuevas tablas, cambios de estados de producción ni novedades anunciadas al equipo: el retorno por archivos sigue siendo una herramienta de desarrollo.

### Comprobaciones posteriores al retorno

- `npm test`: **491 pruebas correctas, 54 archivos**; trece controles de importación local y un caso adicional sobre el recálculo nativo r3. Los informes erróneos, ajenos, duplicados, sin dibujo, viejos/futuros y archivos excesivos se rechazan o muestran pendientes según el contrato, sin aprobar la prueba.
- Lint focalizado correcto. Los bloqueos globales de lint/typecheck indicados debajo siguen siendo ajenos a esta entrega.

- `npm test`: **477 pruebas correctas, 53 archivos**, incluidos tres casos que verifican los informes capturados del ensayo real.
- Lint focalizado del editor de prueba y los nuevos tests: correcto, con la configuración temporal ya usada en la validación anterior. `git diff --check` de los archivos modificados: correcto.
- `npm run lint` continúa bloqueado por el preset global existente `@typescript-eslint/recommended`. `npm run typecheck` continúa con errores existentes fuera de los archivos de este cambio; no aparecen errores en `ProgramPreparationSandboxPage.tsx` ni `nativeApp.test.ts`. No se mezclaron arreglos ajenos.

## Reproducir el ensayo

Requiere las plantillas/copia C de la calificación anterior en la carpeta temporal y una copia conocida abierta en Aspire. Exportar desde el navegador; generar el instrumento con `node scripts/build-preparation-qualification.mjs <salida.lua> app <carpeta-plantillas> CLASICO <exportacion.json>` y ejecutarlo dentro de Aspire. Para corregir el detalle, usar `edit` como quinto argumento. Volver a generar con la segunda descarga antes de sincronizar nuevamente; conservar la sesión de ejemplo para mantener las identidades. No instalar este instrumento sobre el gadget operativo ni usarlo en un programa comercial.
