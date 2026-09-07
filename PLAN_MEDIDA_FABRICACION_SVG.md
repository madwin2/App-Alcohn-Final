# Plan de implementación: popup de medida de fabricación al subir el SVG

> Contexto y justificación completa en [`ANALISIS_MEDIDA_REAL_SELLOS.md`](ANALISIS_MEDIDA_REAL_SELLOS.md)
> (léelo primero si no lo leíste — este documento asume la Opción C de ahí: campo nuevo
> `ancho_fabricacion_mm`/`largo_fabricacion_mm`, sugerido automáticamente y confirmado a mano).

Este documento es una guía de implementación paso a paso, con rutas de archivo, líneas y código
concreto, para que se ejecute directamente (por ejemplo con Cursor) sin tener que rediscutir el
diseño. Todas las rutas son relativas a la raíz del repo.

## 1. Qué tiene que hacer la feature

Al subir un vector **SVG** (no EPS/PDF/AI — esos no se pueden medir de forma confiable en el
browser) en la celda de vector de un sello, tanto en **Pedidos**
(`src/components/pedidos/Table/cells/CellVector.tsx`) como en **Producción**
(`src/components/produccion/Table/cells/CellVector.tsx`):

1. Se sube el archivo igual que hoy (sin cambios en esa parte).
2. Se mide el bounding box real del SVG en el navegador (ancho/alto en mm y su proporción).
3. Se abre un popup que:
   - Muestra el vector y la medida pedida (la que cargó el pedido, de referencia).
   - Sugiere una medida de fabricación: si la planchuela que le corresponde a ese sello tiene un
     margen conocido (12, 19 o 38 — ver tabla en `ANALISIS_MEDIDA_REAL_SELLOS.md`), recorta el eje
     que queda contra el ancho fijo de la planchuela por ese margen, y calcula el otro eje a partir
     de la **proporción real del SVG medido** (así el sello no queda deformado). Si no hay margen
     conocido (planchuela 25/63, o no se pudo determinar planchuela), sugiere la medida pedida tal
     cual.
   - Tiene dos campos editables, Ancho (mm) y Alto (mm), con la proporción bloqueada: cambiar uno
     recalcula el otro automáticamente usando la proporción del SVG.
   - Al confirmar, guarda `ancho_fabricacion_mm`/`largo_fabricacion_mm` en el sello. Al cancelar,
     no se guarda nada (el sello sigue usando la medida pedida como fallback, comportamiento
     actual sin cambios).
4. `packageZip.ts` (el que arma el manifest para el Lua de Aspire) empieza a preferir
   `ancho_fabricacion_mm`/`largo_fabricacion_mm` sobre `ancho_real`/`largo_real` cuando existan.

**El Lua (`aspire-gadgets/ArmarPrograma_*.lua`) no se toca.** Sigue leyendo `ancho_mm`/`largo_mm`
del manifest tal cual — solo cambia qué campo de la base alimenta esos dos números.

## 2. Diseño de la sugerencia automática (por qué así)

Del análisis: 40×40 (planchuela 38) pasa a 36.5×36.5 — **ambos** ejes se recortan por igual porque
el diseño es cuadrado. 50×20 (planchuela 19) pasa a 50×18 — solo el eje menor (20, el que queda
contra el ancho fijo de la plancha) se recorta; el eje mayor (50, el largo a lo largo de la barra)
queda igual. Esto significa que el margen conocido no se resta simétricamente a ambos ejes: se
resta al eje que coincide con el **lado menor** (`min(ancho, largo)`, el mismo criterio que ya usa
`resolvePlanchuelaRef` en `src/lib/programas/material.ts`), y el otro eje se recalcula a partir de
la proporción real del vector para no deformar el diseño. Por eso la sugerencia automática y el
bloqueo de proporción del popup son, en el fondo, la misma función aplicada dos veces (una al
abrir el popup con el valor sugerido, otra en vivo cuando el usuario edita a mano).

## 3. Paso 0 — Migración SQL

Crear `migration_add_medida_fabricacion.sql` en la raíz del repo (mismo estilo que
`migration_programas_fase2_alertas.sql`):

