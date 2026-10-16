# Conexión de preparación: archivo asociado al resultado de Aspire

Fecha: **2026-10-16**. Ensayo inicial local sin cambios remotos; posteriormente el usuario aplicó la migración y autorizó expresamente desplegar `programa-sync`. Ambos pasos están comprobados como se detalla debajo. Sin commit. Complementa la [prueba nativa C](programas-aspire-real-2026-10-16.md), realizada anteriormente sobre datos ficticios.

## Problema reproducido y corrección

✅ Una revisión del plan puede tener varios resultados de Aspire: por ejemplo, el operario corrige vectores y vuelve a sincronizar sin guardar una nueva revisión en la app. La confirmación anterior comprobaba la revisión, pero aceptaba el archivo del resultado anterior. Una prueba sobre PostgreSQL en memoria reprodujo esa aceptación antes de modificar la función.

✅ El informe y la subida del gadget **3.2 / protocolo 4** comparten ahora un identificador de evento. `pedir_upload`, `confirmar_upload` y la subida binaria exigen el evento vigente, además de la revisión y el informe válido. La ruta preparada contiene programa, revisión, evento y un nombre único; la URL firmada no habilita reemplazo. Antes de confirmar se comprueban la pertenencia de la ruta, la existencia del objeto y su tamaño real.

✅ La función SQL de confirmación recibe el evento y lo verifica bajo el mismo bloqueo del programa que protege las revisiones. Si entra un nuevo resultado entre la validación HTTP y la confirmación SQL, la confirmación falla. Se elimina la firma anterior de cinco argumentos para que no quede disponible un camino sin ese control.

✅ Las revisiones conservan los eventos ya procesados. Un reintento de un informe anterior no reemplaza el resultado más nuevo ni invalida su archivo. Los archivos y miniaturas de programas preparados se conservan; una confirmación que falla no borra la miniatura vigente. Los programas sin preparación conservan el transporte legado; enviar metadatos de preparación para uno de ellos se rechaza, sin degradar silenciosamente la petición.

## Evidencia local

- `npm test`: **511 pruebas correctas en 55 archivos**.
- `aspire-gadgets/preparation/test_sync.py`: **28 pruebas correctas con Lua 5.1**. Incluye ejecución del transporte extraído de los tres gadgets generados, con y sin preparación, y coincidencia entre evento del informe y evento de subida. Los tres gadgets compilan.
- `scripts/test-preparation-migration.mjs`: migración y funciones reales sobre PostgreSQL en memoria; pasan revisión esperada, permisos, contenido, inicio, evento vigente, reintentos y rechazo del archivo atrasado. Comprueba también que no exista la firma SQL antigua.
- `scripts/test-preparation-endpoint.mjs`: servidor HTTP en loopback con el código real de `programa-sync`, la migración real y PostgreSQL en memoria. Descarga el paquete, sus ocho SVG ficticios y doce plantillas nativas C; registra informes, solicita/sube/confirma archivos, comprueba reintentos, actualización de revisión y compatibilidad legada.
- La prueba HTTP introduce un resultado nuevo entre la comprobación inicial y la confirmación SQL: recibe el rechazo esperado `RESULT_NOT_CURRENT` y conserva la miniatura vigente. También rechaza rutas/eventos anteriores, archivos ausentes, tokens inválidos y peticiones preparadas sin resultado vigente.
- La extracción CFB de la miniatura usa la copia ficticia nativa `App C - prueba real.crv3d`; no es una miniatura inventada por el test.
- `deno check` del endpoint y lint focalizado de los archivos nuevos: correctos. `packageZip.ts` pasa lint focalizado exceptuando la regla `no-control-regex` ya incumplida por su sanitizador existente.
- `npm run build`: correcto. `npm run typecheck` sigue fallando por errores existentes fuera de los archivos de esta entrega; `npm run lint` continúa bloqueado por el preset global existente `@typescript-eslint/recommended`.

Para repetir las integraciones, usar una instalación local de `@electric-sql/pglite` y la carpeta de calificación C con las doce plantillas y la copia ficticia nativa:

```powershell
node scripts/test-preparation-migration.mjs <ruta-a-pglite/dist/index.js>
node scripts/test-preparation-endpoint.mjs <ruta-a-pglite/dist/index.js> <carpeta-de-calificacion-C>
```

🔶 En la prueba HTTP, autenticación y Storage de Supabase están sustituidos por adaptadores locales. Se ejecutan el handler, validaciones, extracción CFB y funciones SQL reales; no se prueba la infraestructura desplegada ni la red del taller. No se volvió a ejecutar Aspire ni se generaron TXT ni órdenes CNC en esta etapa.

## Activación y comprobación remota

