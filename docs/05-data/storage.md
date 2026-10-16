# Storage (buckets de Supabase)

**Preparación visual, migración aplicada por el usuario y verificada el 2026-10-16**: bucket privado `programas-plantillas`, máximo 5 MB por `.ToolpathTemplate`. Objetos inmutables bajo `<programa>/<receta>/<uuid>-<nombre>`; lectura/inserción autenticadas, sin reemplazo anónimo. La edge nueva, desplegada como v31 con autorización el mismo día, valida la pertenencia de la ruta y firma descargas por una hora. Los archivos anteriores de Aspire de programas preparados se conservan para recuperación. Ver [preparación visual](../02-modules/programas/preparacion-visual.md).

| Bucket | Público | Qué contiene | Escribe | Path típico |
|---|---|---|---|---|
| `base` | sí | Archivo base del cliente, base mejorada y **snapshots de rehacer** (`rehacer-snapshots/{evento_id}/…`) | Pedidos, Vectorización, Rehacer | `generateFilePath(orden, 'base', archivo, sello)` · snapshots: `rehacer-snapshots/{evento_id}/base*.{ext}` |
| `vector` | sí | Vectores (SVG/EPS/PDF/AI), previews PNG de EPS y **snapshots de rehacer** | Pedidos, Producción, Vectorización, vector-worker, Rehacer | ídem `'vector'` · snapshots: `rehacer-snapshots/{evento_id}/vector.{ext}` |
| `foto` | sí | Fotos de sellos terminados, fotos pendientes (`pendientes/`), originales/optimizados/mockups de la app | Pedidos, Mockups | ídem `'foto'` |
| `programas-zip` | sí | Paquetes ZIP de programas | Programas | `<programa>/<slug>-<ts>.zip` |
| `programas-aspire` | sí | `.crv3d` subidos (gadget o manual) | Programas, edge `programa-sync` | `<programa>/<ts>-<nombre>` |
| `programas-preview` | sí | GIF 2D extraído del `.crv3d` | Programas, edge | `<programa>/<ts>-preview.gif` |
| `programas-base` | sí | `.crv3d` base y gadgets `.lua` por máquina | Programas | `<máquina>/programa-base.crv3d`, `<máquina>/ArmarPrograma_*.lua` |
| `programas-trayectorias` | no | (previsto) archivos de trayectorias | — | — |
| `etiquetas-andreani` | no | PDFs de etiquetas Andreani | andreani-worker, Envíos | — |
| `comprobantes` | no | Comprobantes de transferencia de pedidos web | Tienda web | — |
| `logos-web` | no | Logos subidos en el generador web | Tienda web | — |
| `mockups-web` | no | Mockups generados en la web | Tienda web | — |
| `adjuntos` | sí | Adjuntos de Innovación | Innovación | — |

## Políticas a tener en cuenta

✅ Para programas con preparación/protocolo 4, Aspire usa `<programa>/r<revision>/<evento>/<uuid>-<nombre>` dentro de `programas-aspire`. La subida firmada no habilita reemplazo y la confirmación comprueba ruta, evento, existencia y tamaño real del objeto, además de revisión/informe. Las miniaturas preparadas también usan rutas únicas por revisión/evento; una confirmación fallida no borra la miniatura vigente. Se conservan versiones anteriores. Las rutas legadas permanecen disponibles solo para programas sin preparación; no se cambiaron políticas del bucket. [Detalle](../audits/programas-conexion-validacion-2026-10-16.md).

- `base`, `foto`, `vector`: política `ALL` para rol `public` (cualquiera con la anon key puede subir/borrar).
- `programas-aspire`, `programas-preview`: INSERT/UPDATE para `anon`.
- Ver [audits/seguridad.md](../audits/seguridad.md).

## Referencias guardadas en la base

Las columnas guardan **URL pública completa** (p. ej. `sellos.archivo_base`, `archivo_vector_preview`, `foto_sello`), salvo casos legados con path relativo (el trigger de foto y `webhook-bot` contemplan ambos). Utilidades: `src/lib/utils/storageUrlUtils.ts`, `storageFileKind.ts`, `vectorUrlFromPreview.ts`.
