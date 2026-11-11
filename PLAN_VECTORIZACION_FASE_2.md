# Plan — Vectorización, Fase 2 (correcciones y revisión manual)

> Continuación de `PLAN_VECTORIZACION.md`, sobre el código ya implementado en
> `src/lib/vectorizacion/`, `src/components/vectorizacion/` y `api/vectorize*.js`.
> Ordenado por prioridad: **§1 es un bug que ya ensució datos en producción.**

---

## Índice

| § | Tema | Prioridad |
|---|---|---|
| 1 | **Modo test está guardando vectores con marca de agua en los sellos** | 🔴 crítico |
| 2 | Auto-recorte: causa raíz y algoritmo nuevo | 🟠 alto |
| 3 | Cola de revisión — confirmar / rechazar antes de asignar | 🟠 alto |
| 4 | Deseleccionar lo ya vectorizado | 🟡 medio |
| 5 | Menú contextual en las tarjetas | 🟡 medio |
| 6 | Reemplazar el archivo base sin perder el original | 🟡 medio |
| 7 | Performance y guardrails | 🟢 bajo |

---

## 1. 🔴 Modo test está escribiendo en la base

### El problema

`src/lib/state/vectorizacion.store.ts:48` arranca en `mode: 'test'`, y
`PendientesTab.tsx` llama a `runVectorizacion({ ..., saveToSellos: true })` **sin mirar el modo**
(`PendientesTab.tsx:129`). Entonces `runVectorizacion` → `saveSelloVector` sube el SVG y hace:

```ts
await setSelloVectorState(params.selloId, 'VECTORIZADO', { vectorUrl: url, ... });
```

Los SVG de la segunda captura tienen encima `VECTORIZER.AI TEST IMAGE`. **Esos archivos con
marca de agua quedaron subidos al bucket `vector` y los sellos quedaron marcados como
`VECTORIZADO`** — o sea, ya salieron de la lista de pendientes y están listos para entrar a un
programa de fabricación. Es exactamente lo que no tiene que pasar.

### La corrección

1. **Guardia dura en `saveVector.ts`.** Que no dependa de que el llamador se acuerde:

   ```ts
   export async function saveSelloVector(params: { /* … */ mode: VectorizeMode }): Promise<SavedVector> {
     if (params.mode !== 'production') {
       throw new Error('No se puede guardar un vector generado en modo test/preview.');
     }
     // …
   }
   ```

2. **`runVectorizacion`**: `saveToSellos` pasa a ser `saveToSellos && mode === 'production'`.
   Con la cola de revisión de §3 esto queda todavía más simple, porque el guardado se va del
   `run` por completo.

3. **El modo tiene que verse.** Mientras `mode !== 'production'`, mostrar un banner ámbar fijo
   arriba de la pestaña: *"Modo prueba — los vectores salen con marca de agua y no se guardan
   en los pedidos"*. Hoy el único indicio es el texto del botón.

4. **Default.** Una vez validado el preset, `mode: 'production'` como default del store y el
   modo test detrás de un toggle explícito en `VectorizacionHeader`.

### Limpieza de lo que ya se guardó

Los sellos afectados son los que se vectorizaron en esa primera prueba. Para encontrarlos,
mirar en el bucket `vector` los archivos subidos ese día bajo
`ordenes/*/sellos/*/vector_*.svg`, o por SQL:

```sql
-- Candidatos: vectorizados en la ventana de la prueba, con vector SVG de esta pestaña.
select id, diseno, archivo_vector_preview, updated_at
from public.sellos
where estado_vectorizacion = 'VECTORIZADO'
  and archivo_vector_preview like '%/vector/%'
  and updated_at >= '<fecha-hora de la prueba>'
order by updated_at desc;
```

**Revisar uno por uno antes de tocar nada** (abrir el SVG y ver si tiene la marca de agua).
Para los que sí la tengan:

```sql
update public.sellos
set archivo_vector_preview = null,
    estado_vectorizacion = 'BASE',
    ancho_fabricacion_mm = null,
    largo_fabricacion_mm = null,
    error_vectorizacion_mensaje = null
where id in ( /* ids verificados a mano */ );
```

