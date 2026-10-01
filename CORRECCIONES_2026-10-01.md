# Correcciones 2026-10-01 — instrucciones para Cursor

> **Leé esto completo antes de tocar código.** Cada sección dice: qué reportó el usuario, cuál es la causa (ya investigada contra el código **y** contra la base de producción), qué decidió el usuario, y exactamente qué cambiar.
> No inventes reglas de negocio nuevas: todo lo que no está acá, preguntá (regla de `AGENTS.md` §0).
>
> Orden sugerido de trabajo (son independientes, se pueden commitear por separado):
> 1. §1 Modal de medida (escritura libre) — chico.
> 2. §2 Regla del 36.5 (lado chico al tope) — chico, con tests.
> 3. §3 Duplicados en Revisión de vectorización — medio.
> 4. §4 Stock (migración SQL + servicio + pantalla) — grande.
> 5. §5 Docs + changelog.
> 6. §6 Verificación final.
>
> Al terminar: `npm run typecheck`, `npm run lint`, `npm test` tienen que pasar en verde.

---

## 1. Modal "Confirmar medida de fabricación": permitir escribir libre

### Problema reportado
En el modal de verificación de medida solo se puede ir cambiando de a 0.1 con las flechitas; no se puede escribir un número a mano. Como está en milímetros, es tediosísimo.

### Causa (verificada)
Archivo: `src/components/shared/VectorSizeConfirmDialog.tsx`.

```tsx
<Input type="number" step="0.1" value={widthMm.toFixed(1)}
  onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 0)} />
```

- El input es **controlado con `value={widthMm.toFixed(1)}`**: en cada tecla el valor se re-formatea. Si borrás para escribir, `parseFloat('') || 0` → `0` → el campo muestra `0.0`. Si escribís `4`, pasa a `4.0` y el cursor queda al final, entonces el siguiente dígito queda como `4.05`, etc.
- Encima, con la proporción bloqueada, cada tecla recalcula el otro eje.
- Resultado: solo funcionan las flechitas (step 0.1).

### Qué hacer
Reescribir el manejo de los dos inputs (Ancho y Alto) con **estado de texto separado del número** (patrón "draft"):

1. Agregar dos helpers arriba del componente (en el mismo archivo):

```ts
/** "36,5" o "36.5" → 36.5. Vacío / inválido / ≤0 → null. */
function parseMm(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Muestra hasta 1 decimal sin ceros de más: 36.5 → "36.5", 40 → "40". */
function formatMm(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 10) / 10);
}
```

2. Estado: además de `widthMm` / `heightMm` (números), agregar `widthText` / `heightText` (strings).
   - En el `useEffect` que resetea al abrir: setear ambos números **y** `setWidthText(formatMm(resolution.widthMm))`, `setHeightText(formatMm(resolution.heightMm))`.
   - Crear un helper interno `setBoth(w: number, h: number)` que setea los 4 estados (números + textos formateados). Usarlo en `handleUseRequested`, `handleUseMeasured` y en el reset.

3. Inputs:
   - `type="text"` + `inputMode="decimal"` (para teclado numérico en celular). **Sacar** `step` y `min`.
   - `value={widthText}` / `value={heightText}`.
   - `onChange` del ancho:
     ```ts
     const onWidthText = (raw: string) => {
       setWidthText(raw);                 // nunca reformatear mientras escribe
       const n = parseMm(raw);
       if (n == null) return;             // texto incompleto ("", "3.", "abc"): no tocar números
       if (locked) {
         const next = applyAspectRatioLock('width', n, lockRatio);
         setWidthMm(next.widthMm);
         setHeightMm(next.heightMm);
         setHeightText(formatMm(next.heightMm)); // solo el OTRO campo se reformatea
       } else {
         setWidthMm(n);
       }
     };
     ```
     Análogo para el alto (`onHeightText`, eje `'height'`).
   - `onBlur` de cada input: reformatear **su** texto desde el número (`setWidthText(formatMm(widthMm))`). Si el texto quedó inválido, vuelve al último número válido.
   - `onKeyDown`: si `e.key === 'Enter'` y la medida es válida → `void handleConfirm()`.
   - Agregar `onFocus={(e) => e.currentTarget.select()}` para que al hacer click se seleccione todo y se pueda tipear encima directo.
   - Opcional (no obligatorio): flechas ↑/↓ del teclado suman/restan 0.1 (Shift = 1). Si lo hacés, mantené la lógica de proporción.

4. Validación del botón "Confirmar medida": deshabilitar si `parseMm(widthText) == null || parseMm(heightText) == null` (además de `saving`).

5. Al confirmar, redondear a 0.1 mm: `onConfirm({ widthMm: Math.round(widthMm * 10) / 10, heightMm: Math.round(heightMm * 10) / 10 })`.

6. Borrar las funciones viejas `handleWidthChange` / `handleHeightChange` si quedan sin uso (lint con `--max-warnings 0`).

### Dónde se usa este modal (no hace falta tocarlos, solo probarlos)
- `src/components/shared/FabricationSizeDialogHost.tsx` (host global vía `useFabricationSizeDialogStore`).
- Lo abren: `src/components/pedidos/Table/cells/CellVector.tsx`, `src/components/produccion/Table/cells/CellVector.tsx`, `src/components/vectorizacion/shared/VectorReviewHost.tsx`.

### Criterio de aceptación
- Click en "Ancho", se selecciona todo, tipeo `45,6` → queda `45,6` tal cual mientras escribo; con proporción bloqueada el Alto se actualiza en vivo.
- Borrar todo el campo no lo convierte en `0.0`.
- Enter confirma. Blur con texto inválido vuelve al último valor válido.

---

## 2. Regla del 36.5: sellos pedidos "al tope" con vector rectangular

### Problema reportado
Sellos pedidos con medida cuadrada (ej. **40×40**) cuyo vector termina siendo más rectangular: hoy la medida queda chica (ej. 40×32). Se quiere que **el lado más chico del vector vaya a 36.5** (tope de la planchuela 38) y el otro lado salga por proporción, así el sello queda lo más cercano posible al 40×40 pedido.

