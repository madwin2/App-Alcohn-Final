# Plan — Pestaña "Vectorización" (Vectorizer.AI)

> Documento de implementación para Cursor. Reactiva `/vectorizacion` y construye el flujo
> completo de vectorización sobre la API de **Vectorizer.AI**, reemplazando el script
> Python de escritorio (`vectorizer ai/VectoV_gui copy.py`).
>
> Leer entero antes de escribir código. Respetar `ARCHITECTURE_GUARDRAILS.md`
> (archivos < 250 líneas, 1 responsabilidad, tipado estricto, lógica fuera del JSX).

---

## 0. Resumen ejecutivo

Tres funciones en una sola pestaña, apoyadas sobre **un único pipeline compartido**:

| # | Función | Fuente | Destino |
|---|---------|--------|---------|
| 1 | **Vectorizar pedidos** — botón que toma los archivos base de los sellos pendientes y carga el SVG resultante como vector del sello | `sellos.archivo_base` | `sellos.archivo_vector_preview` + `estado_vectorizacion = 'VECTORIZADO'` |
| 2 | **Lote libre** — arrastrar/pegar N imágenes de la PC, recortarlas, montarlas en hojas y vectorizar | archivos locales | ZIP descargable (1 SVG por imagen) |
| 3 | **Asignar SVG** — arrastrar SVGs ya hechos y asignarlos a sellos por nombre | archivos `.svg` locales | `sellos.archivo_vector_preview` |

El ahorro de créditos viene del **montaje**: varias imágenes recortadas se empaquetan en una
sola hoja que se manda en **1 llamada = 1 crédito**, y el SVG resultante se **parte** de vuelta
en un SVG por imagen. Esto aplica a las funciones 1 y 2 por igual.

### Decisiones tomadas (y por qué)

1. **No se toca el `vector-worker` de Python** (potrace/upscayl). Queda como está, apagado.
   El flujo nuevo es *síncrono* desde el navegador contra un endpoint propio: más simple, da
   resultado inmediato y es lo que el caso de uso necesita (el usuario aprieta un botón y mira).
   El worker se puede migrar después (ver §13).
2. **La API key de Vectorizer.AI NUNCA va al navegador.** Va en un endpoint serverless
   (`api/vectorize.js`) + proxy de dev en Vite, igual que `andreani-*` y `micorreo-upload`.
3. **El montaje y el split se hacen en el navegador** (Canvas + DOMParser). Ahí ya hay sesión
   Supabase autenticada, que es lo único que puede bajar los `archivo_base` privados de los
   pedidos web (`logos-web`) usando `resolveBaseFileStorageRef`.
4. **Solo entran sellos sin vector.** Filtro duro: `estado_fabricacion = 'Sin Hacer'`
   **y** `estado_vectorizacion != 'VECTORIZADO'` **y** `archivo_vector_preview IS NULL`
   **y** `archivo_base IS NOT NULL` **y** `item_type = 'SELLO'`.

---

## 1. Qué existe hoy (no reinventar)

| Pieza | Ruta | Uso en este plan |
|---|---|---|
| Ítem del sidebar, deshabilitado | `src/components/pedidos/Sidebar/Sidebar.tsx:41` | poner `disabled: false` |
| Ruta inexistente | `src/App.tsx` | agregar `/vectorizacion` |
| Script de referencia (parámetros de la API) | `vectorizer ai/VectoV_gui copy.py:104-124` | de ahí sale el preset base |
| Subida de archivos | `src/lib/supabase/services/storage.service.ts` (`uploadFile`, `generateFilePath`) | reutilizar tal cual |
| Guardado en el sello | `production.service.ts:335-350` — el vector vive en `archivo_vector_preview`; para SVG, la misma URL sirve de vector y de preview | reutilizar el mismo contrato |
| Resolución de archivos base privados | `src/lib/utils/storageUrlUtils.ts` → `resolveBaseFileStorageRef`, `downloadPrivateStorageBlob` | **obligatorio** para pedidos web |
| Medición de SVG y medida de fabricación | `src/lib/utils/svgBoundingBox.ts`, `src/lib/programas/fabricationSize.ts`, `FabricationSizeDialogHost` (ya montado global) | reutilizar al asignar SVG a un sello |
| Estados | `estado_vectorizacion ∈ BASE / EN_PROCESO / VECTORIZADO / DESCARGADO / ERROR` (`migration_vector_worker_jobs.sql`) | no hace falta migración nueva |
| Dropzone drag+paste de referencia | `src/app/mockups/MockupSlotCard.tsx:498` | copiar el patrón |
| ZIP | `jszip` ya instalado, ver `src/lib/programas/packageZip.ts` | reutilizar |
| Tabs | `src/components/ui/tabs.tsx` (Radix) | usar para las 3 sub-pestañas |
| Drag & drop | `@dnd-kit/core` ya instalado | usar en la pestaña de asignación |