Y borrar esos archivos del bucket `vector`. **No correr el `update` en masa sin haber mirado
los SVG** — si alguno de esos sellos ya tenía un vector bueno de antes, se pierde.

---

## 2. Auto-recorte — por qué falla y cómo arreglarlo

### Causa raíz

`src/lib/vectorizacion/imagePrep.ts:37`:

```ts
if (Math.abs(lum - bg) > threshold || alpha < 250) {
```

Ese `|| alpha < 250` es el bug. **En un PNG con fondo transparente, el fondo tiene `alpha = 0`**,
así que *cada píxel de fondo cuenta como contenido* y el bbox termina siendo la imagen entera.
Eso explica exactamente lo que se ve en la captura:

| Sello | Resultado | Por qué |
|---|---|---|
| Storz Werk | `2200×1414 → 2200×1414` | fondo transparente |
| Las manos de Dorita | `1820×1558 → 1820×1558` | fondo transparente |
| Coronita | `1820×1558 → 917×594` ✅ | fondo blanco opaco → la rama de luminancia funciona |

Hay tres problemas más, secundarios pero que van a morder después:

- **`sampleCornerBackground` mira 4 píxeles y promedia.** Una sola esquina con un píxel oscuro
  (o un logo que llega a la esquina) corre el `bg` y rompe la detección de toda la imagen.
- **No hay poda de ruido.** Una mota suelta de compresión JPEG en un borde fija el bbox al
  borde y el recorte no sirve para nada.
- **Umbral único de 12, sin reintento.** Un fondo con degradado suave o textura leve nunca baja
  de 12 y no recorta.

### Algoritmo nuevo

Reescribir `computeContentBBox` en `src/lib/vectorizacion/imagePrep.ts`:

```ts
export type CropReason = 'ok' | 'sin-margen' | 'fondo-no-detectado' | 'vacia';

export interface ContentBBox {
  x: number; y: number; w: number; h: number;
  reason: CropReason;
}

/** Luminancia ya aplanada sobre blanco: mata el caso "PNG transparente". */
function flatLum(d: Uint8ClampedArray, i: number): number {
  const a = d[i + 3] / 255;
  return luminance(d[i], d[i + 1], d[i + 2]) * a + 255 * (1 - a);
}

/** Fondo = MEDIANA del anillo de 2 px del borde. Robusto a esquinas raras. */
function sampleBorderBackground(data: PixelBuffer): number {
  const vals: number[] = [];
  const { width: w, height: h } = data;
  const push = (x: number, y: number) => vals.push(flatLum(data.data, (y * w + x) * 4));
  for (let x = 0; x < w; x += 1) { push(x, 0); push(x, 1); push(x, h - 1); push(x, h - 2); }
  for (let y = 0; y < h; y += 1) { push(0, y); push(1, y); push(w - 1, y); push(w - 2, y); }
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)] ?? 255;
}
```

El cuerpo, con las cuatro correcciones:

1. **Aplanar alpha sobre blanco** antes de comparar. El `|| alpha < 250` desaparece.
2. **Fondo por mediana del anillo del borde**, no por 4 esquinas.
3. **Fondo oscuro**: si `bg < 128`, el contenido es *más claro* que el fondo (logo blanco sobre
   negro). La comparación por valor absoluto ya lo cubre, pero hay que dejarlo dicho y testeado.
4. **Perfiles de fila/columna con poda de ruido** en vez de un bbox global de píxeles sueltos:

   ```ts
   // Contar "tinta" por fila y por columna.
   const rowInk = new Int32Array(h);
   const colInk = new Int32Array(w);
   for (let y = 0; y < h; y += 1) {
     for (let x = 0; x < w; x += 1) {
       if (Math.abs(flatLum(data.data, (y * w + x) * 4) - bg) > threshold) {
         rowInk[y] += 1; colInk[x] += 1;
       }
     }
   }
   // Una fila/columna cuenta solo si tiene tinta real, no una mota suelta.
   const rowMin = Math.max(2, Math.round(w * 0.0005));
   const colMin = Math.max(2, Math.round(h * 0.0005));
   // minY = primera fila con rowInk[y] >= rowMin, etc.
   ```

