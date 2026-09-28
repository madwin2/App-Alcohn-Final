# Operación y SOPs (esqueletos)

Procedimientos operativos donde Alcohn AI participa. Los pasos **dentro de Alcohn AI** están verificados en el código. Los pasos físicos o de otras herramientas están marcados **`[REQUIERE INFORMACIÓN DEL EQUIPO]`** y **no deben completarse sin confirmación del equipo**. Estos documentos son la base para manuales de empleados; la fuente de verdad del comportamiento del software sigue siendo `02-modules` y `03-workflows`.

| SOP | Workflow | Estado |
|---|---|---|
| [Cargar un pedido manual](cargar-un-pedido.md) | WF-01 | Parcial (con datos del equipo) |
| [Confirmar un pago web por transferencia](confirmar-pago-web.md) | WF-02 | Parcial (con datos del equipo) |
| [Vectorizar diseños](vectorizar.md) | WF-03 | Parcial (con datos del equipo) |
| [Armar un programa y prepararlo en Aspire](armar-programa-y-aspire.md) | WF-04 | Parcial (con datos del equipo) |
| [Preparar la máquina y fabricar un sello](fabricar-un-sello.md) | WF-04 | Parcial (con datos del equipo) |
| [Control de calidad](control-de-calidad.md) | WF-04/WF-08 | Parcial (con datos del equipo) |
| [Enviar la foto y cobrar](foto-y-cobro.md) | WF-05 | Parcial (con datos del equipo) |
| [Preparar un envío (Correo Argentino)](preparar-un-envio.md) | WF-06 | Parcial (con datos del equipo) |
| [Envíos por Andreani](envio-andreani.md) | WF-07 | Parcial (con datos del equipo) |
| [Registrar un Rehacer](rehacer.md) | WF-08 | Parcial (con datos del equipo) |
| [Reponer stock](reponer-stock.md) | WF-11 | Parcial (con datos del equipo) |
| [Despliegue y mantenimiento técnico](despliegue.md) | — | Técnico |

<a id="scripts-de-mantenimiento"></a>

## Scripts de mantenimiento
| Script | Para qué | Cuidado |
|---|---|---|
| `npm run import:ventas[:dry]` → `scripts/import-ventas-csv.mjs` | Importar ventas históricas desde CSV (clientes + órdenes + sellos) | Escribe en producción; usar `--dry-run` primero |
| `npm run import:clientes-viejos[:dry]` → `scripts/import-clientes-viejos-csv.mjs` | Importar "Clientes Viejos" (export de Google Sheets) | ídem; hay variante `insecure-win` para TLS en Windows |
| `npm run update:clientes-contacto[:dry]` | Actualizar teléfono/mail de clientes desde CSV | ídem |
| `scripts/delete-import-historica.sql` | Borrar una importación histórica | Destructivo |
| `scripts/import_correo_sucursales_xlsx.py` | Cargar el padrón `correo_sucursales` desde el Excel de MiCorreo | — |
| `scripts/crv3d_inspect.py` | Inspeccionar un `.crv3d` (capas, parámetros) | Solo lectura |
| `scripts/diagnostico-comercial-web.mjs/.sql`, `sql/diagnostic_wizard_funnel.sql` | Diagnóstico del embudo web | Solo lectura |
| `scripts/generate-version.mjs` | Genera `public/version.json` (se corre en `dev` y `build`) | — |
| `services/andreani-worker/src/scripts/*` | Diagnóstico y operaciones manuales del worker Andreani (login manual, refrescar trackings, re-enriquecer PDFs) | Algunos escriben en la base |
| `services/micorreo-worker/src/scripts/*` | Subir un CSV de prueba, probar errores | Crea envíos reales en MiCorreo |