### Causa (verificada)
- `src/lib/vectorizacion/saveVector.ts` → `applyPhysicalSize()` (`svgSize.ts`) encaja el SVG **dentro** de la caja pedida (40×40) con `containSize`. Un vector de proporción 1.25 queda 40×32.
- Después `resolveFabricationSize()` (`src/lib/programas/fabricationSize.ts`) solo mira si el **lado menor medido supera el tope** (`exceedsTope`). 32 < 36.5 → no supera → se guarda 40×32 tal cual (o abre popup por `large_diff` si el desvío es ≥6mm, sugiriendo igual 40×32).
- Lo mismo pasa al subir un SVG a mano desde Pedidos/Producción (`CellVector.tsx`), porque usan la misma función.

Topes vigentes (`KNOWN_MAX_FABRICATION_MM`): planchuela 12 → 11.5, 19 → 18, 25 → 24, 38 → 36.5 mm. La planchuela se elige por el lado menor **pedido** (`resolvePlanchuelaRef`: ≤12mm→12, ≤19→19, ≤25→25, ≤40→38, más→63).

### Decisión del usuario (2026-10-01)
> **Lado chico = tope.** Cuando lo pedido supera el tope de su planchuela (ej. 40×40 con tope 36.5), el lado chico del vector se lleva exactamente al tope y el otro sale por proporción (40×32 → 45.6×36.5). **Se guarda directo, sin popup.** El popup solo aparece si el lado largo resultante se desvía **≥6 mm** del lado largo pedido (ej. un vector muy alargado: 40×40 pedido con vector 2:1 → 73×36.5 → popup).

La regla aplica a **cualquier planchuela** cuando el lado menor pedido > tope (ej. 25×25 → lado chico 24; 12×12 → 11.5). Cuando lo pedido ya entra en el tope (ej. 50×29 en planchuela 38, o 40×30), **no cambia nada**: sigue la lógica actual.

### Qué hacer en `src/lib/programas/fabricationSize.ts`

1. Agregar el nuevo motivo de revisión:
```ts
export type FabricationReviewReason = 'exceeds_tope' | 'large_diff' | 'tope_long_side_diff';
```

2. Agregar y exportar la función (debajo de `clampToTopePreservingAspect`):
```ts
/**
 * Escala el rectángulo (sin deformar) para que su lado MENOR quede exactamente en el tope.
 * Puede agrandar o achicar. Se usa cuando lo pedido ya supera el tope de la planchuela.
 */
export function scaleMinorSideToTope(
  widthMm: number,
  heightMm: number,
  maxUsableMm: number | null,
): { widthMm: number; heightMm: number } {
  const minor = Math.min(widthMm, heightMm);
  if (maxUsableMm == null || !(minor > 0)) return { widthMm, heightMm };
  const k = maxUsableMm / minor;
  return { widthMm: widthMm * k, heightMm: heightMm * k };
}
```

3. En `resolveFabricationSize`, **después** del bloque `if (naturalWidth <= 0 || naturalHeight <= 0) { ... }` y **antes** de calcular `naturalMinor/exceedsTope/largeDiff`, insertar:
```ts
  // Pedido "al tope" (ej. 40×40 en planchuela 38): el lado chico del vector va al tope y el
  // otro sale por proporción. Solo se pide revisión si el lado largo se desvía ≥6mm de lo pedido.
  const requestedMinor = Math.min(requestedWidthMm, requestedHeightMm);
  const requestedExceedsTope = maxUsableMm != null && requestedMinor > maxUsableMm + 0.05;
  if (requestedExceedsTope && measured != null) {
    const target = scaleMinorSideToTope(naturalWidth, naturalHeight, maxUsableMm);
    const requestedMajor = Math.max(requestedWidthMm, requestedHeightMm);
    const targetMajor = Math.max(target.widthMm, target.heightMm);
    const longSideOff = Math.abs(targetMajor - requestedMajor) >= LARGE_SIZE_DIFF_MM;
    return {
      widthMm: target.widthMm,
      heightMm: target.heightMm,
      tipoPlanchuela,
      maxUsableMm,
      needsReview: longSideOff,
      reviewReason: longSideOff ? 'tope_long_side_diff' : null,
      measuredWidthMm,
      measuredHeightMm,
    };
  }
```
   - Si `measured == null` (no se pudo medir el SVG) se mantiene el comportamiento actual (popup `exceeds_tope` con la sugerencia recortada). No cambiar eso.
   - Actualizar el JSDoc de `resolveFabricationSize` con la nueva regla.

### Qué hacer en `src/components/shared/VectorSizeConfirmDialog.tsx`
1. Importar `scaleMinorSideToTope`.
2. Mensaje para el nuevo motivo. Reemplazar el ternario `resolution.reviewReason === 'large_diff' ? ... : ...` por tres casos:
   - `'large_diff'` → texto actual.
   - `'tope_long_side_diff'` → `Lo pedido supera el tope de la planchuela {tipoPlanchuela}mm ({maxUsableMm}mm). Se llevó el lado chico a {maxUsableMm}mm y el largo quedó en {max(widthMm,heightMm).toFixed(1)}mm, que se aleja 6mm o más de lo pedido. Revisá la medida.`
   - default (`'exceeds_tope'`) → texto actual.
3. `handleUseRequested` ("Acercar a lo pedido") debe aplicar la misma regla:
```ts
  const handleUseRequested = () => {
    const max = resolution.maxUsableMm;
    const reqMinor = Math.min(requestedWidthMm, requestedHeightMm);
    if (max != null && reqMinor > max + 0.05) {
      // proporción del SVG, lado chico al tope
      const s = scaleMinorSideToTope(lockRatio, 1, max);
      setBoth(s.widthMm, s.heightMm);
      return;
    }
    const fitted = fitAspectInBox(lockRatio, requestedWidthMm, requestedHeightMm);
    const clamped = clampToTopePreservingAspect(fitted.widthMm, fitted.heightMm, max);
    setBoth(clamped.widthMm, clamped.heightMm);
  };
```
   (`setBoth` es el helper de §1.)