5. **Escalada de umbral**: si el recorte cubre **más del 98%** del área original, reintentar con
   `threshold = 24`, y después `40`. Si al tercer intento sigue sin recortar, devolver
   `reason: 'sin-margen'` (la imagen ya venía ajustada) o `'fondo-no-detectado'` (el borde no es
   uniforme: mediana del anillo con desviación alta). Distinguirlos con la dispersión del anillo.

### Padding

`expandBBox` usa `max(bbox.w, bbox.h) * pct`. Para un logo apaisado como *Storz Werk*
(~2100×340 una vez recortado) eso da 42 px de margen arriba y abajo sobre 340 px de alto: 12%.
Cambiar a:

```ts
const pad = Math.min(64, Math.max(2, Math.round(Math.min(bbox.w, bbox.h) * paddingPct)));
```

### Aplanar alpha también en la imagen que se usa

`prepareImage` recorta y aplica niveles pero **nunca aplana el alpha**. Como `composeSheet`
pinta blanco primero, la hoja sale bien, pero la miniatura de la tarjeta (que usa
`prepared.canvas`) muestra el fondo transparente en damero. Aplanar sobre blanco en
`prepareImage` para que **lo que se ve en la tarjeta sea literalmente lo que se manda**.

### Que el badge diga la verdad

Hoy `PendienteCard.tsx:80` muestra `2200×1414 → 2200×1414` en verde, como si hubiera recortado.
Usar el `reason`:

| reason | badge | color |
|---|---|---|
| `ok` | `2200×1414 → 917×594` | verde |
| `sin-margen` | `sin margen para recortar` | gris |
| `fondo-no-detectado` | `no se detectó el fondo — recortar a mano` | ámbar, clickeable al `CropEditor` |
| `vacia` | `sin contenido` | rojo, y no entra en la hoja |

### Tests a agregar en `imagePrep.test.ts`

- PNG con **fondo transparente** y un cuadrado negro en el centro → recorta al cuadrado.
  *(este es el test que reproduce el bug reportado — escribirlo primero y verlo fallar)*
- Fondo blanco + **una mota suelta de 1 px** en la esquina → la mota se poda, no fija el bbox.
- **Fondo negro con logo blanco** → recorta igual.
- Imagen ya ajustada → `reason: 'sin-margen'`, sin recorte.
- Fondo con degradado suave → escala el umbral y recorta, o devuelve `fondo-no-detectado`.
- Logo apaisado → el padding no se come la proporción.

---

## 3. Cola de revisión — confirmar o rechazar antes de asignar

Hoy `runVectorizacion` sube y asigna todo de una, y después dispara el modal de medida en
cadena. Lo correcto es al revés: **primero se mira el SVG, después se guarda.**

### Flujo nuevo

```
Pendientes ──vectorizar──▶ Revisión (N) ──Confirmar──▶ sube + asigna + (modal de medida si hace falta)
                              │                              └─ la tarjeta desaparece
                              └──Rechazar──▶ se descarta; el sello vuelve a Pendientes (sin seleccionar)
```

### Cambios en el pipeline

**`runVectorizacion.ts` deja de escribir.** Sacar de ahí:

- `saveSelloVector` y todo el armado de `reviews`
- `setSellosEnProceso` y `setSelloVectorState`
- las props `saveToSellos` y `requestedSizeById`

Queda como una función pura de "bitmaps → SVGs". **El sello no se toca en ningún momento hasta
que alguien confirma**: si se cierra la pestaña, no queda ningún `EN_PROCESO` colgado.

Para los errores de hoja, en vez de escribir `ERROR` en la base, el `VectorResult` ya trae
`error` y eso alcanza para pintar la tarjeta.

### Store

```ts
export interface ReviewItem {
  id: string;                 // = selloId en la pestaña Pedidos
  selloId: string;
  orderId: string;
  designName: string;
  svg: string;                // en memoria, todavía no subido
  beforeDataUrl: string;      // la base preparada, cacheada (ver §7)
  requestedWidthMm: number;
  requestedHeightMm: number;
  mode: VectorizeMode;        // para bloquear confirmación si no es 'production'
}

// en el store:
reviewQueue: ReviewItem[];
pushReviews: (items: ReviewItem[]) => void;
removeReview: (id: string) => void;
```

