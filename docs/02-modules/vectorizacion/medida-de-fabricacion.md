# Medida de fabricación

> Lógica: `src/lib/programas/fabricationSize.ts` · Diálogo global: `src/components/shared/FabricationSizeDialogHost.tsx` (+ `src/lib/state/fabricationSizeDialog.store.ts`) · Medición: `src/lib/utils/svgBoundingBox.ts`
> Contexto de diseño: `ANALISIS_MEDIDA_REAL_SELLOS.md`, `PLAN_MEDIDA_FABRICACION_SVG.md` (raíz)

## Qué es

✅ Cada ítem tiene dos medidas:

| Medida | Columnas | Unidad | Quién la define |
|---|---|---|---|
| **Pedida** | `sellos.ancho_real`, `sellos.largo_real` | **cm** | Ventas, al cargar el pedido (o la web) |
| **De fabricación** | `sellos.ancho_fabricacion_mm`, `sellos.largo_fabricacion_mm` | **mm** | Se calcula/confirmar al subir el SVG |

🔶 La medida real del vector puede diferir de la pedida (proporción del logo, tope de la planchuela). La de fabricación es la que se usa para **material, planchuela, largo en el programa y costo** cuando existe; si no, se usa la pedida.

⚠️ Convención: **siempre lado largo × lado corto**. `ancho_*` guarda el **mayor** y `largo_*` el **menor** (al revés de lo que sugieren los nombres). Ver [05-data/inconsistencias-de-nombres.md](../../05-data/inconsistencias-de-nombres.md).

## Cuándo se calcula

- Subir un **SVG** en Pedidos o Producción (`CellVector`).
- Confirmar un vector en **Vectorización** (Revisión o Asignar SVG).
- (EPS/PDF/AI no se miden.)

## Regla (✅ `resolveFabricationSize`)

1. Se determina la planchuela a partir de la **medida pedida** (lado menor).
2. Tope útil por planchuela (`KNOWN_MAX_FABRICATION_MM`): 12→11,5 mm · 19→18 mm · 25→24 mm · 38→36,5 mm · 63→sin tope.
3. Se mide el SVG (ancho/alto físico).
4. **Se guarda directo** si el lado menor medido no supera el tope **y** ni el lado largo ni el corto se desvían ≥ 6 mm de lo pedido ("Medida OK"). Se compara **largo con largo y corto con corto**, sin importar la orientación: un diseño parado de 10 × 50 mm es un "50×10" (corregido 2026-10-15; antes se comparaba ancho con ancho y un diseño parado abría el popup).
5. **Si no**, se abre el popup: sugiere una medida que **conserva la proporción del vector**, recortada al tope si hace falta; el usuario confirma o ajusta. Nunca deforma forzando la medida pedida.

En Vectorización, antes de medir, el SVG se **escala al tamaño pedido** (`applyPhysicalSize` → `containSize`). La caja pedida se **gira según la orientación del diseño**: si el diseño es más alto que ancho, el "50×10" se usa como 10 de ancho × 50 de alto (corregido 2026-10-15; antes un diseño parado se encajaba acostado y quedaba chiquito, p. ej. 2 × 10 mm).

## Efectos

- Trigger `calc_sello_fabrication_cost` recalcula el costo con la medida de fabricación.
- Programas usa la medida de fabricación para planchuela y largo.
- Al marcar `Hecho`, el trigger de consumo de bronce usa la de fabricación.
- El gadget de Aspire valida/corrige la escala del vector importado contra `ancho_mm`/`largo_mm` del manifest (que salen de la medida de fabricación si existe).