**No hace falta migración de base de datos.** Todas las columnas existen.

---

## 2. Seguridad — hacer esto ANTES de escribir código

La carpeta `vectorizer ai/` está **sin trackear pero sin ignorar**: un `git add .` la commitea.
`VectoV_gui copy.py:107-109` tiene en texto plano el header `Authorization: Basic …` de
Vectorizer.AI y la API key de Photoroom.

1. Agregar a `.gitignore`:
   ```gitignore
   # Programa viejo de escritorio (contiene credenciales en texto plano)
   vectorizer ai/
   ```
2. Decodificar el header Basic (`base64 -d`) para recuperar `API_ID:API_SECRET`, ponerlos en
   `.env.local` y en Vercel. **Rotar el par en el panel de Vectorizer.AI** — estuvo en el
   working tree sin protección.
3. Nunca usar prefijo `VITE_` para estas variables (`VITE_*` se bundlea al cliente).

### Variables nuevas

`.env.local.example` (agregar):

```bash
# Vectorizer.AI — SOLO servidor, nunca VITE_
VECTORIZER_API_ID=xxxxxxxxxxxxxxx
VECTORIZER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# 'production' = 1 crédito. 'test' = gratis con marca de agua (para probar presets).
VECTORIZER_DEFAULT_MODE=production

# Habilita la pestaña /vectorizacion
VITE_VECTORIZACION_ENABLED=true
```

---

## 3. La API de Vectorizer.AI — lo que importa

Base: `https://api.vectorizer.ai/api/v1` · Auth: **HTTP Basic** (`API_ID` : `API_SECRET`) ·
timeout de cliente ≥ **180 s**.

| Endpoint | Uso |
|---|---|
| `POST /vectorize` | multipart con `image` (binario) + parámetros como campos de form |
| `GET /account` | `{ subscriptionPlan, subscriptionState, credits }` — para mostrar saldo |

**Límites clave**

- `input.max_pixels`: rango `100 … 3_145_828`, **default 2_097_252**. No rechaza: *reduce* la
  imagen si es más grande. → **Siempre mandarlo en 3_145_828** y dimensionar las hojas para no
  pasarse, así nada se achica.
- Máximo absoluto de entrada: 33.554.432 px.
- Formatos de entrada: bmp, gif, jpeg, png, tiff, webp. Salida: **svg**, eps, pdf, dxf, png.

**Costos** (por llamada, no por imagen — de ahí el ahorro del montaje)

| Acción | Créditos |
|---|---|
| `mode=test` / `test_preview` | **0** (marca de agua fuerte) |
| `mode=preview` | 0.2 |
| `mode=production` | **1.0** |
| Formato extra vía `image.token` | 0.1 |

**Rate limit**: sin tope duro; arrancar con ~4 requests en paralelo. Ante `429`, backoff lineal
(5 s, 10 s, 15 s…). `5xx` → reintentar (máx 2).

Headers de respuesta útiles: `X-Credits-Charged`, `X-Credits-Calculated` (en modo test dice lo
que costaría en producción), `X-Image-Token`.

---

## 4. Preset de calidad — "preset Alcohn"

Los archivos base son, casi siempre, **fondo blanco + logo negro**, y el vector debe salir
**sin fondo, solo lo negro**. El script viejo ya hacía eso; el preset nuevo lo mejora.

`src/lib/vectorizacion/vectorizerPreset.ts`:

```ts
/** Parámetros de Vectorizer.AI para logos negros sobre fondo blanco (sin fondo en la salida). */
export const ALCOHN_PRESET: Record<string, string> = {
  // No dejar que la API achique la hoja: usamos el máximo documentado.
  'input.max_pixels': '3145828',

  // 2 colores: negro + "blanco". El blanco se mapea a transparente abajo.
  'processing.max_colors': '2',

  // Blanco -> transparente con tolerancia amplia (0.12) para que también caigan los grises
  // de compresión JPEG y los fondos "casi blancos" (#FAFAFA, #F2F2F2...).
  // El negro se fija explícito para que el trazo no salga gris oscuro.
  'processing.palette': '#000000; #FFFFFF -> #00000000 ~ 0.12;',

  // Descarta motas de ruido. El default (0.125 px) deja polvillo de JPEG.
  'processing.shapes.min_area_px': '3',

  // Formas rellenas, recortadas entre sí, sin agrupar: salida plana y fácil de partir.
  'output.draw_style': 'fill_shapes',
  'output.shape_stacking': 'cutouts',
  'output.group_by': 'none',

  // CRÍTICO: el gap filler agrega trazos de mezcla de color que rompen el "solo negro"
  // y ensucian el corte. Igual que en el script viejo: apagado.
  'output.gap_filler.enabled': 'false',

  // Curvas suaves: permitir todas y afinar la tolerancia (default 0.1).
  'output.curves.allowed.quadratic_bezier': 'true',
  'output.curves.allowed.cubic_bezier': 'true',
  'output.curves.allowed.circular_arc': 'true',
  'output.curves.allowed.elliptical_arc': 'true',
  'output.curves.line_fit_tolerance': '0.05',

  'output.file_format': 'svg',
  'output.svg.version': 'svg_1_1',
  'output.svg.fixed_size': 'false',

  // 0 = no guardar la imagen en sus servidores (no pagamos storage).
  'policy.retention_days': '0',
};
```