`reviewQueue` **sobrevive al cambio de sub-pestaña** (ya vive en el store global, no en el
componente). Los errores y los "sin contenido" siguen en `results` como hoy; a la cola de
revisión solo van los que tienen SVG.

### UI

Cuarta sub-pestaña **"Revisión"** con badge de cantidad, al lado de Pedidos / Lote / Asignar.
Si `reviewQueue.length > 0`, saltar automáticamente a ella al terminar de vectorizar.

Tarjeta (evolución de `VectorResultCard`):

```
┌───────────────────────────────────────────┐
│  [ archivo base ]  │  [ vector SVG ]      │   ← click en cualquiera = lightbox
├───────────────────────────────────────────┤
│  Storz Werk — Cristian Storz              │
│  5.0 × 1.3 cm                             │
│  [ ✓ Confirmar ]  [ ✕ Rechazar ]  [ SVG ] │
└───────────────────────────────────────────┘
```

- El vector se muestra **sobre fondo blanco y también sobre un damero**, con un toggle. Sin eso
  no se ve si quedó fondo pegado, que es justo lo que hay que revisar.
- **Confirmar** → `saveSelloVector({ ...item, mode })` → si `needsReview`, abre el
  `FabricationSizeDialog` **de ese solo sello** → al cerrarse, `removeReview(id)`.
- **Rechazar** → `removeReview(id)` y nada más. No hay nada que borrar del storage porque nunca
  se subió. El sello vuelve a aparecer en Pendientes, **sin seleccionar**.
- **SVG** → descarga suelta (por si se quiere retocar a mano y después subirlo por la pestaña
  "Asignar SVG").
- Acción masiva **"Confirmar todos"**: confirma en orden y encola los modales de medida
  uno atrás de otro — `VectorReviewHost` ya hace el "1 de N", se reusa tal cual.

### Proteger lo que ya se pagó

Los créditos ya se gastaron y el SVG vive **solo en memoria**. Si se recarga la página, se pierde.

- `beforeunload` mientras `reviewQueue.length > 0`, con el mensaje estándar del navegador.
- Botón **"Descargar todos"** en el header de Revisión → ZIP con `zipResults.ts`, que ya existe.
- Avisar con un toast al terminar de vectorizar: *"7 vectores esperando revisión — no cierres la
  pestaña hasta confirmarlos o descargarlos."*

> Alternativa evaluada y descartada: subir el SVG a una carpeta temporal del bucket al
> vectorizar, para que sobreviva a la recarga. Suma el problema de tener que limpiar los
> rechazados y archivos huérfanos si se cierra la pestaña. Para el volumen de esta pestaña
> (decenas por vez, revisadas en el momento) no compensa. Si algún día molesta, es un cambio
> chico y acotado.

---

## 4. Deseleccionar lo ya vectorizado

Dos arreglos:

1. **`run()` en `PendientesTab.tsx:154`** — después del `runVectorizacion`, limpiar la selección:
   ```ts
   store.setSelectedIds([]);
   ```
   Hoy no se limpia nunca; por eso quedaron marcadas después de vectorizar.

2. **Esconder de Pendientes lo que está en revisión.** Con el flujo de §3 el sello sigue
   `Sin Hacer` y sin vector hasta que se confirme, así que `fetchPendientes` lo va a seguir
   trayendo. Filtrar en el render:
   ```ts
   const enRevision = new Set(store.reviewQueue.map((r) => r.selloId));
   const visibles = sellos.filter((s) => !enRevision.has(s.id));
   ```
   Así no se puede vectorizar dos veces lo mismo y pagarlo dos veces.

3. Al confirmar, además de sacarlo de la cola: `store.removeLocal(selloId)` para soltar el
   `SourceImage` y el `PreparedImage` (ver §7 — son varios MB cada uno).

---

## 5. Menú contextual en las tarjetas

Usar `@/components/ui/context-menu`, que ya está en el proyecto y se usa igual en
`src/components/pedidos/Table/cells/CellVector.tsx`.

Va sobre la imagen de `PendienteCard` y de `LoteImageCard`.