✅ La consulta inicial de esquema devolvió **404 para `programa_preparacion`**. Después, el usuario informó que ejecutó `migration_programas_preparacion_v2.sql`. Se verificó mediante una transacción **READ ONLY**: existen ambas tablas, RLS activo, columna de eventos procesados, RPC de guardado/registro, confirmación de seis argumentos con `RESULT_NOT_CURRENT`, firma antigua retirada, trigger de inicio activo y bucket privado de 5 MB. El agente no ejecutó la migración ni modificó filas comerciales.

Estado de la entrega coordinada:

1. **Completado por el usuario:** aplicar `migration_programas_preparacion_v2.sql`. Crea las tablas de preparación e historial, sus permisos/RLS, RPC de guardado/resultado/archivo y protección del inicio; crea el bucket privado de plantillas y sus políticas. No realiza un backfill de programas ni cambia medidas comerciales. Las funciones tendrán efectos al usarse posteriormente.
2. **Completado por el agente con autorización expresa «Sí, desplegar programa-sync»:** desplegar `supabase/functions/programa-sync/index.ts` y sus seis módulos compartidos. Versión remota **31**, `ACTIVE`, con `verify_jwt=false` como la versión anterior; autenticación propia por instalación/sesión/token conservada. Descarga posterior de los siete archivos remotos: contenido idéntico a los archivos probados, normalizando finales de línea. La versión previa **30**, sin preparación, quedó respaldada localmente antes del despliegue.
3. Instalar/publicar **gadget 3.2**, empezando por **C**. Los paquetes preparados de protocolo 4 rechazan versiones anteriores; actualizar la app y el gadget como parte de la misma entrega. La entrada 61 del changelog debe publicarse con esa entrega coordinada, no antes.
4. Calificar el recorrido desplegado sobre un programa de prueba: configurar/verificar soporte y plantillas C, guardar el plan desde la app, sincronizar en Aspire, comprobar informe/archivo y repetir tras una corrección. Mantener los controles operativos habituales antes de fabricar.

✅ Verificación HTTP remota sin mutaciones de negocio: OPTIONS responde 200 e incluye el encabezado del evento; lectura sin autorización devuelve 401; JSON incompleto e informe sin identidad devuelven 400; solicitar subida con programa/token ficticios devuelve 401 antes de cualquier escritura. Se repitieron `deno check` y el ensayo HTTP/PostgreSQL local antes de desplegar, ambos correctos. No se cambió ninguna otra función, secreto, programa, pedido o archivo remoto de Aspire.

Respaldo previo: `%TEMP%/alcohn-programa-sync-before-preparation-20261016/supabase/functions/programa-sync/index.ts`. Fuente remota comprobada después: `%TEMP%/alcohn-programa-sync-deployed-preparation-20261016/supabase/functions/`. Si se necesita volver al servicio anterior, publicar únicamente el respaldo de `programa-sync` con su misma configuración de acceso; no borrar tablas/historial como parte de esa recuperación. Un nuevo despliegue requiere la autorización correspondiente. Esto deshabilitaría el contrato nuevo de preparación y debe coordinarse con app/gadgets.

🔶 El servidor nuevo está publicado; no se ha completado todavía un recorrido remoto app → Aspire → archivo/informe sobre un programa de prueba. Continúan pendientes instalar el gadget operativo C 3.2, la certificación de selección parcial y contactos laterales, la validación física y con programas representativos del operario, la calificación G/XL y la revisión posterior de UI/UX. Ver [puesta en marcha del módulo](../02-modules/programas/preparacion-visual.md#puesta-en-marcha-y-validación-pendiente).

## Descartar preparación y gadget instalado (2026-10-16, tarde)

✅ El usuario aplicó `migration_programas_preparacion_descartar.sql`. Verificación por consultas de catálogo de solo lectura: existe `descartar_programa_preparacion(uuid, integer)`, `SECURITY DEFINER` con `search_path=public`, ejecutable por `authenticated` y no por `anon`; `guardar_programa_preparacion` es la versión nueva (arranca desde la última revisión del historial) con los mismos permisos. En producción hay **0 filas** en `programa_preparacion` y en `programa_preparacion_revisiones`: ningún programa real usa todavía la preparación.

✅ En esta PC, `Vectric Files/Gadgets/Aspire V10.5/APP Automatico v3/ArmarPrograma_Chica.lua` es el gadget **3.2.0**, idéntico al del repositorio (ignorando finales de línea). Convive con `auto/ArmarPrograma_*.lua` **2.1.6** (flujo legado). G/XL 3.2 no están instalados.

🔶 Pendiente: recorrido remoto completo app → `programa-sync` v31 → Aspire → informe/archivo sobre un programa de prueba. Requiere escrituras en producción (programa y sellos de prueba, plantillas en `programas-plantillas`) y autorización expresa.