> **No mandar ningún `output.size.*`.** Si se mandan, el `viewBox` de salida deja de coincidir
> con los píxeles de la hoja enviada y el split (§5.6) se rompe.

### Diferencias contra el script viejo y por qué

| Script viejo | Preset nuevo | Motivo |
|---|---|---|
| `max_colors=1` | `2` | La doc dice que 1 y 2 hacen lo mismo (salida bicolor); 2 es el valor documentado y explícito. |
| `palette: '#FFFFFF -> #00000000 ~ 0.01;'` | `'#000000; #FFFFFF -> #00000000 ~ 0.12;'` | Tolerancia 0.01 es tan fina que un fondo `#FDFDFD` o el halo de un JPEG sobreviven como forma gris. 0.12 los borra. Fijar `#000000` evita que el trazo salga gris oscuro. |
| (sin `min_area_px`) | `3` | Mata el polvillo de compresión sin comerse detalle real. |
| (sin `line_fit_tolerance`) | `0.05` | Curvas más fieles al contorno (el default 0.1 redondea de más en letras chicas). |
| (sin `input.max_pixels`) | `3145828` | Sin esto la API achica todo a 2.1 MP y perdemos ~33% de resolución **gratis**. |
| `retention_days=1` | `0` | No pagamos 0.01 crédito/día de storage que no usamos. |

> **Los tres primeros son los que más mueven la aguja en calidad.** El resto es fino.

### Validar el preset sin gastar créditos

`mode=test` es **gratis**. La UI debe tener un botón **"Probar preset (gratis)"** que corre la
hoja actual en modo test y muestra el SVG con marca de agua + el valor de `X-Credits-Calculated`.
Sirve para comparar presets antes de quemar créditos. **Usar esto durante todo el desarrollo**,
no `production`.

---

## 5. Pipeline compartido

```
  ┌─ fuente A: sellos pendientes (Supabase)
  │                                        ┌─ destino A: guardar en el sello
  └─ fuente B: archivos de la PC           │
        │                                  └─ destino B: ZIP descargable
        ▼
  [1] cargar → [2] recortar → [3] empaquetar en hojas → [4] componer PNG
        → [5] POST /api/vectorize (1 crédito por hoja) → [6] partir el SVG
```

Todo en `src/lib/vectorizacion/`. Cada paso es una función pura y testeable salvo el 5.

### [1] Carga — `imageSource.ts`

```ts
export interface SourceImage {
  id: string;            // selloId, o uuid local
  name: string;          // nombre de archivo o diseño del sello (sin extensión)
  bitmap: ImageBitmap;
  naturalWidth: number;
  naturalHeight: number;
  selloId?: string;      // presente solo en la fuente A
  orderId?: string;
}
```

- Fuente A: `resolveBaseFileStorageRef(archivo_base, mockup_solicitud_id)` →
  `downloadPrivateStorageBlob` / URL pública → `createImageBitmap(blob)`.
  **No usar `archivo_base` directo**: en pedidos web apunta a `logos-web` (privado) y a veces a
  rutas del carrito que ni existen; `resolveBaseFileStorageRef` ya resuelve ese caso leyendo
  `mockup_solicitudes.imagen_optimizada_path`.
- Fuente B: `File` (drag, `<input>`, o `paste` desde `ClipboardEvent.clipboardData.files`).
- Rechazar con toast lo que no sea `png/jpeg/webp/gif/bmp/tiff`.

### [2] Recorte + limpieza — `imagePrep.ts`

```ts
export interface PrepOptions {
  autoCrop: boolean;        // default true
  cropPaddingPct: number;   // default 0.02 (2% del lado mayor del bbox)
  cleanLevels: boolean;     // default true
  blackPoint: number;       // default 60   (0-255)
  whitePoint: number;       // default 235  (0-255)
  manualCrop?: { x: number; y: number; w: number; h: number }; // pisa el autoCrop
}

export function prepareImage(src: SourceImage, opts: PrepOptions): PreparedImage
```

**Auto-crop** — esto es lo que resuelve "el logo de 400×400 dentro de un canvas de 1000×1000":

1. Dibujar en un `OffscreenCanvas`, leer `getImageData`.
2. Muestrear las 4 esquinas para decidir el color de fondo (casi siempre blanco).
3. Un píxel es "contenido" si `|lum - lumFondo| > 12` **o** `alpha < 250`.
4. Bbox de todos los píxeles de contenido; si el bbox es vacío → marcar la imagen como
   **"sin contenido"** y no mandarla (ahorra créditos y evita SVGs vacíos).
