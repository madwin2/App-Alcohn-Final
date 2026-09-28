# Vectric Aspire

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
❓ Frontera física → [FR-03, FR-04](../10-operational-boundaries/README.md).