### Tests — `src/lib/programas/fabricationSize.test.ts`
Actualizar los que cambian de comportamiento:
- `'40×40 medido 40×40 (tope 36.5) → ...'` → ahora: `needsReview === false`, `reviewReason === null`, 36.5×36.5.
- `'25×25 medido 25×25 → sugiere 24×24'` → ahora `needsReview === false`, 24×24.

Agregar:
```ts
it('40×40 pedido, vector 40×32 → lado chico a 36.5, largo 45.625, sin popup', () => {
  const r = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 32 });
  expect(r.tipoPlanchuela).toBe(38);
  expect(r.needsReview).toBe(false);
  expect(r.heightMm).toBeCloseTo(36.5, 5);
  expect(r.widthMm).toBeCloseTo(36.5 * (40 / 32), 5);
});

it('40×40 pedido, vector 40×36.4 → 40.1×36.5 sin popup (agranda apenas)', () => {
  const r = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 36.4 });
  expect(r.needsReview).toBe(false);
  expect(r.heightMm).toBeCloseTo(36.5, 5);
  expect(r.widthMm).toBeCloseTo(36.5 * (40 / 36.4), 5);
});

it('40×40 pedido, vector 2:1 (40×20) → 73×36.5 con popup tope_long_side_diff', () => {
  const r = resolveFabricationSize(40, 40, { widthMm: 40, heightMm: 20 });
  expect(r.needsReview).toBe(true);
  expect(r.reviewReason).toBe('tope_long_side_diff');
  expect(r.heightMm).toBeCloseTo(36.5, 5);
  expect(r.widthMm).toBeCloseTo(73, 5);
});

it('vector vertical (32×40) en pedido 40×40 → el lado chico (ancho) va a 36.5', () => {
  const r = resolveFabricationSize(40, 40, { widthMm: 32, heightMm: 40 });
  expect(r.widthMm).toBeCloseTo(36.5, 5);
  expect(r.heightMm).toBeCloseTo(36.5 * (40 / 32), 5);
});

it('40×30 pedido (lado menor 30 < tope) → NO aplica la regla nueva', () => {
  const r = resolveFabricationSize(40, 30, { widthMm: 40, heightMm: 30 });
  expect(r.needsReview).toBe(false);
  expect(r.widthMm).toBeCloseTo(40, 5);
  expect(r.heightMm).toBeCloseTo(30, 5);
});

it('scaleMinorSideToTope agranda y achica', () => {
  expect(scaleMinorSideToTope(40, 32, 36.5).heightMm).toBeCloseTo(36.5, 5);
  expect(scaleMinorSideToTope(50, 40, 36.5).heightMm).toBeCloseTo(36.5, 5);
  expect(scaleMinorSideToTope(10, 10, null)).toEqual({ widthMm: 10, heightMm: 10 });
});
```
Los demás tests existentes (50×29, 50×10, 50×20, 50×18, 25×11, 50×5) **no deben cambiar** — si alguno falla, la implementación está mal.

### Criterio de aceptación
Confirmar en Vectorización → Revisión un sello pedido 40×40 cuyo diseño es rectangular: se guarda solo (sin popup) con `ancho_fabricacion_mm ≈ 45.6`, `largo_fabricacion_mm = 36.5` (el service ya guarda ancho = mayor, largo = menor).

---

## 3. Duplicados en Vectorización → Revisión

### Problema reportado
Aparecen sellos duplicados en la pestaña Revisión. Al aceptar uno, desaparece también el duplicado. Duda: ¿se está vectorizando dos veces (pagando dos veces)?

### Diagnóstico (verificado en código)
- **Dentro de una misma corrida NO se vectoriza doble**: `packSheets` (`sheetPacking.ts`) pone cada imagen una sola vez y `runVectorizacion` hace una llamada a la API por hoja. Revisado.
- Los duplicados tienen **el mismo `id`** (`ReviewItem.id = selloId`, ver `usePendientesRun.ts`). Por eso al confirmar/rechazar uno se van los dos: `removeReview(id)` filtra por id.
- O sea: un duplicado = **el mismo sello entró a la cola en dos corridas distintas = se pagó la vectorización dos veces.**
- Cómo puede pasar (todo en el código actual, introducido con la cola persistente del commit `d90890d` de hoy):
  1. **`pushReviews` no deduplica** (`src/lib/state/vectorizacion.store.ts`): agrega al final sin mirar si ese sello ya está.
  2. **Carrera con la hidratación**: al abrir `/vectorizacion`, la cola guardada en IndexedDB se carga async (`src/app/vectorizacion/index.tsx`). Mientras tanto la pestaña Pedidos ya muestra como "pendientes" los sellos que están en esa cola (el filtro `visibles` en `usePendientesRun.ts` mira `store.reviewQueue`, que todavía está vacía). Si se seleccionan y se vectorizan, entran de nuevo.
  3. **Varias pestañas del navegador**: todas comparten la misma IndexedDB pero cada una tiene su cola en memoria; la pestaña B no sabe lo que hay en la cola de la pestaña A, muestra esos sellos como pendientes y deja vectorizarlos otra vez. Además la última pestaña que guarda pisa la cola de la otra (se pierden ítems).
  4. **El sello sigue "pendiente" en la base mientras está en Revisión** (recién pasa a `VECTORIZADO` al confirmar), así que `run()` no tiene ninguna barrera antes de llamar a la API.
  5. Una vez que hay un duplicado en IndexedDB, `hydrateReviewQueue` lo restaura tal cual (no deduplica) en cada recarga.
- Bug extra encontrado en el mismo flujo: `RevisionTab.confirmOne` usa `store.fabricationReviews` del render (closure vieja). En "Confirmar todos" cada confirmación pisa la anterior → se pierden modales de medida pendientes. Mismo patrón en `AsignarTab.tsx` línea ~151.

### Qué hacer