5. Expandir el bbox `cropPaddingPct` y recortar.

**Limpieza de niveles (`cleanLevels`)** — mejora real de calidad, hacerla bien:

```
v' = clamp( (v - blackPoint) / (whitePoint - blackPoint), 0, 1 ) * 255
```

aplicada al canal de luminancia. Esto lleva el fondo a **blanco puro** y el trazo a **negro
puro**, pero **conserva el degradado del antialias en el borde** — que es justamente lo que
Vectorizer.AI usa para colocar la curva con precisión sub-píxel.

> ⚠️ **No binarizar con umbral duro.** Un threshold clásico (todo < 128 negro, el resto blanco)
> destruye el antialias y produce contornos escalonados. Es el error clásico; evitarlo explícitamente.

**Recorte manual** — ver §7.2 para la UI.

### [3] Empaquetado — `sheetPacking.ts` (función pura + test)

```ts
export const SHEET_MAX_PIXELS = 3_145_828; // tope de input.max_pixels
export const SHEET_GUTTER_PX  = 24;        // separación mínima entre celdas y borde
export const SHEET_MAX_ITEMS  = 12;        // tope por hoja

export interface PackedCell { imageId: string; x: number; y: number; w: number; h: number; }
export interface PackedSheet { width: number; height: number; cells: PackedCell[]; }

export function packSheets(items: { id: string; w: number; h: number }[]): PackedSheet[]
```

Algoritmo — **shelf packing (First-Fit-Decreasing por altura)**:

1. Ordenar por alto descendente.
2. Para un ancho candidato `W`: ir llenando "estantes" horizontales; cada ítem entra en el
   estante actual si `xCursor + w + gutter <= W`, si no se abre un estante nuevo debajo.
   `H` final = suma de alturas de estantes + gutters.
3. Buscar `W` por búsqueda binaria en `[maxItemW + 2*gutter, sqrt(SHEET_MAX_PIXELS * 2)]`,
   quedándose con el `W` que **maximiza la cantidad de ítems** con `W * H <= SHEET_MAX_PIXELS`;
   a igual cantidad, el que da la hoja de **menor área** (menos píxeles desperdiciados).
4. Lo que no entra arranca una hoja nueva. Repetir.

**Reglas duras:**

- **Nunca escalar hacia abajo** una imagen para que entre. Si no entra, va a la hoja siguiente.
- Si **una sola** imagen ya supera `SHEET_MAX_PIXELS`, se manda **sola** (la API la reduce ella,
  y con `input.max_pixels` al máximo la pérdida es mínima).
- `SHEET_MAX_ITEMS = 12`: un fallo de una hoja no arruina 30 sellos, y el split se mantiene
  confiable. Configurable.

**Ejemplo del pedido** — 8 imágenes de 500×500 con gutter 24:
`W ≈ 2120` → 4 por estante, 2 estantes → `2120 × 1072 = 2.27 MP ≤ 3.14 MP` → **1 sola hoja**,
1 crédito para las 8. (El enunciado asumía un tope de 1000×1000 y daba 2 hojas; con el tope real
de 3.14 MP entra todo junto — misma idea, más ahorro.)

### [3.b] Aprovechar el presupuesto de píxeles — `upscaleToBudget`

Si la hoja quedó muy por debajo del tope (ej. 4 logos de 300×300 → 0.4 MP de 3.14 MP), se puede
escalar la hoja entera por `min(sqrt(SHEET_MAX_PIXELS / area), UPSCALE_CAP)` con interpolación
suave (`ctx.imageSmoothingQuality = 'high'`).

- Default: **activado, `UPSCALE_CAP = 2`**.
- No agrega información, pero le da al trazador más gradiente sub-píxel y en la práctica suaviza
  las curvas. Es **discutible** → dejarlo como toggle en la UI ("Maximizar resolución") y
  **medirlo con `mode=test` (gratis)** antes de fijar el default definitivo.

### [4] Composición — `sheetCompose.ts`

```ts
export async function composeSheet(
  sheet: PackedSheet,
  images: Map<string, PreparedImage>,
  opts: { upscale: number },
): Promise<{ blob: Blob; placement: PackedSheet }>
```

- Canvas del tamaño de la hoja (× `upscale`), **pintado de blanco puro** primero.
- `drawImage` de cada celda en su `x, y`.
- `canvas.toBlob(..., 'image/png')` — PNG sin pérdida; el blanco/negro comprime muy bien
  (típicamente < 500 KB, cómodo para el límite de ~4.5 MB de body de Vercel).
- Devolver el `placement` **ya multiplicado por `upscale`**: son las coordenadas exactas del
  espacio que va a tener el SVG de salida.

### [5] Llamada — ver §6

### [6] Split del SVG — `svgSplit.ts`