```sql
-- Migración: medida de fabricación confirmada por SVG (distinta de ancho_real/largo_real,
-- que es la medida PEDIDA). Ver ANALISIS_MEDIDA_REAL_SELLOS.md.
-- Ejecutar en Supabase SQL Editor (una vez).

ALTER TABLE sellos ADD COLUMN IF NOT EXISTS ancho_fabricacion_mm DECIMAL(6,2);
ALTER TABLE sellos ADD COLUMN IF NOT EXISTS largo_fabricacion_mm DECIMAL(6,2);

COMMENT ON COLUMN sellos.ancho_fabricacion_mm IS
  'Ancho real al que se corta el bronce, en MM (a diferencia de ancho_real que es la medida pedida, en CM). Se carga confirmando/editando la sugerencia del popup al subir el SVG. NULL = todavía no confirmado, se sigue usando ancho_real como fallback.';
COMMENT ON COLUMN sellos.largo_fabricacion_mm IS
  'Largo real al que se corta el bronce, en MM (a diferencia de largo_real que es la medida pedida, en CM). Se carga confirmando/editando la sugerencia del popup al subir el SVG. NULL = todavía no confirmado, se sigue usando largo_real como fallback.';

-- Extender el trigger de "programa dirty" (migration_programas_fase2_alertas.sql) para que
-- confirmar/editar la medida de fabricación de un sello ya programado marque el programa como
-- dirty, igual que ya pasa hoy con ancho_real/largo_real.
DROP TRIGGER IF EXISTS trigger_mark_programa_dirty_on_sello_relevant_update ON sellos;
CREATE TRIGGER trigger_mark_programa_dirty_on_sello_relevant_update
  BEFORE UPDATE OF
    archivo_vector_preview, archivo_base, ancho_real, largo_real,
    ancho_fabricacion_mm, largo_fabricacion_mm,
    tipo, tipo_planchuela, maquina, fecha_limite, es_prioritario
  ON sellos
  FOR EACH ROW
  EXECUTE FUNCTION mark_programa_dirty_on_sello_relevant_update();
```

**Ojo**: `ancho_real`/`largo_real` están en **CM**. Los campos nuevos quedan en **MM** a propósito
(coincide con `ancho_mm`/`largo_mm` del manifest y con cómo se va a medir el SVG en el browser —
mezclar unidades entre columnas hermanas es justo la clase de confusión que originó este problema,
así que el nombre deja la unidad explícita: `_mm`).

Aplicar la migración con la MCP de Supabase (`apply_migration`) o pegándola en el SQL Editor —
seguir la convención que ya use el resto del repo para migraciones nuevas.

## 4. Paso 1 — Tipos

### 4.1 `src/lib/supabase/types.ts`

En la tabla `sellos` → `Row` (cerca de la línea 137-138, donde están `largo_real`/`ancho_real`),
agregar:

```ts
largo_fabricacion_mm: number | null;
ancho_fabricacion_mm: number | null;
```

`Insert`/`Update` se derivan automáticamente vía `Omit`/`Partial` sobre `Row` — no hace falta
tocarlos aparte (confirmar el patrón exacto mirando cómo están declarados `Insert`/`Update` ahí
mismo).

### 4.2 `src/lib/types/index.ts`

Agregar los mismos dos campos opcionales a **los tres** tipos que hoy llevan
`requestedWidthMm`/`requestedHeightMm` o `widthMm`/`heightMm`, para que la cadena completa
(Pedidos → Producción → Programas/Aspire) pueda leer y escribir el valor confirmado:

- `OrderItem` (cerca de la línea 123-124):
  ```ts
  requestedWidthMm: number;
  requestedHeightMm: number;
  fabricationWidthMm?: number | null;
  fabricationHeightMm?: number | null;
  ```
- `ProductionItem` (cerca de la línea 212-213): mismos dos campos.
- `ProgramStamp` (cerca de la línea 252-253, junto a `widthMm`/`heightMm`): mismos dos campos
  (útil para mostrar en la UI de Programas si hace falta más adelante, aunque el consumidor real
  es `packageZip.ts` vía `widthMm`/`heightMm` — ver paso 6).

## 5. Paso 2 — Utilidad de medición del SVG

Nuevo archivo `src/lib/utils/svgBoundingBox.ts`:

```ts
export interface SvgMeasurement {
  widthMm: number;
  heightMm: number;
  aspectRatio: number; // widthMm / heightMm
}

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96, // 96dpi, default de SVG/CSS
};

interface ParsedLength {
  value: number;
  unit: string;
  mm: number;
}

function parseLength(raw: string | null): ParsedLength | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || 'px').toLowerCase();
  const factor = UNIT_TO_MM[unit];
  if (factor == null) return null;
  return { value, unit, mm: value * factor };
}

/** Mide un archivo SVG recién elegido por el usuario (antes o después de subirlo). */
export async function measureSvgFile(file: File): Promise<SvgMeasurement | null> {
  try {
    const text = await file.text();
    return measureSvgString(text);
  } catch {
    return null;
  }
}

/** Mide el bounding box real de la geometría de un SVG (no del artboard) y lo convierte a mm. */
export function measureSvgString(svgText: string): SvgMeasurement | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return null;

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.documentElement;
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg') return null;
  if (doc.getElementsByTagName('parsererror').length > 0) return null;

  // getBBox() necesita el elemento montado en el DOM (oculto, fuera de flujo).
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.style.visibility = 'hidden';
  document.body.appendChild(host);

  try {
    const imported = document.importNode(svgEl, true) as unknown as SVGSVGElement;
    host.appendChild(imported);

    let bbox: DOMRect | null = null;
    try {
      bbox = imported.getBBox();
    } catch {
      bbox = null;
    }
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

    const widthAttr = parseLength(svgEl.getAttribute('width'));
    const heightAttr = parseLength(svgEl.getAttribute('height'));
    const viewBoxAttr = svgEl.getAttribute('viewBox');
    const viewBoxParts = viewBoxAttr ? viewBoxAttr.trim().split(/[\s,]+/).map(Number) : null;
    const viewBoxW = viewBoxParts && viewBoxParts.length === 4 ? viewBoxParts[2] : null;
    const viewBoxH = viewBoxParts && viewBoxParts.length === 4 ? viewBoxParts[3] : null;

    let scaleX: number;
    let scaleY: number;

    if (widthAttr && heightAttr && viewBoxW && viewBoxH) {
      // Con viewBox: el bbox está en el espacio de coordenadas del viewBox.
      scaleX = widthAttr.mm / viewBoxW;
      scaleY = heightAttr.mm / viewBoxH;
    } else if (widthAttr && heightAttr) {
      // Sin viewBox: 1 user unit == 1 unidad declarada en width/height.
      scaleX = UNIT_TO_MM[widthAttr.unit];
      scaleY = UNIT_TO_MM[heightAttr.unit];
    } else {
      // Sin width/height explícitos: asumir px a 96dpi (default de SVG).
      scaleX = UNIT_TO_MM.px;
      scaleY = UNIT_TO_MM.px;
    }

    const widthMm = bbox.width * scaleX;
    const heightMm = bbox.height * scaleY;
    if (widthMm <= 0 || heightMm <= 0) return null;

    return { widthMm, heightMm, aspectRatio: widthMm / heightMm };
  } finally {
    document.body.removeChild(host);
  }
}
```

**Nota para quien implemente**: probar esta función con un SVG real exportado desde Illustrator
con las unidades del documento en mm (que es justo lo que ya pide el header de
`ArmarPrograma_Chica.lua` para que la validación de escala del Lua casi nunca tenga que corregir
nada). Si el `width`/`height` del SVG viene sin unidad y sin `viewBox` coherente, el valor en mm
puede salir mal — en ese caso el popup igual debe funcionar (cae a `svgAspectRatio: null`, ver
paso 3) y el usuario carga la medida a mano.

## 6. Paso 3 — Tabla de márgenes conocidos + helper de sugerencia

Nuevo archivo `src/lib/programas/fabricationSize.ts`:

```ts
import type { PlanchuelaSize } from '@/lib/types/index';
import { resolvePlanchuelaRef } from './material';

/**
 * Margen conocido (mm) que se recorta al eje que queda contra el ancho fijo de la planchuela.
 * Valores confirmados a mano — ver ANALISIS_MEDIDA_REAL_SELLOS.md sección 3.
 * 25 y 63 quedan afuera a propósito: no hay un margen fijo confirmado, se decide caso a caso.
 */
export const KNOWN_FABRICATION_MARGIN_MM: Partial<Record<PlanchuelaSize, number>> = {
  12: 0.5,
  19: 2.0,
  38: 3.5,
};

export interface FabricationSizeSuggestion {
  widthMm: number;
  heightMm: number;
  tipoPlanchuela: PlanchuelaSize | null;
  marginAppliedMm: number | null; // null = no hay margen conocido, se sugiere la medida pedida tal cual
}

/**
 * Sugiere ancho/largo de fabricación a partir de la medida pedida y, si se pudo medir el SVG, su
 * proporción real. El eje menor (el que queda contra el ancho fijo de la planchuela) se recorta
 * por el margen conocido; el otro eje se deriva de la proporción del SVG para no deformar el
 * diseño. Sin margen conocido para esa planchuela, se sugiere la medida pedida sin tocar.
 */
export function suggestFabricationSize(
  requestedWidthMm: number,
  requestedHeightMm: number,
  svgAspectRatio: number | null,
): FabricationSizeSuggestion {
  const tipoPlanchuela = resolvePlanchuelaRef({
    anchoRealCm: requestedWidthMm / 10,
    largoRealCm: requestedHeightMm / 10,
  });

  const margin = tipoPlanchuela != null ? KNOWN_FABRICATION_MARGIN_MM[tipoPlanchuela] ?? null : null;

  if (margin == null || requestedWidthMm <= 0 || requestedHeightMm <= 0) {
    return { widthMm: requestedWidthMm, heightMm: requestedHeightMm, tipoPlanchuela, marginAppliedMm: null };
  }

  const ratio = svgAspectRatio && svgAspectRatio > 0 ? svgAspectRatio : requestedWidthMm / requestedHeightMm;
  const widthIsMinor = requestedWidthMm <= requestedHeightMm;

  if (widthIsMinor) {
    const widthMm = Math.max(requestedWidthMm - margin, 1);
    return { widthMm, heightMm: widthMm / ratio, tipoPlanchuela, marginAppliedMm: margin };
  }
  const heightMm = Math.max(requestedHeightMm - margin, 1);
  return { widthMm: heightMm * ratio, heightMm, tipoPlanchuela, marginAppliedMm: margin };
}

/** Recalcula el eje libre a partir del que el usuario tocó, respetando la proporción dada (width/height). */
export function applyAspectRatioLock(
  changedAxis: 'width' | 'height',
  newValue: number,
  aspectRatio: number,
): { widthMm: number; heightMm: number } {
  if (!Number.isFinite(newValue) || newValue <= 0) {
    return changedAxis === 'width' ? { widthMm: newValue, heightMm: 0 } : { widthMm: 0, heightMm: newValue };
  }
  if (changedAxis === 'width') {
    return { widthMm: newValue, heightMm: aspectRatio > 0 ? newValue / aspectRatio : newValue };
  }
  return { widthMm: aspectRatio > 0 ? newValue * aspectRatio : newValue, heightMm: newValue };
}
```

Agregar un test en `src/lib/programas/material.test.ts` (o un archivo nuevo
`fabricationSize.test.ts` al lado, siguiendo el mismo estilo) que cubra al menos los 4 casos del
análisis: 40×40 planchuela 38 → ~36.5×36.5; 50×20 planchuela 19 → 50×18; 50×12 planchuela 12 →
50×11.5; 22×21 planchuela 25 → sin margen, se sugiere 22×21 tal cual.

## 7. Paso 4 — Popup compartido

Nuevo archivo `src/components/shared/VectorSizeConfirmDialog.tsx`. Usa los primitivos de
`src/components/ui/dialog.tsx` (patrón de `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`,
copiar el estilo de `src/components/pedidos/UploadPhotos/UploadPhotosDialog.tsx` — dialog
controlado por `open`/`onOpenChange`, `DialogContent` con `max-w-*` moderado ya que este popup es
más chico) y el `Input`/`Button` de `src/components/ui/`.