| Ítem | Qué hace | Nota |
|---|---|---|
| Abrir imagen en pestaña nueva | `window.open(await resolveStorageDisplayUrl(url, mockupId))` | firma la URL si el bucket es privado |
| Copiar imagen | `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])` | **solo PNG**: convertir por canvas. Requiere contexto seguro (https/localhost). Firefox no lo soporta → toast explicando |
| Guardar imagen | `downloadFile(url, nombre)` de `storage.service.ts` | ya existe |
| Recortar… | abre el `CropEditor` que ya está | dupla del click actual en el badge |
| **Reemplazar imagen…** | §6 | solo en la pestaña Pedidos |
| Volver a la original | limpia `archivo_base_mejorado` | solo visible si hay una imagen mejorada |

**Cuál imagen.** La tarjeta muestra la versión *recortada y con niveles*, pero
"copiar / guardar / abrir" tienen que actuar sobre el **archivo base original** — es el que uno
quiere mandarle a alguien para que lo mejore. Si hace falta, se agrega aparte
"Copiar imagen recortada". Dejarlo explícito en un comentario del componente.

En la pestaña "Lote libre" el menú es el mismo menos los dos ítems de base mejorada, y
"Reemplazar" simplemente cambia el `SourceImage` en memoria.

---

## 6. Reemplazar el archivo base sin perder el original

Caso de uso: llega un archivo base feo, se mejora por fuera de la app, y se quiere vectorizar el
mejorado — **sin perder el original**.

### Migración

`migration_sellos_archivo_base_mejorado.sql`:

```sql
ALTER TABLE public.sellos
  ADD COLUMN IF NOT EXISTS archivo_base_mejorado text,
  ADD COLUMN IF NOT EXISTS archivo_base_mejorado_at timestamptz;

COMMENT ON COLUMN public.sellos.archivo_base_mejorado IS
  'Archivo base retocado a mano que reemplaza al original para vectorizar y previsualizar. '
  'archivo_base nunca se pisa: queda como respaldo del archivo que mandó el cliente.';
```

### Regla

**`archivo_base` es inmutable en este flujo.** Todo lo que necesite "el archivo base útil" pasa
por un helper único:

```ts
// src/lib/vectorizacion/baseFile.ts
export function baseFileUtil(sello: { archivoBase: string; archivoBaseMejorado?: string | null }): string {
  return sello.archivoBaseMejorado?.trim() || sello.archivoBase;
}
```

Aplicarlo en:

- `fetchPendientes` → traer la columna nueva y exponer `archivoBaseMejorado` en `PendingSello`
- `sourceFromSello` → recibe ya resuelto el que corresponda
- `PendienteCard` → la miniatura muestra el mejorado si existe, con badge **"Base mejorada"**

> **Decisión a tomar:** si el resto de la app (Pedidos, Producción) también debe mostrar el
> mejorado. Recomiendo que **sí** — es el archivo con el que realmente se trabaja, y ver uno
> distinto en cada pantalla confunde. Son dos lugares: `src/lib/supabase/mappers.ts:241`
> (`files.baseUrl`) y `production.service.ts:258`. `archivo_base` sigue intacto en la base como
> respaldo. Si se prefiere no tocar nada fuera de esta pestaña, dejarlo para después y anotarlo.

### El diálogo "Reemplazar imagen"

`navigator.clipboard.read()` es incómodo (pide permiso, exige contexto seguro y foco, y en
Firefox no anda para imágenes). Entonces: **un diálogo con tres formas de entrar**, y
`clipboard.read()` como atajo, no como único camino.

```
┌─────────────────────────────────────────────┐
│  Reemplazar imagen base — "Storz Werk"      │
│                                             │
│   ┌───────────────────────────────────┐     │
│   │   Pegá con Ctrl+V, arrastrá       │     │
│   │   o hacé clic para elegir         │     │
│   └───────────────────────────────────┘     │
│        [ Pegar del portapapeles ]           │
│                                             │
│   [ original ]  →  [ nueva ]                │
│   1000×1000        2400×2400                │
│                                             │
│   El archivo original se conserva.          │
│                     [Cancelar] [Reemplazar] │
└─────────────────────────────────────────────┘
```

- El diálogo toma el foco y escucha `paste` (`e.clipboardData.files`) — es el camino que anda en
  todos lados. Mismo patrón que `MockupSlotCard.tsx:498`.