#### 3.1 Helper puro + test — nuevo archivo `src/lib/vectorizacion/reviewQueueDedupe.ts`
```ts
import type { ReviewItem } from './types';

/** Un ítem por sello. Si se repite, gana el último (el más nuevo). Mantiene el orden de aparición del ganador. */
export function dedupeReviewItems(items: ReviewItem[]): ReviewItem[] {
  const lastIndex = new Map<string, number>();
  items.forEach((item, index) => lastIndex.set(item.selloId, index));
  return items.filter((item, index) => lastIndex.get(item.selloId) === index);
}

/** Agrega `incoming` a `current` reemplazando los sellos que ya estaban. Devuelve también los ids reemplazados. */
export function mergeReviewItems(
  current: ReviewItem[],
  incoming: ReviewItem[],
): { queue: ReviewItem[]; replaced: string[] } {
  const fresh = dedupeReviewItems(incoming);
  const ids = new Set(fresh.map((item) => item.selloId));
  const replaced = current.filter((item) => ids.has(item.selloId)).map((item) => item.selloId);
  const kept = dedupeReviewItems(current).filter((item) => !ids.has(item.selloId));
  return { queue: [...kept, ...fresh], replaced };
}
```
Test `src/lib/vectorizacion/reviewQueueDedupe.test.ts` (vitest): dedupe de [A1, B, A2] → [B, A2]; merge de current [A, B] con incoming [B', C] → [A, B', C] y `replaced = ['B']`; merge con current que ya tiene duplicados los limpia.

#### 3.2 Store — `src/lib/state/vectorizacion.store.ts`
- `pushReviews(items)`: usar `mergeReviewItems(get().reviewQueue, items)`. Si `replaced.length > 0` → `console.warn('[vectorizacion] Sello ya estaba en Revisión, se reemplazó:', replaced)`. Setear `queue`, persistir.
- `hydrateReviewQueue(items)`:
  - Caso cola vacía: `set({ reviewQueue: dedupeReviewItems(items), reviewQueueHydrated: true })`; si la cantidad cambió, persistir.
  - Caso cola en memoria con datos: `mergeReviewItems(items, current).queue` (la sesión gana). Persistir si cambió.
- `removeReview(id)` queda igual.
- **Sincronización entre pestañas** con `BroadcastChannel` (a nivel módulo, fuera del `create`):
```ts
const REVIEW_CHANNEL = 'alcohn-vectorizacion-review';
const reviewChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(REVIEW_CHANNEL) : null;
```
  - En `schedulePersistReviewQueue`, cuando dispara el timeout: además de `saveReviewQueue(queue)`, hacer `reviewChannel?.postMessage({ type: 'queue', items: queue })`.
  - Después de crear el store: `reviewChannel?.addEventListener('message', (event) => { if (event.data?.type !== 'queue' || !Array.isArray(event.data.items)) return; useVectorizacionStore.setState({ reviewQueue: dedupeReviewItems(event.data.items), reviewQueueHydrated: true }); });`
  - **No** volver a persistir ni re-emitir al recibir (evita eco infinito). Usar `setState` directo, no `pushReviews`.

#### 3.3 Corrida — `src/lib/vectorizacion/usePendientesRun.ts`
- Mientras `reviewQueueHydrated` sea `false`, tratar la lista como cargando: exponer `loading: loading || !reviewQueueHydrated` (leer `useVectorizacionStore((s) => s.reviewQueueHydrated)`). Así no se muestran ni se pueden seleccionar sellos antes de saber qué hay en Revisión.
- Reescribir el arranque de `run()` con barreras **antes de gastar créditos**:
```ts
  const run = async () => {
    const state = useVectorizacionStore.getState();
    if (state.running) return;                       // doble click / doble disparo
    if (!state.reviewQueueHydrated) {
      toast({ title: 'Esperá un segundo', description: 'Todavía se está cargando la cola de Revisión.' });
      return;
    }
    const inReview = new Set(state.reviewQueue.map((item) => item.selloId));
    let candidatos = selectedSellos.filter((sello) => !inReview.has(sello.id));
    // Otro usuario / otra PC pudo haberlo confirmado mientras tanto.
    try {
      const yaVectorizados = await filterAlreadyVectorizedSelloIds(candidatos.map((s) => s.id));
      candidatos = candidatos.filter((s) => !yaVectorizados.has(s.id));
    } catch (error) {
      console.warn('[vectorizacion] No se pudo verificar estado antes de vectorizar:', error);
    }
    const omitidos = selectedSellos.length - candidatos.length;
    if (omitidos > 0) {
      toast({ title: `${omitidos} sello(s) omitidos`, description: 'Ya estaban en Revisión o ya vectorizados.' });
    }
    const images = candidatos
      .map((sello) => state.prepared[sello.id])
      .filter((img): img is NonNullable<typeof img> => Boolean(img));
    if (!images.length) {
      store.setSelectedIds([]);
      return;
    }
    store.setRunning(true);
    store.clearRun();
    try {
      const outcome = await runVectorizacion({ images, mode: store.mode, upscale: store.maximizeResolution, onProgress: store.setProgress });
      // ... resto igual, pero buscando el sello en `candidatos` (no en selectedSellos)
```
  - Importar `filterAlreadyVectorizedSelloIds` desde `./vectorizacion.service`.
  - El armado de `reviews` queda igual (ahora `pushReviews` igual deduplica como última red).
- `src/components/vectorizacion/PendientesTab/PendientesTab.tsx`: `canRun={selectedPrepared.length > 0 && reviewQueueHydrated}`.

#### 3.4 Revisión — `src/components/vectorizacion/RevisionTab/RevisionTab.tsx`
- En `confirmOne`, reemplazar `...store.fabricationReviews` por `...useVectorizacionStore.getState().fabricationReviews`.
- En `confirmAll`: antes de cada `confirmOne(item)`, saltear si el ítem ya no está en `useVectorizacionStore.getState().reviewQueue` (evita confirmar dos veces el mismo sello si la cola cambió).
- `src/components/vectorizacion/AsignarTab/AsignarTab.tsx` (~línea 151): `setFabricationReviews([...useVectorizacionStore.getState().fabricationReviews, ...reviews])` y borrar el selector `fabricationReviews` si queda sin uso.