El SVG que vuelve tiene `viewBox="0 0 W H"` con **las mismas dimensiones en píxeles que la hoja
enviada** (siempre que no se manden parámetros `output.size.*`). Verificarlo en runtime y abortar
con un error claro si no coincide.

```ts
export function splitSheetSvg(
  svgText: string,
  placement: PackedSheet,
): Map<string /* imageId */, string /* svg */>
```

1. `new DOMParser().parseFromString(svgText, 'image/svg+xml')`; chequear `parsererror`.
2. Montar el `<svg>` en un host oculto fuera de flujo — **misma técnica que ya usa
   `src/lib/utils/svgBoundingBox.ts`**; reutilizar ese helper.
3. Para cada hijo dibujable de primer nivel (`path`, `polygon`, `g`, `circle`, …):
   `el.getBBox()` → centro del bbox → buscar la celda que lo contiene.
4. Si un bbox **cruza** el borde de su celda → warning en consola y se asigna igual por el centro.
   Con `gutter = 24 px` no debería pasar nunca; si pasa seguido, subir el gutter.
5. Por cada celda, emitir un SVG nuevo:
   - `viewBox` = **unión de los bboxes de sus elementos** (recorte ajustado, no el rectángulo de
     la celda). Esto importa: `measureSvgString` mide la geometría, y el vector queda limpio para
     el programa de fabricación.
   - Los elementos se **mueven tal cual, sin tocar coordenadas** — el `viewBox` desplazado ya hace
     la traslación. Sin pérdida de precisión.
   - Copiar `<defs>` / `<style>` del original si existen.
   - Celda sin elementos → SVG vacío: **no guardar**, reportar como "sin contenido".
6. `width` / `height` del SVG resultante: ver §8.2 (depende del destino).

---

## 6. Endpoint servidor — `api/vectorize.js` + proxy de dev

### `api/vectorize.js` (Vercel)

- `POST` únicamente.
- Body JSON: `{ imageBase64: string, mode?: 'production'|'preview'|'test', overrides?: Record<string,string> }`.
  (JSON + base64 en lugar de multipart para no sumar otra dependencia; el PNG en base64 pesa
  ~1.33×, sigue muy por debajo del límite.)
- Construye un `FormData` con `image` (Blob del PNG) + el preset + `overrides` + `mode`.
- **El preset vive en un solo lado.** Ponerlo en `api/_vectorizerPreset.js` y que
  `src/lib/vectorizacion/vectorizerPreset.ts` lo re-exporte (o al revés) — nunca dos copias que
  se desincronicen. **El servidor es la autoridad**: el cliente solo puede mandar `overrides` de
  una allowlist acotada (`processing.palette`, `processing.shapes.min_area_px`,
  `output.curves.line_fit_tolerance`), todo lo demás se ignora.
- Auth: `Authorization: Basic ` + `Buffer.from(id + ':' + secret).toString('base64')`.
- `maxDuration` alto (60 s en Vercel). Si una hoja tarda más, bajar `SHEET_MAX_ITEMS`.
- Respuesta OK:
  ```json
  { "status": "ok", "svg": "<svg …>", "creditsCharged": 1, "creditsCalculated": 1, "mode": "production" }
  ```
- Error: mismo shape que el resto del repo (`{ status: 'system_error', message, httpStatus }`).
  Propagar el `message` de Vectorizer.AI (viene JSON con `status`/`code`/`message`) — son mensajes
  útiles, mostrarlos tal cual.
- Si faltan `VECTORIZER_API_ID` / `VECTORIZER_API_SECRET` → `503` con mensaje explícito.

### `api/vectorizer-account.js`

`GET` → `{ credits, subscriptionPlan, subscriptionState }`. Cachear 60 s en memoria.

### Proxy de dev

En `vite-micorreo-proxy.ts`, agregar `vectorizeDevProxy(env)` y `vectorizerAccountDevProxy(env)`
copiando la forma de `vectorizeEnqueueDevProxy` (línea 359+), y registrarlos en `vite.config.ts`.
**Sin esto, `npm run dev` no puede vectorizar.**

---

## 7. La página

### Archivos

```
src/app/vectorizacion/index.tsx              // orquestador, < 150 líneas
src/components/vectorizacion/
  VectorizacionHeader.tsx                    // título + saldo de créditos + opciones
  PendientesTab/
    PendientesTab.tsx                        // fuente A
    PendienteCard.tsx                        // miniatura + diseño + cliente + checkbox
    VectorizarConfirmDialog.tsx              // "N sellos → M hojas → M créditos"
  LoteTab/
    LoteTab.tsx                              // fuente B
    LoteDropzone.tsx                         // drag + click + paste
    LoteImageCard.tsx                        // miniatura, recorte, quitar
    CropEditor.tsx                           // §7.2
    SheetPreview.tsx                         // §7.3
  AsignarTab/
    AsignarTab.tsx                           // §9
    AsignacionRow.tsx
  shared/
    VectorResultCard.tsx                     // antes/después + descargar + reintentar
    ProgresoHojas.tsx                        // barra por hoja
src/lib/vectorizacion/
  vectorizerPreset.ts  vectorizerApi.ts  imageSource.ts  imagePrep.ts
  sheetPacking.ts  sheetCompose.ts  svgSplit.ts  matchByName.ts
  vectorizacion.service.ts  runVectorizacion.ts   // orquestador del pipeline
src/lib/state/vectorizacion.store.ts           // zustand: selección, opciones, progreso
```