```tsx
import { useEffect, useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyAspectRatioLock } from '@/lib/programas/fabricationSize';
import type { FabricationSizeSuggestion } from '@/lib/programas/fabricationSize';

interface VectorSizeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  previewUrl?: string | null;
  requestedWidthMm: number;
  requestedHeightMm: number;
  suggestion: FabricationSizeSuggestion;
  svgAspectRatio: number | null;
  onConfirm: (result: { widthMm: number; heightMm: number }) => void | Promise<void>;
}

export function VectorSizeConfirmDialog({
  open,
  onOpenChange,
  fileName,
  previewUrl,
  requestedWidthMm,
  requestedHeightMm,
  suggestion,
  svgAspectRatio,
  onConfirm,
}: VectorSizeConfirmDialogProps) {
  const [widthMm, setWidthMm] = useState(suggestion.widthMm);
  const [heightMm, setHeightMm] = useState(suggestion.heightMm);
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  // Ratio que se usa para el bloqueo: preferí la del SVG medido; si no hay, la de la sugerencia
  // (que en el peor caso ya cae en la del pedido).
  const lockRatio = svgAspectRatio ?? (suggestion.heightMm > 0 ? suggestion.widthMm / suggestion.heightMm : 1);

  useEffect(() => {
    if (open) {
      setWidthMm(suggestion.widthMm);
      setHeightMm(suggestion.heightMm);
      setLocked(true);
    }
  }, [open, suggestion.widthMm, suggestion.heightMm]);

  const handleWidthChange = (value: number) => {
    if (locked) {
      const next = applyAspectRatioLock('width', value, lockRatio);
      setWidthMm(next.widthMm);
      setHeightMm(next.heightMm);
    } else {
      setWidthMm(value);
    }
  };

  const handleHeightChange = (value: number) => {
    if (locked) {
      const next = applyAspectRatioLock('height', value, lockRatio);
      setWidthMm(next.widthMm);
      setHeightMm(next.heightMm);
    } else {
      setHeightMm(value);
    }
  };

  const handleUseRequested = () => {
    setWidthMm(requestedWidthMm);
    setHeightMm(requestedHeightMm);
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ widthMm, heightMm });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-lg font-semibold">Confirmar medida de fabricación</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 truncate">{fileName}</p>
        </DialogHeader>

        <div className="space-y-4">
          {previewUrl && (
            <div className="flex items-center justify-center rounded border bg-white p-4 h-32">
              <img src={previewUrl} alt="Vector" className="max-h-full max-w-full object-contain" />
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Medida pedida: <span className="font-medium text-foreground">{requestedWidthMm.toFixed(1)} × {requestedHeightMm.toFixed(1)} mm</span>
          </div>

          {suggestion.marginAppliedMm != null ? (
            <div className="text-xs rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 px-3 py-2">
              Sugerido según planchuela {suggestion.tipoPlanchuela}mm: se descontó {suggestion.marginAppliedMm}mm de margen.
            </div>
          ) : (
            <div className="text-xs rounded bg-muted px-3 py-2 text-muted-foreground">
              {suggestion.tipoPlanchuela
                ? `Sin margen conocido para planchuela ${suggestion.tipoPlanchuela}mm — revisá la medida a mano.`
                : 'No se pudo determinar la planchuela — revisá la medida a mano.'}
            </div>
          )}

          {svgAspectRatio == null && (
            <div className="text-xs rounded bg-muted px-3 py-2 text-muted-foreground">
              No se pudo medir la proporción del SVG automáticamente; se usa la del pedido.
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="fab-width">Ancho (mm)</Label>
              <Input
                id="fab-width"
                type="number"
                step="0.1"
                min="0"
                value={widthMm.toFixed(1)}
                onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-1"
              title={locked ? 'Proporción bloqueada (click para editar libre)' : 'Proporción libre (click para bloquear)'}
              onClick={() => setLocked((v) => !v)}
            >
              {locked ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
            </Button>
            <div className="flex-1 space-y-1">
              <Label htmlFor="fab-height">Alto (mm)</Label>
              <Input
                id="fab-height"
                type="number"
                step="0.1"
                min="0"
                value={heightMm.toFixed(1)}
                onChange={(e) => handleHeightChange(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button type="button" variant="link" size="sm" className="px-0" onClick={handleUseRequested}>
              Usar medida pedida
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={saving}>
                {saving ? 'Guardando…' : 'Confirmar medida'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Verificar que `src/components/ui/label.tsx` exista con ese export (`Label`); si no existe, usar un
`<label className="text-sm font-medium">` normal en su lugar y ajustar el import.

## 8. Paso 5 — Wiring en `CellVector.tsx` (Pedidos)

Archivo: `src/components/pedidos/Table/cells/CellVector.tsx`.

**Gotcha importante**: el componente hoy tiene varios `return` tempranos (línea ~64 caso
`'summary'`, línea ~253 rama `!showPreviews`, línea ~313 rama sin `displayUrl`, y el `return` final
línea ~337). El popup nuevo tiene que quedar montado sin importar por cuál rama se está
renderizando en el momento en que se dispara (el usuario puede subir el archivo estando en
cualquiera de esas variantes visuales). La forma más simple de no duplicar el `<VectorSizeConfirmDialog>`
en las 4 ramas es refactorizar el cuerpo del componente para que cada rama arme un `content: JSX.Element`
en vez de hacer `return` directo, y dejar un único `return` al final del componente que envuelve
`content` junto con el diálogo:

```tsx
export function CellVector(...) {
  // ...todo el código de hooks/estado igual que hoy...

  let content: React.ReactNode;

  if (hasFile === 'summary') {
    content = ( /* JSX que hoy está en el primer return */ );
  } else if (!showPreviews) {
    content = ( /* JSX que hoy está en el return de la rama !showPreviews */ );
  } else if (!displayUrl && !archivoVectorSinMiniatura) {
    content = ( /* JSX que hoy está en esa rama */ );
  } else {
    content = ( /* JSX del return final, sin el fragment que envuelve */ );
  }

  return (
    <>
      {content}
      <VectorSizeConfirmDialog
        open={sizeDialogState != null}
        onOpenChange={(next) => { if (!next) setSizeDialogState(null); }}
        fileName={sizeDialogState?.fileName ?? ''}
        previewUrl={sizeDialogState?.previewUrl}
        requestedWidthMm={item.requestedWidthMm}
        requestedHeightMm={item.requestedHeightMm}
        suggestion={sizeDialogState?.suggestion ?? { widthMm: 0, heightMm: 0, tipoPlanchuela: null, marginAppliedMm: null }}
        svgAspectRatio={sizeDialogState?.svgAspectRatio ?? null}
        onConfirm={handleConfirmFabricationSize}
      />
    </>
  );
}
```

Si ese refactor es muy invasivo dado el resto del archivo, la alternativa más simple (menos
prolija pero funcionalmente equivalente) es abrir el diálogo en un **portal a nivel de la tabla**
en vez de por celda — pero dado que cada celda ya maneja su propio estado de upload, lo más directo
es la opción de arriba.

Agregar, junto a los imports existentes:

```tsx
import { measureSvgFile } from '@/lib/utils/svgBoundingBox';
import { suggestFabricationSize, type FabricationSizeSuggestion } from '@/lib/programas/fabricationSize';
import { VectorSizeConfirmDialog } from '@/components/shared/VectorSizeConfirmDialog';
```

Agregar estado nuevo (junto a `const [uploading, setUploading] = useState(false);`):

```tsx
interface SizeDialogState {
  fileName: string;
  previewUrl?: string;
  suggestion: FabricationSizeSuggestion;
  svgAspectRatio: number | null;
}
const [sizeDialogState, setSizeDialogState] = useState<SizeDialogState | null>(null);
```

Dentro de `handleFileSelect`, **después** de `await onUpdate(order.id, { items: updatedItems });`
y del `toast(...)` de éxito, agregar (solo para SVG — `fileExtension === '.svg'`):

```tsx
if (fileExtension === '.svg') {
  const measurement = await measureSvgFile(file);
  const suggestion = suggestFabricationSize(
    item.requestedWidthMm,
    item.requestedHeightMm,
    measurement?.aspectRatio ?? null,
  );
  setSizeDialogState({
    fileName: file.name,
    previewUrl: result.previewUrl ?? result.originalUrl,
    suggestion,
    svgAspectRatio: measurement?.aspectRatio ?? null,
  });
}
```

Y el handler que persiste la confirmación:

```tsx
const handleConfirmFabricationSize = async ({ widthMm, heightMm }: { widthMm: number; heightMm: number }) => {
  if (!onUpdate) return;
  const updatedItems = order.items.map((i) =>
    i.id === item.id ? { ...i, fabricationWidthMm: widthMm, fabricationHeightMm: heightMm } : i,
  );
  await onUpdate(order.id, { items: updatedItems });
};
```

## 9. Paso 6 — Wiring en `CellVector.tsx` (Producción)

Archivo: `src/components/produccion/Table/cells/CellVector.tsx`. Mismo patrón que el paso 5,
adaptado a `ProductionItem`/`onUpdateItem`:

- Mismo import nuevo de `measureSvgFile`, `suggestFabricationSize`, `VectorSizeConfirmDialog`.
- Mismo estado `sizeDialogState`.
- En `handleFileSelect`, después de `await onUpdateItem(item.id, { files: {...}, vectorizationState: 'VECTORIZADO' });`,
  el mismo bloque `if (fileExtension === '.svg') { ... }` usando `item.requestedWidthMm`/`requestedHeightMm`.
- `handleConfirmFabricationSize` análogo, llamando a `onUpdateItem(item.id, { fabricationWidthMm: widthMm, fabricationHeightMm: heightMm })`.
- Este archivo tiene menos ramas de `return` temprano que el de Pedidos (repasar el archivo al
  momento de implementar), pero aplica el mismo gotcha: el diálogo tiene que quedar montado sin
  importar qué rama visual esté activa quan se dispara.

## 10. Paso 7 — Servicios: persistir y leer el campo nuevo

### 10.1 `src/lib/supabase/services/orders.service.ts`

Cerca de las líneas 971-975 (donde ya existe el mapeo `item.requestedWidthMm` → `ancho_real`),
agregar el mapeo simétrico para el campo nuevo (sin conversión cm↔mm, ya que ambos quedan en mm):

```ts
if (item.fabricationWidthMm !== undefined) {
  selloData.ancho_fabricacion_mm = item.fabricationWidthMm ?? null;
}
if (item.fabricationHeightMm !== undefined) {
  selloData.largo_fabricacion_mm = item.fabricationHeightMm ?? null;
}
```

Como la mayoría de los `.select()` de este archivo usan `.select('*')`, el campo nuevo llega solo
al leer — no hace falta tocar listas de columnas ahí. Sí hay que revisar `mapSelloToOrderItem`
en `src/lib/supabase/mappers.ts` (línea ~205) y agregar, junto a `requestedWidthMm`/`requestedHeightMm`:

```ts
fabricationWidthMm: (sello as any).ancho_fabricacion_mm != null ? Number((sello as any).ancho_fabricacion_mm) : null,
fabricationHeightMm: (sello as any).largo_fabricacion_mm != null ? Number((sello as any).largo_fabricacion_mm) : null,
```

(el `as any` sigue el mismo patrón que ya usan varios campos de ese mismo mapper hasta que se
regeneren los tipos de Supabase — una vez hecho el paso 4.1, se puede sacar el `as any`).

### 10.2 `src/lib/supabase/services/production.service.ts`

- Extender el `.select(...)` explícito de la línea ~62-92: agregar `ancho_fabricacion_mm,` y
  `largo_fabricacion_mm,` junto a las líneas 84-85 (`largo_real, ancho_real,`).
- En los tres lugares donde se arma `requestedWidthMm`/`requestedHeightMm` a partir de
  `sello.ancho_real`/`largo_real` (líneas ~193-194/230-231, ~433-434/507-508), agregar al lado el
  mapeo de `fabricationWidthMm`/`fabricationHeightMm` desde `sello.ancho_fabricacion_mm`/`largo_fabricacion_mm`
  (`Number(...)` si no es null, si no `null`).
- Al persistir updates de `ProductionItem` (buscar dónde este archivo arma el `update`/`insert`
  hacia `sellos` — patrón simétrico al de `orders.service.ts` en el paso 10.1), agregar el mismo
  mapeo `fabricationWidthMm → ancho_fabricacion_mm`, `fabricationHeightMm → largo_fabricacion_mm`.

## 11. Paso 8 — `programs.service.ts`: usar la medida confirmada en el manifest de Aspire

Archivo: `src/lib/supabase/services/programs.service.ts`, función `mapSelloToProgramStamp`
(línea 126). Esto es lo que efectivamente arregla el bug original — todo lo anterior es para poder
llegar hasta acá con un valor confiable.

```ts
function mapSelloToProgramStamp(sello: SelloRow, perdidaCorteCm: number): ProgramStamp {
  const anchoCm = sello.ancho_real != null ? Number(sello.ancho_real) : null;
  const largoCm = sello.largo_real != null ? Number(sello.largo_real) : null;
  const anchoFabricacionMm = sello.ancho_fabricacion_mm != null ? Number(sello.ancho_fabricacion_mm) : null;
  const largoFabricacionMm = sello.largo_fabricacion_mm != null ? Number(sello.largo_fabricacion_mm) : null;
  const dims = {
    anchoRealCm: anchoCm,
    largoRealCm: largoCm,
    tipoPlanchuela: sello.tipo_planchuela as PlanchuelaSize | null,
  };

  return {
    id: sello.id,
    designName: sello.diseno || 'Sin diseño',
    widthMm: anchoFabricacionMm ?? (anchoCm != null ? anchoCm * 10 : 50),
    heightMm: largoFabricacionMm ?? (largoCm != null ? largoCm * 10 : 30),
    // ... el resto de los campos igual que hoy ...
    fabricationWidthMm: anchoFabricacionMm,
    fabricationHeightMm: largoFabricacionMm,
  };
}
```

Como este archivo usa `.select('*')` en todos los `SELECT` de `sellos`, no hace falta tocar
ninguna lista de columnas acá — el campo nuevo ya viene incluido apenas se aplique la migración
del paso 0 y se regeneren los tipos del paso 4.1.

**No hace falta tocar nada más de `packageZip.ts`** (línea 55-56): ya lee `stamp.widthMm`/`heightMm`,
que ahora vienen resueltos con la prioridad correcta desde `mapSelloToProgramStamp`.

## 12. Paso 9 (opcional, recomendado) — Mostrar la medida confirmada en la tabla

No es indispensable para arreglar el bug, pero ayuda a que se note de un vistazo qué sellos ya
tienen medida de fabricación confirmada y cuáles todavía dependen del fallback. Sugerencia liviana:
en `CellVector.tsx` (ambos), si `item.fabricationWidthMm != null`, mostrar un badge chico (ej. un
punto verde o un ícono `Ruler` de `lucide-react`) superpuesto en la miniatura del vector, con
`title` tipo `"Medida de fabricación confirmada: 36.5 × 36.5 mm"`. Si se implementa, mantenerlo
simple — no agregar una columna nueva a la tabla salvo que se pida explícitamente.

## 13. Checklist de pruebas manuales

1. Migración aplicada sin errores; `sellos` tiene las dos columnas nuevas, nullable.
2. Subir un SVG en Pedidos a un sello sin `tipo_planchuela` conocido (ej. medida rarísima) → el
   popup se abre, sugiere la medida pedida tal cual, muestra el aviso de "sin margen conocido".
3. Subir un SVG a un sello de ~40×40mm → el popup sugiere ~36.5×36.5mm y lo indica.
4. En el popup, cambiar el campo Ancho a mano → el campo Alto se recalcula solo, respetando la
   proporción del SVG (no la del pedido). Repetir cambiando Alto.
5. Tocar el botón de bloqueo (🔗) para desbloquear proporción → cambiar un campo ya NO mueve el
   otro. Volver a bloquear.
6. Confirmar → el popup cierra, no hay error en consola, y (con Supabase MCP o el SQL editor)
   `sellos.ancho_fabricacion_mm`/`largo_fabricacion_mm` de ese sello quedan con el valor mostrado.
7. Cancelar en vez de confirmar → los campos quedan `NULL` (o con el valor previo si ya había uno).
8. Repetir 2-7 en Producción.
9. Subir un EPS/PDF/AI (no SVG) → el popup **no** se abre, el resto del flujo de subida sigue
   funcionando igual que antes.
10. Armar un programa (`packageZip.ts` → `generateAndDownloadProgramPackage`) con un sello que
    tiene `ancho_fabricacion_mm` confirmado → el `manifest.lua` generado adentro del ZIP trae
    `ancho_mm`/`largo_mm` con el valor de fabricación, no el pedido.
11. Armar un programa con un sello que **no** tiene el campo nuevo confirmado (flujo viejo,
    sellos ya cargados antes de este cambio) → sigue funcionando igual que hoy (fallback a
    `ancho_real`/`largo_real`), sin romper programas existentes.
12. Editar la medida de fabricación de un sello que ya está en un programa `LISTO` → el programa
    pasa a `BORRADOR`/`dirty` (por el trigger extendido del paso 0), igual que ya pasa hoy al tocar
    `ancho_real`.

## 14. Fuera de alcance de este plan

- No se toca `aspire-gadgets/ArmarPrograma_*.lua`.
- No se resuelve automáticamente el caso de la planchuela 25/63 (a propósito — ver
  `ANALISIS_MEDIDA_REAL_SELLOS.md` sección 3). Si en el futuro se confirma un margen estable para
  esos casos, alcanza con agregarlo a `KNOWN_FABRICATION_MARGIN_MM`.
- No se migran/backfillean sellos ya cargados antes de este cambio — quedan con el campo nuevo en
  `NULL` y siguen usando el fallback a `ancho_real`/`largo_real`. Backfill masivo, si hiciera
  falta, es una tarea aparte (y probablemente manual, sello por sello, dado que es justo la clase
  de dato que no se puede derivar solo).
- No se toca `CellArchivoBase.tsx` ni el flujo de "foto del sello" — el popup es específico del
  vector SVG.