- El botón "Pegar del portapapeles" intenta `navigator.clipboard.read()`; si tira error o no
  encuentra `image/*`, toast: *"No pude leer el portapapeles — pegá con Ctrl+V acá adentro"*.
- Preview lado a lado antes de confirmar, con las medidas de cada una. Avisar en ámbar si la
  nueva es **más chica** que la original (suele ser un error).
- Validar con `isAcceptedImageFile` (`imageSource.ts:22`).

### Guardado

```ts
const path = generateFilePath(orderId, 'base', `mejorada-${Date.now()}.png`, selloId);
const url = await uploadFile('base', file, path);
await supabase.from('sellos').update({
  archivo_base_mejorado: url,
  archivo_base_mejorado_at: new Date().toISOString(),
}).eq('id', selloId);
```

Path nuevo siempre — **nunca** sobrescribir el del original. Después: invalidar el
`SourceImage` y el `PreparedImage` del store (`removeLocal(selloId)`) y volver a preparar, para
que la tarjeta muestre la nueva ya recortada.

**"Volver a la original"** pone `archivo_base_mejorado = null`. El archivo queda en el bucket
(no se borra: ocupa poco y si se arrepienten, está).

---

## 7. Performance y guardrails

- **`toDataURL` en cada render.** `PendienteCard.tsx:73` y `PendientesTab.tsx:199` llaman a
  `canvas.toDataURL('image/png')` en el cuerpo del render. Con 20 tarjetas de canvas de 2–3 MP
  eso re-serializa PNGs completos en cada pintada. Cachear el data URL **una vez** dentro de
  `PreparedImage` (campo `previewDataUrl`, generado en `prepareImage`) y usar ese. Es
  probablemente la razón de que la grilla se sienta pesada.
- **Memoria.** Cada `SourceImage` + `PreparedImage` son varios MB. Con 30 sellos seleccionados
  se van cientos de MB. Llamar a `removeLocal(id)` al confirmar o rechazar (§4.3), y considerar
  `bitmap.close()` en los `ImageBitmap` que ya no se usan.
- **`PendientesTab.tsx` está en 248 líneas**, al borde del límite de 250 de
  `ARCHITECTURE_GUARDRAILS.md`, y §3 y §5 le suman. Extraer antes de tocarlo:
  - `src/lib/vectorizacion/usePendientesRun.ts` — `ensurePrepared`, `toggle`, `run`
  - `src/components/vectorizacion/PendientesTab/PendientesToolbar.tsx` — los botones de arriba
  - `src/components/vectorizacion/PendientesTab/PendientesFooterBar.tsx` — la barra fija
- **`svgSplit.ts` (173 líneas) y `runVectorizacion.ts` (178)** quedan bien; `runVectorizacion`
  además adelgaza al sacarle el guardado (§3).

---

## Orden sugerido

1. **§1** — guardia de modo test + banner + limpiar los datos ensuciados. Antes que nada.
2. **§2** — auto-recorte, empezando por el test del PNG transparente.
3. **§3 + §4** — cola de revisión y deselección (van juntos: comparten el refactor de
   `runVectorizacion`).
4. **§7** — cache del `toDataURL` y extracción de `PendientesTab` (hacerlo *antes* de §5, para
   no meter el menú contextual en un archivo que ya está en el límite).
5. **§5 + §6** — menú contextual y base mejorada.

## Checklist de cierre

- [ ] `npm run typecheck` limpio
- [ ] `npm run lint` limpio (`--max-warnings 0`)
- [ ] `npm run test` en verde, con los tests nuevos de `imagePrep.test.ts` (§2)
- [ ] Ningún archivo supera 250 líneas
- [ ] Migración `archivo_base_mejorado` aplicada en Supabase
- [ ] Probado el ciclo completo en `mode: 'test'`: vectorizar → revisar → **rechazar** → el sello
      vuelve a Pendientes sin seleccionar y sin haber tocado la base
- [ ] Probado **confirmar** en `mode: 'production'` con un solo sello antes de una tanda grande
- [ ] Entrada de changelog: §3 y §6 son visibles para el equipo y cambian el flujo
      (`src/lib/changelog/entries.ts`, `.cursor/rules/changelog-novedades.mdc`)
