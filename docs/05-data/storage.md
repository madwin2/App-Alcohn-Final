# Storage (buckets de Supabase)

| Bucket | Público | Qué contiene | Escribe | Path típico |
|---|---|---|---|---|
| `base` | sí | Archivo base del cliente y base mejorada | Pedidos, Vectorización | `generateFilePath(orden, 'base', archivo, sello)` |
| `vector` | sí | Vectores (SVG/EPS/PDF/AI) y previews PNG de EPS | Pedidos, Producción, Vectorización, vector-worker | ídem `'vector'` |
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

- `base`, `foto`, `vector`: política `ALL` para rol `public` (cualquiera con la anon key puede subir/borrar).
- `programas-aspire`, `programas-preview`: INSERT/UPDATE para `anon`.
- Ver [audits/seguridad.md](../audits/seguridad.md).

## Referencias guardadas en la base

Las columnas guardan **URL pública completa** (p. ej. `sellos.archivo_base`, `archivo_vector_preview`, `foto_sello`), salvo casos legados con path relativo (el trigger de foto y `webhook-bot` contemplan ambos). Utilidades: `src/lib/utils/storageUrlUtils.ts`, `storageFileKind.ts`, `vectorUrlFromPreview.ts`.