Registrar la ruta en `src/App.tsx` **dentro de `AuthenticatedLayout`** (no hace falta
`OrdersScopeLayout`) y poner `disabled: false` en `Sidebar.tsx:41`. Usar `AppMain` como
contenedor, igual que `src/app/produccion/index.tsx`.

### 7.1 Pestaña "Pedidos"

Query en `vectorizacion.service.ts`:

```ts
supabase.from('sellos').select(`
    id, orden_id, diseno, item_type, item_config, archivo_base, mockup_solicitud_id,
    ancho_real, largo_real, estado_fabricacion, estado_vectorizacion, es_prioritario,
    fecha_limite, created_at,
    ordenes!inner ( id, clientes ( nombre, apellido ) )
  `)
  .eq('item_type', 'SELLO')
  .eq('estado_fabricacion', 'Sin Hacer')
  .neq('estado_vectorizacion', 'VECTORIZADO')
  .is('archivo_vector_preview', null)
  .not('archivo_base', 'is', null)
  .order('es_prioritario', { ascending: false })
  .order('fecha_limite', { ascending: true, nullsFirst: false });
```

- Grilla de tarjetas: miniatura del `archivo_base` (usar `StorageUrlImage`, que ya maneja URLs
  firmadas), nombre de diseño, cliente, medida pedida, chip de Prioridad.
- Selección múltiple: checkbox por tarjeta + "Seleccionar todo" + shift-click por rango.
- Barra inferior fija con el resumen en vivo: **"12 sellos · 2 hojas · 2 créditos"** — se calcula
  corriendo `packSheets` en tiempo real sobre las medidas **ya recortadas**, así que hay que
  preparar cada imagen al seleccionarla (spinner chico en la tarjeta mientras tanto).
- Botón primario **"Vectorizar (2 créditos)"** → `VectorizarConfirmDialog` → corre el pipeline.
- Mientras corre: `ProgresoHojas`, y cada sello pasa a `estado_vectorizacion = 'EN_PROCESO'`
  (así el progreso también se ve desde Producción). Al terminar cada uno → `VECTORIZADO`;
  si falla → `ERROR` + `error_vectorizacion_mensaje`.
- Al terminar: grilla de resultados con **antes/después** y botón "Reintentar" por sello.

> **Nota sobre Rehacer / Prioridad.** Esos sellos tampoco están hechos, pero normalmente ya
> tienen vector — por eso el filtro base es solo `Sin Hacer`. Dejar preparado un toggle
> secundario *"incluir Rehacer y Prioridad sin vector"* (agrega esos dos valores al `.eq` →
> `.in('estado_fabricacion', [...])`), apagado por default.

### 7.2 Recorte — que sea lindo y rápido

El recorte es donde la UX importa. Propuesta:

- **El auto-crop resuelve el 95% de los casos.** Cada tarjeta muestra la miniatura **ya recortada**
  con un badge tipo `1000×1000 → 412×386` y un ícono de tijera verde. El usuario no toca nada.
- Click en la miniatura → **`CropEditor`** en `Dialog`:
  - Imagen grande, rectángulo de recorte con 8 manijas, arrastrable, overlay oscuro afuera.
  - Botones: **Auto** (recalcula), **Todo** (sin recorte), **Cuadrado**.
  - Teclado: flechas = mover 1 px, `Shift`+flechas = 10 px, `Enter` = aceptar, `Esc` = cancelar.
  - Rueda del mouse = zoom del preview (no del recorte).
  - Footer en vivo: `412 × 386 px · 0.16 MP`.
- **Recorte en lote**: botón "Auto-recortar todo" en el header de la pestaña + un slider de padding
  global (0–10%) que re-renderiza todas las miniaturas al instante.
- Implementación: **sin librerías nuevas**. Un `div` posicionado sobre un `<img>` con
  `onPointerDown/Move/Up`, y el estado del recorte en coordenadas **normalizadas (0–1)** para que
  el zoom no lo afecte. El recorte real se aplica recién en `prepareImage`.

### 7.3 Preview de hojas

`SheetPreview` dibuja las hojas empaquetadas a escala (canvas o `div`s absolutos): un rectángulo
por logo con su miniatura y nombre, y el header

```
Hoja 1 — 2120 × 1072 px · 2.27 MP de 3.14 MP · 8 imágenes · 1 crédito
```

