# Vectric Aspire

✅ Servidor de preparación publicado el **2026-10-16**: migración aplicada por el usuario y verificada en esquema; `programa-sync` **v31 ACTIVE**, desplegada con autorización expresa. Gadget **3.2/protocolo 4** pendiente de instalación operativa. Descarga con sesión de la app o clave de instalación de Aspire; subida ligada al UUID del informe. El handler pasó un ensayo HTTP/PostgreSQL local completo y comprobaciones remotas de acceso, sin escrituras de negocio. Sigue pendiente el recorrido completo conectado con Aspire. [Evidencia, respaldo y pendientes](../audits/programas-conexion-validacion-2026-10-16.md).

✅ Prueba local del 2026-10-16: plan de ocho sellos descargado desde la app y aplicado en Aspire 10.514 mediante el instrumento `QualifyApp.lua`. Importación, quince trayectorias, segunda sincronización sin reinsertar dibujos y vista previa nativas comprobadas; informe/subida permanecen locales. No valida el transporte al servidor ni habilita producción. [Evidencia](../audits/programas-aspire-real-2026-10-16.md).

✅ El laboratorio permite restaurar el armado ficticio y leer el informe nativo con el mismo validador de contrato del servidor, verificando programa/revisión/fuente sin reescribir el plan. El SVG observado alimenta el editor y su análisis de repaso. La tercera sincronización real recalculó trece trayectorias, sin importar dibujos ni emitir `FINE_FALLBACK`: dos sellos con repaso y seis sin él. La lectura de archivos no equivale a sincronización del servidor ni a confirmación de un `.crv3d` subido.

**Antecedente protocolo 3 / gadget 3.1, reemplazado por protocolo 4 / gadget 3.2:** agregó montaje y recetas por ejecución, revisión, plantillas firmadas y SVG observado por instancia. Conserva dibujos existentes y resuelve conflictos por propiedad; no aplica reemplazos de fuente sobre correcciones locales sin decisión. El navegador descarga el paquete con su sesión autenticada; Aspire conserva clave de instalación y token por programa. Las confirmaciones incluyen `preparation_revision` y, desde protocolo 4, `preparation_event_id`. [Alcance, límites y calificación nativa](../02-modules/programas/preparacion-visual.md).

| | |
|---|---|
| Qué es | Software CAD/CAM (Vectric Aspire 10.514 según `PLAN_PROGRAMAS_FASE_3.md`) que corre en la PC de cada máquina CNC; archivos `.crv3d` (contenedor OLE2). |
| Para qué lo usa Alcohn AI | Armar el programa de mecanizado de un lote de sellos y saber qué quedó realmente en él. |
| Mecanismo | Gadgets Lua (`aspire-gadgets/`), edge `programa-sync`, paquete ZIP, parser `.crv3d` en TS (`src/lib/programas/crv3d.ts`, npm `cfb`) y Python (`scripts/crv3d_inspect.py`). |
| Autenticación | Clave de instalación (`PROGRAMA_SYNC_KEY`, guardada en el Registry de Windows) + token por programa (30 días). |
| Datos enviados a Aspire | Manifest (sellos, medidas en mm, tipo, planchuela, plantillas de trayectoria `roughing_/profile_<tipo>.ToolpathTemplate`, largo máximo), vectores SVG/DXF, `.crv3d` base. |
| Datos recibidos | Reporte (`ALCOHN_PROGRAMA_V1`): sellos presentes/importados/no importados/borrados/en otra planchuela, sobrantes, material por planchuela, segundos de mecanizado, controles; archivo `.crv3d` y preview GIF. |
| Lectura del `.crv3d` | Streams `VersionData/Version`, `VectorData/DocumentData` (parámetros del job), `VectorData/2dDataV2` (capas, con el UUID del sello en el nombre), `PreviewData/Preview2D_GIF`. |
| Qué NO hace | Subir trayectorias, mandar a la máquina, decidir agrupados. |

Detalle completo: [02-modules/programas/gadget-aspire.md](../02-modules/programas/gadget-aspire.md).

Preparación protocolo 3: el servidor inspecciona `.ToolpathTemplate` nativas v3 y envía huella de bytes, etapa/orden, selectores y destino de las operaciones manuales explícitas (repaso/perímetro). Alimento reutiliza las principales 3MM con selectores adaptados mediante `GeometrySelector`; los parámetros CAM se conservan. El gadget comprueba la carga real y recalcula individualmente, restaurando la selección manual antes de cada pasada. El informe incorpora prueba de auxiliares, versión de reglas y URL fuente asociada al SVG observado para no mostrar una geometría vieja tras reemplazar el vector. Calificación local C/Aspire 10.514: cinco sincronizaciones nativas con importación, mezcla, movimiento/escala sin reimportar, Alimento y detalle interior; informe/subida simulados sin red. Fina física 0,1/configurada 0,2 y grabado referido al planeado de 0,5 mm (Q-PROG-019/020/022).
❓ Frontera física → [FR-03, FR-04](../10-operational-boundaries/README.md).