#### 3.5 Lo que este fix NO cubre (pregunta abierta, no implementar)
Dos **PCs distintas** (o dos usuarios) pueden seguir vectorizando el mismo sello si el primero todavía no confirmó, porque la cola vive en el navegador de cada uno. Solucionarlo implica marcar el sello en la base al vectorizar (ej. `estado_vectorizacion = 'EN_PROCESO'` y ocultarlo de pendientes), lo que cambia la máquina de estados y necesita una regla para liberar sellos "colgados" si se borra el navegador. **Registrar como `Q-VEC-006` en `docs/14-open-questions/vectorizacion.md`** (ver §5) y no implementarlo sin respuesta.

### Criterio de aceptación
- Abrir `/vectorizacion` con cola guardada: la grilla de Pedidos muestra "Cargando…" hasta que hidrata; los sellos en Revisión no aparecen como pendientes.
- Abrir dos pestañas: vectorizar en una → en la otra aparecen en Revisión y desaparecen de Pendientes sin recargar.
- Si ya hay duplicados guardados en IndexedDB, al recargar quedan uno por sello.
- "Confirmar todos" con varios que necesitan medida → se abren todos los modales en cola (1 de N).

---

## 4. Stock: el cálculo está mal y el número queda inflado

### Problema reportado
Verificar si el stock se calcula bien o si se infla todo, y dejarlo realmente funcional.

### Diagnóstico con datos reales de producción (consultado 2026-10-01)

**4.a — Se pierde consumo cuando un insumo llega a 0 (causa principal del inflado).**
`consume_stock_for_order` (SQL, disparado por `trigger_consume_stock_on_envio` al pasar la orden a `Seguimiento Enviado`) descuenta `least(stock, requerido)`: si no hay stock, **no registra el consumo** (regla actual BR-STK-002 "nunca negativo", reforzada por el CHECK `stock_items_quantity_check (quantity >= 0)`). El sello igual se armó y se mandó con su mango/tubo/varilla. Cuando después alguien carga stock nuevo, el número arranca sin haber restado lo ya usado → **queda inflado**.

Consumo esperado (BOM × ítems de órdenes con descuento) vs. registrado, por mes en que se descontó:

| Mes | Sellos esperados | Mangos registrados | Varillas registradas | Tubos 80 esperados | Tubos 80 registrados |
|---|---|---|---|---|---|
| 2026-06 | 213 | 213 | 213 | 211 | 179 |
| 2026-07 | 217 | **75** | 216 | 214 | **101** |
| 2026-08 | 229 | **170** | **194** | 228 | 228 |
| 2026-09 | 221 | **165** | **0** | 218 | **137** |
| 2026-10 | 12 | 12 | **0** | 12 | **0** |

Total histórico perdido: ~878 mangos, ~668 tubos 80mm, ~495 tuercas, ~344 prisioneros, ~269 varillas (parte es del backfill de mayo). Hoy: `VARILLA = 0` y `TUBO_80MM = 0` en el sistema mientras se siguen mandando sellos; `MANGO = 184` está sobrestimado.

**4.b — Lógica duplicada TS + SQL, con escrituras no atómicas.**
`OrdersTable.handleEnvioEstadoChange` llama a `consumeStockForOrderWhenTrackingSent` (TS) **antes** de actualizar la orden, y después el trigger SQL intenta de nuevo (lo frena la idempotencia por movimientos `OUT`). El TS:
- no tiene guarda de idempotencia propia,
- lee la cantidad y escribe el valor absoluto (`update quantity = X`) → si dos personas mueven stock a la vez se pisa,
- si falta stock, no descuenta nada y deja que el trigger descuente "lo que haya" (otra vez 4.a).
Lo mismo con `applyStockInboundFromReplenishTask` (lee → suma → escribe) y `setStockQuantity` (ajuste manual sin registrar movimiento — AUD-INC-015).

**4.c — La demanda pendiente incluye órdenes viejas y órdenes ya descontadas.**
`getPendingShipmentStockDemand` suma la BOM de todos los ítems de órdenes con `estado_envio` nulo o distinto de `Seguimiento Enviado`, sin filtro de antigüedad (Q-STK-003 ya respondida: más de 2 meses está mal salvo deudores) y sin excluir órdenes que ya tuvieron descuento (ej. volvieron atrás por Rehacer: el stock ya se descontó, pero vuelven a contar como demanda). Además hace `.in('orden_id', [~180 ids])` en la URL (frágil).

**4.d — La alerta de reposición ignora el negativo.** `syncStockReplenishTasksForCurrentUser` no alerta si `needed <= 0`, aunque el stock esté en negativo.

### Decisiones del usuario (2026-10-01)
1. **Permitir stock negativo.** Siempre se registra el consumo completo. Negativo = "se usó más de lo cargado: falta cargar un ingreso o hacer un conteo". Se muestra en rojo.
2. **Los insumos se montan al empaquetar/enviar.** El descuento se mantiene al pasar a `Seguimiento Enviado`, y la demanda pendiente = todo lo no enviado (incluye fabricados y deudores).
3. (Ya respondido en Q-STK-003) Órdenes de más de 2 meses no cuentan como demanda, **salvo que tengan ítems `Deudor`**.

### 4.1 Migración SQL — crear `migration_stock_consumo_completo.sql` en la raíz del repo
Seguir la convención de los otros `migration_*.sql`. Aplicarla en Supabase (proyecto `dgbyrejfcqearevvzdmf`) **después de revisarla**; tiene que ser idempotente (`create or replace`, `drop ... if exists`).