más una barra de aprovechamiento (% de píxeles usados). Es la pieza que hace evidente el ahorro.

### 7.4 Pestaña "Lote libre"

Igual que "Pedidos" pero:

- Arriba, `LoteDropzone` grande: **arrastrar, click, o `Ctrl+V`** (listener `paste` en `window`
  mientras la pestaña está activa — ver el patrón de `MockupSlotCard.tsx`). Acepta múltiples archivos.
- Sin conexión con Supabase.
- Al terminar: **ZIP** con JSZip, un `.svg` por imagen, nombrado con el nombre original sanitizado
  (`logo-acme.png` → `logo-acme.svg`). Colisiones → sufijo `-2`, `-3`. Nombre del ZIP:
  `vectores-YYYY-MM-DD-HHmm.zip`.
- También ofrecer descarga individual desde cada tarjeta de resultado.

---

## 8. Guardar el vector en el sello

### 8.1 Subida

```ts
const fileName = `${slugify(designName || 'vector')}.svg`;
const path = generateFilePath(orderId, 'vector', fileName, selloId);
const url  = await uploadFile('vector', new File([svgBlob], fileName, { type: 'image/svg+xml' }), path);

await supabase.from('sellos').update({
  archivo_vector_preview: url,          // para SVG: es a la vez vector y preview
  estado_vectorizacion: 'VECTORIZADO',
  error_vectorizacion_mensaje: null,
}).eq('id', selloId);
```

> Esto es exactamente lo que ya hace `production.service.ts:335-350` y lo que hace `CellVector.tsx`
> al subir un SVG a mano. **No inventar un contrato nuevo.**

### 8.2 Medida de fabricación

Un bitmap no tiene medida física: la verdad es la medida **pedida** del sello (`ancho_real` /
`largo_real`, en cm → ×10 = mm).

Al emitir el SVG para un sello:

1. Calcular el aspect ratio del `viewBox` final.
2. Escalar la medida pedida para que **entre** en ese ratio conservando proporción (`contain`).
3. Escribir `width="X mm" height="Y mm"` en el `<svg>`.
4. Correr el flujo que ya existe: `measureSvgString` → `resolveFabricationSize(requestedW, requestedH, measured)`.
   - Caso normal → `needsReview = false` → se guardan `ancho_fabricacion_mm` / `largo_fabricacion_mm`
     sin molestar al usuario.
   - Si la medida pedida **supera el tope de la planchuela**, `resolveFabricationSize` lo detecta y
     hay que abrir `FabricationSizeDialogHost` (ya montado global en `App.tsx`).
   - En lote: **no abrir N diálogos**. Acumular los que necesitan revisión y mostrarlos al final,
     de a uno, con contador "3 de 7".

Para el ZIP de "Lote libre" no hay medida pedida → emitir el SVG **sin unidades** (solo `viewBox`),
que es lo correcto para un archivo suelto.

---

## 9. Pestaña "Asignar SVG"

Arrastrar `.svg` ya hechos y pegarlos a los sellos pendientes.

### Matching — `matchByName.ts` (función pura + test)

```ts
export interface MatchCandidate { selloId: string; score: number; label: string; }
export function rankMatches(fileName: string, sellos: PendingSello[]): MatchCandidate[]
```

1. **Normalizar** ambos lados: minúsculas, `normalize('NFD')` sin diacríticos, sacar extensión,
   no-alfanumérico → espacio, colapsar espacios, quitar palabras de ruido
   (`logo`, `vector`, `final`, `ok`, `v2`, `copia`, `sello`).
2. Puntaje (0–1), gana el mayor:
   - igualdad exacta → `1.0`
   - uno contiene al otro → `0.85`
   - **Dice sobre bigramas** de la cadena normalizada (robusto a typos y a orden distinto)
   - **Jaccard de tokens** — quedarse con `max(dice, jaccard)`
3. **Auto-asignar** solo si `score >= 0.75` **y** `score - segundoMejor >= 0.15` **y** el sello no
   tiene vector y no fue tomado por otro archivo del mismo lote. Resolver colisiones globalmente:
   si dos archivos apuntan al mismo sello, gana el de mayor score y el otro queda manual.
4. El resto → manual.

### UI

Lista de filas (`AsignacionRow`), una por archivo:

```
[ preview SVG ]  acme-logo.svg         →  [ ✓ Acme S.A. — Juan Pérez   ▾ ]   92%
[ preview SVG ]  logo-nuevo-final.svg  →  [ Elegir sello…              ▾ ]   sin match
```

- Chip de confianza con color: verde ≥ 90%, ámbar 75–89%, gris = manual.
- El `▾` abre un buscador con los pendientes ordenados por score, con la miniatura del archivo
  base al lado — así se compara visualmente contra el SVG.
- **Alternativa por arrastre**: panel derecho con las tarjetas de sellos pendientes; se arrastra un
  archivo de la lista izquierda y se suelta sobre una tarjeta. Usar `@dnd-kit/core`, **ya instalado**.