```sql
-- Stock: consumo completo (permite negativo), BOM única en SQL, demanda pendiente y RPCs atómicas.
-- Decisión 2026-10-01: ver docs/04-business-rules/stock.md (BR-STK-002/003/006).

-- 1) Permitir cantidades negativas (negativo = faltante a cargar/contar).
alter table public.stock_items drop constraint if exists stock_items_quantity_check;

-- 2) BOM por ítem: única fuente de verdad (consumo y demanda).
create or replace function public.stock_bom_for_item(p_item_type text, p_tipo text, p_item_config jsonb)
returns table(item_key text, qty int)
language sql
immutable
set search_path = public
as $$
  select k, 1
  from unnest(
    case
      when coalesce(p_item_type, 'SELLO') = 'ABECEDARIO' or coalesce(p_tipo, '') = 'ABC'
        then array['TUBO_125MM','MANGO','VARILLA','PRISIONERO','TUERCA','SOPORTE_ABECEDARIO','CAJA_ABECEDARIO']
      when p_item_type = 'SOLDADOR'
        then case when coalesce(p_item_config, '{}'::jsonb)->>'soldadorPower' = '200W'
                  then array['SOLDADOR_ADAPTADO_200W'] else array['SOLDADOR_ADAPTADO_100W'] end
      when p_item_type = 'MANGO_GOLPE' then array['MANGO_GOLPE']
      when p_item_type = 'BASE_REMACHADORA' then array['BASE_REMACHADORA','ALUMINIO_PARA_BASE']
      else array['TUBO_80MM','PRISIONERO','VARILLA','MANGO','TUERCA']
    end
  ) as k;
$$;

-- 3) Helper interno: descuenta y registra OUT (atómico).
create or replace function public._stock_apply_out(
  p_item_key text, p_qty int, p_note text, p_order_id uuid, p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_qty is null or p_qty <= 0 then return; end if;
  update public.stock_items set quantity = quantity - p_qty
   where item_key = p_item_key
  returning id into v_id;
  if v_id is null then return; end if;
  insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
  values (v_id, 'OUT', p_qty, p_note, p_order_id, p_user);
end;
$$;
revoke all on function public._stock_apply_out(text, int, text, uuid, uuid) from public, anon, authenticated;

-- 4) Consumo por orden: SIEMPRE registra la BOM completa (puede dejar negativo).
create or replace function public.consume_stock_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_user_id uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  r record;
  v_raw_key text;
  v_avail_adapt int;
  v_avail_raw int;
  v_from_adapt int;
  v_from_raw int;
begin
  if p_order_id is null then return; end if;

  -- Serializa llamadas concurrentes para la misma orden.
  perform pg_advisory_xact_lock(hashtext('consume_stock_for_order:' || p_order_id::text));

  -- Idempotencia: una sola vez por orden.
  if exists (
    select 1 from public.stock_movements
     where order_id = p_order_id and movement_type = 'OUT'
  ) then
    return;
  end if;

  v_label := substring(p_order_id::text from 1 for 8);

  for r in
    select b.item_key, sum(b.qty)::int as qty
      from public.sellos s
      cross join lateral public.stock_bom_for_item(s.item_type, s.tipo, s.item_config) b
     where s.orden_id = p_order_id
     group by b.item_key
  loop
    if r.item_key in ('SOLDADOR_ADAPTADO_100W', 'SOLDADOR_ADAPTADO_200W') then
      -- Primero adaptados disponibles, después crudos disponibles (se adaptan),
      -- y lo que no alcanza queda como negativo en el ADAPTADO.
      v_raw_key := replace(r.item_key, '_ADAPTADO', '');
      select greatest(quantity, 0) into v_avail_adapt from public.stock_items where item_key = r.item_key for update;
      select greatest(quantity, 0) into v_avail_raw   from public.stock_items where item_key = v_raw_key  for update;
      v_from_adapt := least(coalesce(v_avail_adapt, 0), r.qty);
      v_from_raw   := least(coalesce(v_avail_raw, 0), r.qty - v_from_adapt);
      perform public._stock_apply_out(
        r.item_key, r.qty - v_from_raw,
        'Consumo soldador adaptado por envío (' || v_label || ') [auto]', p_order_id, v_user_id);
      perform public._stock_apply_out(
        v_raw_key, v_from_raw,
        'Consumo para adaptar soldador y enviar (' || v_label || ') [auto]', p_order_id, v_user_id);
    else
      perform public._stock_apply_out(
        r.item_key, r.qty,
        'Consumo por envío (' || v_label || ') [auto]', p_order_id, v_user_id);
    end if;
  end loop;
end;
$$;
-- El trigger trg_consume_stock_on_envio / trigger_consume_stock_on_envio NO se toca.

-- 5) Demanda pendiente (BR-STK-003 actualizada).
create or replace function public.get_pending_stock_demand()
returns table(item_key text, qty bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.item_key, sum(b.qty)::bigint
    from public.sellos s
    join public.ordenes o on o.id = s.orden_id
    cross join lateral public.stock_bom_for_item(s.item_type, s.tipo, s.item_config) b
   where (o.estado_envio is null or o.estado_envio <> 'Seguimiento Enviado')
     -- Q-STK-003: más de 2 meses ya se entregó, salvo deudores.
     and (o.created_at >= now() - interval '60 days' or s.estado_venta = 'Deudor')
     -- Si la orden ya tuvo descuento (p. ej. volvió atrás por Rehacer), sus insumos ya se restaron.
     and not exists (
       select 1 from public.stock_movements m
        where m.order_id = o.id and m.movement_type = 'OUT'
     )
   group by b.item_key;
$$;
grant execute on function public.get_pending_stock_demand() to authenticated;

-- 6) Conteo físico (reemplaza el "Guardar" manual): deja la cantidad contada y registra ADJUSTMENT.
create or replace function public.adjust_stock_count(p_item_key text, p_new_quantity int, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_delta int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'El conteo no puede ser negativo';
  end if;
  select id, quantity into v_row from public.stock_items where item_key = p_item_key for update;
  if not found then raise exception 'Ítem de stock inexistente: %', p_item_key; end if;
  v_delta := p_new_quantity - v_row.quantity;
  if v_delta = 0 then return p_new_quantity; end if;
  update public.stock_items set quantity = p_new_quantity where id = v_row.id;
  insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
  values (
    v_row.id, 'ADJUSTMENT', abs(v_delta),
    format('Conteo físico: %s → %s (%s%s)', v_row.quantity, p_new_quantity,
           case when v_delta > 0 then '+' else '-' end, abs(v_delta))
      || coalesce(' · ' || nullif(trim(p_note), ''), ''),
    null, auth.uid()
  );
  return p_new_quantity;
end;
$$;
grant execute on function public.adjust_stock_count(text, int, text) to authenticated;

-- 7) Ingreso de stock atómico (tarea de reposición y futuros ingresos).
create or replace function public.add_stock_inbound(p_item_key text, p_quantity int, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_new int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Ingresá una cantidad mayor a 0.'; end if;
  update public.stock_items set quantity = quantity + p_quantity
   where item_key = p_item_key
  returning id, quantity into v_id, v_new;
  if v_id is null then raise exception 'Ítem de stock inexistente: %', p_item_key; end if;
  insert into public.stock_movements (stock_item_id, movement_type, quantity, note, order_id, created_by)
  values (v_id, 'IN', p_quantity, coalesce(nullif(trim(p_note), ''), 'Ingreso de stock'), null, auth.uid());
  return v_new;
end;
$$;
grant execute on function public.add_stock_inbound(text, int, text) to authenticated;
```