- Header: `8 archivos · 6 asignados automáticamente · 2 pendientes`.
- Botón **"Confirmar asignaciones"** → sube todo, aplica §8.1 y §8.2, y muestra el resumen.
- Un archivo puede quedar **sin asignar** (se ignora, no bloquea al resto).

---

## 10. Errores, reintentos y costos

- **Confirmación obligatoria antes de gastar.** El diálogo dice cuántos créditos y cuánto queda
  después (`/api/vectorizer-account`). Si `credits < hojas` → advertencia en rojo y botón deshabilitado.
- **Concurrencia**: máximo **4 hojas en paralelo** (pool simple, sin librería).
- **Reintentos** dentro de `vectorizerApi.ts`: `429` → backoff lineal 5/10/15 s (hasta 3);
  `5xx` → 2 reintentos con backoff exponencial; `4xx` (salvo 429) → **no reintentar**, mostrar el
  `message` de la API.
- Fallo de una hoja → **las demás siguen**. Los sellos de esa hoja quedan en `ERROR` con
  `error_vectorizacion_mensaje` y aparecen con botón "Reintentar" que los vuelve a mandar
  (eventualmente en una hoja más chica).
- **Nunca marcar `VECTORIZADO` antes de que la subida a Storage termine OK.** Orden estricto:
  vectorizar → partir → subir a Storage → recién ahí actualizar el sello.
- Imagen que quedó vacía tras el recorte → no se manda; se reporta "sin contenido detectado".
- Log de consola por hoja: `[vectorizacion] hoja 1/3 · 2120×1072 · 8 img · 1.0 créditos · 4.2s`.

---

## 11. Tests (`vitest`, ya configurado)

Obligatorios — son funciones puras, no hay excusa:

| Archivo | Qué cubre |
|---|---|
| `sheetPacking.test.ts` | 8×(500×500) → 1 hoja; celdas sin solaparse; separación ≥ gutter; hoja ≤ `SHEET_MAX_PIXELS`; imagen gigante sola; respeta `SHEET_MAX_ITEMS` |
| `matchByName.test.ts` | exacto; con acentos; con palabras de ruido; typo de 1 letra; colisión de dos archivos al mismo sello; sin match |
| `svgSplit.test.ts` | SVG sintético con 4 paths en 4 cuadrantes → 4 SVGs con el `viewBox` correcto; celda vacía; elemento a caballo de dos celdas |
| `imagePrep.test.ts` | bbox del auto-crop sobre un `ImageData` armado a mano; imagen toda blanca → "sin contenido"; la curva de niveles conserva los valores intermedios |

`svgSplit` e `imagePrep` necesitan DOM → usar entorno `jsdom` de vitest en esos archivos.

---

## 12. Checklist de cierre

- [ ] `vectorizer ai/` agregado a `.gitignore`; credenciales movidas a `.env.local` + Vercel; **par rotado**.
- [ ] `.env.local.example` actualizado con las 4 variables nuevas.
- [ ] `Sidebar.tsx:41` → `disabled: false`.
- [ ] Ruta `/vectorizacion` en `App.tsx`.
- [ ] Proxies de dev registrados en `vite.config.ts` (si no, `npm run dev` no vectoriza).
- [ ] Ningún archivo supera 250 líneas.
- [ ] `npm run typecheck` limpio.
- [ ] `npm run lint` limpio (`--max-warnings 0`).
- [ ] `npm run test` en verde.
- [ ] **Entrada nueva en `src/lib/changelog/entries.ts`** — obligatorio por
      `.cursor/rules/changelog-novedades.mdc`. Es una feature muy visible.
      `id: 4` (el último actual es 3), `date` = día de la entrega, `version: '1.3'`, ~3 slides:
      "Vectorizá los pedidos desde la app", "Varios logos en una sola pasada" (mencionar el ahorro
      de créditos), "Arrastrá tus SVG y se asignan solos".
      Íconos de lucide: `Layers`, `Combine`, `MousePointerClick`.
- [ ] Probado end-to-end **con `mode=test`** antes de gastar un solo crédito real.

---

## 13. Fuera de alcance / para después

- **Migrar el `vector-worker` de Python a Vectorizer.AI**: agregar `VECTOR_ENGINE=vectorizer_ai`
  en `services/vector-worker/app/vectorize.py` para que la vectorización automática al subir el
  archivo base (hoy apagada vía `VITE_VECTOR_AUTO_ENABLED=false`) use la misma API y el mismo
  preset. Recién cuando el preset esté validado en producción.
- Vectorización automática al crear el pedido, sin botón.
- Uso de `image.token` + `/download` para bajar EPS/PDF además del SVG a 0.1 crédito, si alguna
  vez hace falta EPS para Aspire.
- Historial de vectorizaciones y créditos consumidos por mes (la tabla `vector_jobs` ya podría
  servir de base).