Notas para la migración:
- `stock_items.updated_at` lo toca el trigger `trg_touch_stock_items_updated_at`; no setearlo a mano.
- **No** hacer backfill de consumos perdidos: los números actuales no son reconstruibles con exactitud. Se corrige con un conteo físico (ver 4.5).
- `stock_movements.quantity > 0` sigue igual (el signo lo da `movement_type`; en ADJUSTMENT el signo va en la nota).

### 4.2 Servicio — `src/lib/supabase/services/stock.service.ts`
- `getPendingShipmentStockDemand()` → reemplazar el cuerpo por:
```ts
  const empty = emptyRequirements(); // Record<StockItemKey, number> con todo en 0 (reutilizar BASE_REQUIREMENTS + soldadores)
  const { data, error } = await supabase.rpc('get_pending_stock_demand');
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ item_key: string; qty: number | string }>) {
    const key = row.item_key as StockItemKey;
    if (key in empty) empty[key] = Number(row.qty) || 0;
  }
  return empty;
```
  Actualizar el JSDoc (regla nueva: no enviadas, últimos 60 días o deudores, sin descuento previo).
- **Borrar** `consumeStockForOrderWhenTrackingSent`, `createMissingStockTasks`, `calculateRequirements`, `insertMovements` y `requirementsForOrderItem` si quedan sin uso (verificá con grep; `MinimalOrderItem` también si nadie lo usa). La BOM vive ahora solo en SQL (`stock_bom_for_item`).
- `setStockQuantity(itemId, qty)` → reemplazar por:
```ts
export const adjustStockCount = async (itemKey: StockItemKey, quantity: number, note?: string): Promise<number> => {
  const safe = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const { data, error } = await supabase.rpc('adjust_stock_count', {
    p_item_key: itemKey, p_new_quantity: safe, p_note: note ?? null,
  });
  if (error) throw error;
  return Number(data ?? safe);
};
```
- `applyStockInboundFromReplenishTask`: reemplazar el bloque select → update → insert por
  `await supabase.rpc('add_stock_inbound', { p_item_key: params.itemKey, p_quantity: qty, p_note: 'Ingreso desde tarea de stock (dashboard)' })` (con `if (error) throw error`). El borrado de tareas que sigue queda igual.
- `syncStockReplenishTasksForCurrentUser`: cambiar la condición de resuelto para que el negativo también alerte:
```ts
    const shortage = Math.max(0, needed - stockAlMomento); // stock negativo suma al faltante
    ...
    if (shortage <= 0) { /* borrar tareas + notifyStockBajoResuelto */ }
```
  (sacar el `needed <= 0 ||`).
- Si `src/lib/supabase/types.ts` tiene sección `Functions` tipada y el `rpc` no compila, agregar las firmas de `get_pending_stock_demand`, `adjust_stock_count`, `add_stock_inbound` siguiendo el formato existente (o regenerar tipos). No usar `any` nuevo.

### 4.3 Pedidos — `src/components/pedidos/Table/OrdersTable.tsx`
- En `handleEnvioEstadoChange`, **eliminar** `maybeConsumeStock` y sus dos llamadas, más el import de `consumeStockForOrderWhenTrackingSent`, `isAlreadyTrackingSent` y `shouldConsumeStock`. El descuento lo hace solo el trigger cuando la orden pasa a `Seguimiento Enviado` (el estado de envío es por orden: `orders.service.ts` ~línea 937 actualiza `ordenes.estado_envio` desde los ítems, así que el trigger se dispara también en el cambio por ítem).
- Si `toast` queda sin uso en esa función, no importa (se usa en otras).

### 4.4 Pantalla Stock — `src/app/stock/index.tsx`
- `handleSaveStock(item)` → `await adjustStockCount(item.itemKey, Number(pendingQty[item.id] ?? item.quantity))`. Toast: `Conteo guardado — {itemName}: {cantidad}`.
- Columna "Stock actual": mostrar el valor del sistema **como texto** (rojo y con badge `Negativo` si `quantity < 0`, con `title="Se envió más de lo cargado. Cargá el ingreso pendiente o hacé un conteo físico."`). Al lado, el `Input` pasa a llamarse **"Conteo físico"** (placeholder vacío, `min={0}`, `type="number"`, `inputMode="numeric"`), y el botón "Guardar" → **"Guardar conteo"**. Inicializar `pendingQty` en `''` (no en la cantidad actual) y deshabilitar el botón si está vacío.
- El badge `Bajo` sigue con la misma regla (`needed > 0 && quantity < needed`), y además mostrarlo si `quantity < 0`.
- Encabezado "Necesario (pendientes)" → agregar `title` explicando: "Insumos de pedidos no enviados de los últimos 60 días (o deudores) que todavía no se descontaron".
- Revisar `src/components/home/StockReplenishSection.tsx`: que muestre bien `stockAlMomento` negativo (sin `Math.max(0, …)` escondiéndolo) y que el ingreso siga funcionando con la RPC.

### 4.5 Después de aplicar (tarea para el equipo, no para Cursor)
El stock actual del sistema **no es confiable** (ver tabla de 4.a). Una vez desplegado, hay que hacer **un conteo físico de los 15 insumos** y cargarlo con "Guardar conteo". Desde ahí en adelante, todo envío descuenta completo y todo ajuste queda registrado.

### Fuera de alcance (pregunta abierta, NO implementar)
- Sellos `tipo` **3mm, Lacre, Alimento** hoy consumen la misma BOM que un sello clásico (tubo 80, mango, varilla, prisionero, tuerca). ¿Es correcto? (67 ítems en total). Registrar como **Q-STK-005**.
- ¿Los pedidos que se **retiran en persona** llegan alguna vez a `Seguimiento Enviado`? Si no, nunca descuentan stock y cuentan como demanda 60 días. Registrar como **Q-STK-006**.

### Criterio de aceptación
- Con un insumo en 0, pasar una orden a `Seguimiento Enviado` → queda en negativo y hay un movimiento `OUT` por la cantidad completa.
- Repetir el cambio de estado → no descuenta de nuevo.
- "Guardar conteo" crea un `ADJUSTMENT` con nota `Conteo físico: X → Y (±N)`.
- "Necesario (pendientes)" coincide con la query de verificación de §6.

---

## 5. Documentación y changelog (obligatorio por `AGENTS.md`)

- `docs/04-business-rules/fabricacion.md` → **BR-VEC-005**: agregar la regla "si el lado menor pedido supera el tope, el lado menor del vector se lleva al tope y el otro por proporción; popup solo si el largo se desvía ≥6 mm (decisión 2026-10-01)".
- `docs/04-business-rules/stock.md`:
  - BR-STK-001: la BOM vive solo en SQL (`stock_bom_for_item`), ya no duplicada en TS.
  - BR-STK-002: "se descuenta una sola vez por orden al pasar a `Seguimiento Enviado`, **siempre completo; el stock puede quedar negativo** (decisión 2026-10-01)". Solo lo hace el trigger.
  - BR-STK-003: demanda = ítems de órdenes no enviadas, creadas hace ≤60 días o con ítems `Deudor`, sin descuento previo (`get_pending_stock_demand`).
  - Nueva **BR-STK-006**: ajustes manuales = conteo físico vía `adjust_stock_count` (movimiento `ADJUSTMENT`); ingresos vía `add_stock_inbound` (movimiento `IN`). Ambos atómicos.
- `docs/02-modules/stock/README.md` y `docs/03-workflows/WF-11-stock-y-reposicion.md`: reflejar lo anterior (sacar "nunca negativo", sacar la llamada TS desde OrdersTable, paso 6 "conteo físico registrado").
- `docs/audits/inconsistencias.md` → marcar **AUD-INC-015** como resuelta.
- `docs/14-open-questions/stock.md`: Q-STK-003 → "implementada (2026-10-01)"; agregar Q-STK-005 y Q-STK-006 (§4, fuera de alcance) con estado `abierta`.
- `docs/14-open-questions/vectorizacion.md`: agregar **Q-VEC-006** (§3.5) con estado `abierta`.
- `docs/02-modules/vectorizacion/README.md` y `docs/06-state-machines/vectorizacion.md`: mencionar dedupe por sello en la cola de Revisión y sincronización entre pestañas.
- `docs/manual/04-vectorizacion.md` (si menciona el modal de medida) y `docs/manual/08-stock.md`: escribir libre en el modal; "Guardar conteo", stock negativo en rojo.
- **Changelog** `src/lib/changelog/entries.ts`: nueva entrada al final, `id: 32`, `date: '2026-10-01'`, `version: '1.50'`, siguiendo el formato de la regla `.cursor/rules/changelog-novedades.mdc`. Slides sugeridas (íconos ya importados en el archivo: `Ruler`, `Package`):
  1. `Ruler` — "Medida del sello: escribí el número directo" / "En el aviso de medida ya podés tipear los milímetros en vez de ir de a 0.1. Y los sellos pedidos al máximo (como 40×40) ahora salen con el lado chico en 36.5, lo más cerca posible de lo pedido."
  2. `Package` — "Stock que refleja la realidad" / "Cada envío descuenta todos sus insumos aunque el stock esté en cero (queda en rojo). Para dejarlo al día, contá lo que hay y cargalo con 'Guardar conteo'."

---

## 6. Verificación final

1. `npm run typecheck && npm run lint && npm test` en verde.
2. SQL de verificación (Supabase SQL editor), después de aplicar la migración:
```sql
-- Demanda: debe coincidir con la columna "Necesario (pendientes)" de /stock
select * from public.get_pending_stock_demand() order by 1;

-- La BOM SQL da lo mismo que antes para cada tipo
select t.item_type, t.tipo, b.*
  from (values ('SELLO','Clasico'),('ABECEDARIO','Clasico'),('SELLO','ABC'),
               ('SOLDADOR','Clasico'),('MANGO_GOLPE','Clasico'),('BASE_REMACHADORA','Clasico')) t(item_type, tipo)
  cross join lateral public.stock_bom_for_item(t.item_type, t.tipo, '{}'::jsonb) b;

-- Ninguna orden con más de un descuento
select order_id, count(distinct date_trunc('second', created_at))
  from public.stock_movements where movement_type = 'OUT' and order_id is not null
 group by 1 having count(distinct date_trunc('second', created_at)) > 1;
```
3. Prueba manual en el navegador:
   - Modal de medida: escribir libre, coma decimal, Enter, blur (§1).
   - Subir un SVG rectangular a un sello 40×40 desde Producción → se guarda sin popup con lado chico 36.5 (§2).
   - Vectorización con dos pestañas abiertas (§3).
   - Pasar una orden de prueba a `Seguimiento Enviado` con un insumo en 0 (§4). **Usar una orden de prueba**: el cambio de estado puede mandar WhatsApp al cliente (ver `docs/08-automations/triggers.md`).
