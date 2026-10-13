import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackedSheet, PreparedImage } from '@/lib/vectorizacion/types';
import { clampSheetScale, SHEET_MAX_PIXELS } from '@/lib/vectorizacion/sheetPacking';
import { cn } from '@/lib/utils/cn';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

function CellCanvas({ image }: { image: PreparedImage }) {
  const ref = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (!node) return;
      const src = image.canvas;
      if (node.width !== src.width) node.width = src.width;
      if (node.height !== src.height) node.height = src.height;
      const ctx = node.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, node.width, node.height);
      ctx.drawImage(src, 0, 0);
    },
    [image],
  );
  return <canvas ref={ref} className="h-full w-full object-contain" aria-label={image.name} />;
}

/**
 * Marco fijo = capacidad del crédito (SHEET_MAX_PIXELS, mismo aspect que la hoja).
 * El contenido empaquetado se dibuja adentro a escala real → al achicar se ve más chico
 * y queda espacio vacío (antes el contain hacía que siempre llenara la pantalla).
 */
function useCapacityLayout(sheetW: number, sheetH: number) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ frameW: 0, frameH: 0, contentW: 0, contentH: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const bw = el.clientWidth;
      const bh = el.clientHeight;
      if (bw <= 0 || bh <= 0 || sheetW <= 0 || sheetH <= 0) return;

      const ar = sheetW / sheetH;
      const capH = Math.sqrt(SHEET_MAX_PIXELS / ar);
      const capW = capH * ar;

      let frameW = bw;
      let frameH = frameW / ar;
      if (frameH > bh) {
        frameH = bh;
        frameW = frameH * ar;
      }
      frameW = Math.floor(frameW);
      frameH = Math.floor(frameH);

      const pxPerSheet = frameW / capW;
      let contentW = Math.round(sheetW * pxPerSheet);
      let contentH = Math.round(sheetH * pxPerSheet);
      // Hoja que ya supera el tope: llenar el marco (comportamiento anterior).
      if (contentW > frameW || contentH > frameH) {
        contentW = frameW;
        contentH = frameH;
      }

      setLayout({ frameW, frameH, contentW, contentH });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheetW, sheetH]);

  return { boxRef, layout };
}

function cornerCursor(corner: Corner): string {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
}

function SheetCell({
  cell,
  sheet,
  image,
  interactive,
  scale,
  onScaleChange,
}: {
  cell: PackedSheet['cells'][number];
  sheet: PackedSheet;
  image?: PreparedImage;
  interactive: boolean;
  scale: number;
  onScaleChange?: (imageId: string, scale: number) => void;
}) {
  const drag = useRef<{
    corner: Corner;
    startScale: number;
    originX: number;
    originY: number;
    naturalW: number;
    naturalH: number;
    sheetEl: HTMLElement;
    pointerId: number;
  } | null>(null);
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const cellIdRef = useRef(cell.imageId);
  cellIdRef.current = cell.imageId;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const state = drag.current;
      const apply = onScaleChangeRef.current;
      if (!state || !apply || e.pointerId !== state.pointerId) return;
      e.preventDefault();
      const rect = state.sheetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const sheetSize = sheetRef.current;
      const pxPerSheetX = sheetSize.width / rect.width;
      const pxPerSheetY = sheetSize.height / rect.height;
      const dxSheet = (e.clientX - state.originX) * pxPerSheetX;
      const dySheet = (e.clientY - state.originY) * pxPerSheetY;
      const signX = state.corner.includes('e') ? 1 : -1;
      const signY = state.corner.includes('s') ? 1 : -1;
      const deltaW = dxSheet * signX;
      const deltaH = dySheet * signY;
      const nextFromW = (state.naturalW * state.startScale + deltaW) / state.naturalW;
      const nextFromH = (state.naturalH * state.startScale + deltaH) / state.naturalH;
      const next = clampSheetScale(Math.abs(deltaW) >= Math.abs(deltaH) ? nextFromW : nextFromH);
      apply(cellIdRef.current, next);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.current || e.pointerId !== drag.current.pointerId) return;
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const startResize = (corner: Corner, e: React.PointerEvent<HTMLSpanElement>) => {
    if (!interactive || !image || !onScaleChange) return;
    e.preventDefault();
    e.stopPropagation();
    const sheetEl = (e.currentTarget.closest('[data-sheet-surface]') as HTMLElement | null) ?? null;
    if (!sheetEl) return;
    drag.current = {
      corner,
      startScale: scale,
      originX: e.clientX,
      originY: e.clientY,
      naturalW: image.width,
      naturalH: image.height,
      sheetEl,
      pointerId: e.pointerId,
    };
  };

  const pct = Math.round(scale * 100);

  return (
    <div
      className={cn(
        'absolute border border-emerald-500/45 bg-white',
        interactive && 'pointer-events-auto',
      )}
      style={{
        left: `${(cell.x / sheet.width) * 100}%`,
        top: `${(cell.y / sheet.height) * 100}%`,
        width: `${(cell.w / sheet.width) * 100}%`,
        height: `${(cell.h / sheet.height) * 100}%`,
      }}
      title={
        image
          ? `${image.name}${pct < 100 ? ` · ${pct}%` : ''} · arrastrá esquinas para achicar`
          : undefined
      }
      onDoubleClick={(e) => {
        if (!interactive || !onScaleChange || scale >= 1) return;
        e.stopPropagation();
        onScaleChange(cell.imageId, 1);
      }}
    >
      <div className="absolute inset-0 overflow-hidden">
        {image ? <CellCanvas image={image} /> : null}
      </div>
      {interactive && pct < 100 ? (
        <span className="pointer-events-none absolute left-1 top-1 z-[1] rounded bg-black/55 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
          {pct}%
        </span>
      ) : null}
      {interactive && onScaleChange
        ? CORNERS.map((corner) => (
            <span
              key={corner}
              role="slider"
              aria-label={`Escalar ${corner}`}
              aria-valuemin={25}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="absolute z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-emerald-700/80 bg-emerald-400 shadow-sm"
              style={{
                left: corner.includes('w') ? '0%' : '100%',
                top: corner.includes('n') ? '0%' : '100%',
                cursor: cornerCursor(corner),
              }}
              onPointerDown={(e) => startResize(corner, e)}
            />
          ))
        : null}
    </div>
  );
}

export function SheetCanvas({
  sheet,
  images,
  interactive = false,
  scales,
  onScaleChange,
}: {
  sheet: PackedSheet;
  images: Map<string, PreparedImage>;
  interactive?: boolean;
  scales?: Record<string, number>;
  onScaleChange?: (imageId: string, scale: number) => void;
}) {
  const { boxRef, layout } = useCapacityLayout(sheet.width, sheet.height);
  const { frameW, frameH, contentW, contentH } = layout;
  const hasSlack = contentW < frameW - 1 || contentH < frameH - 1;

  return (
    <div ref={boxRef} className="relative h-full w-full">
      {frameW > 0 ? (
        <div
          className="absolute left-1/2 top-1/2 overflow-visible rounded-sm shadow-[0_24px_60px_-28px_rgba(0,0,0,0.7),0_0_0_1px_rgba(16,185,129,0.2)]"
          style={{ width: frameW, height: frameH, transform: 'translate(-50%, -50%)' }}
        >
          {/* Capacidad del crédito: zona libre si la hoja no llena el tope */}
          <div
            className={cn(
              'absolute inset-0 rounded-sm bg-white',
              hasSlack &&
                'bg-[linear-gradient(45deg,rgba(16,185,129,0.04)_25%,transparent_25%,transparent_75%,rgba(16,185,129,0.04)_75%,rgba(16,185,129,0.04)),linear-gradient(45deg,rgba(16,185,129,0.04)_25%,transparent_25%,transparent_75%,rgba(16,185,129,0.04)_75%,rgba(16,185,129,0.04))] bg-[length:14px_14px] bg-[position:0_0,7px_7px]',
            )}
            aria-hidden
          />
          <div
            data-sheet-surface
            className="absolute left-0 top-0 overflow-visible bg-white transition-[width,height] duration-150 ease-out"
            style={{ width: contentW, height: contentH }}
          >
            {sheet.cells.map((cell) => {
              const image = images.get(cell.imageId);
              const scale = clampSheetScale(scales?.[cell.imageId] ?? 1);
              return (
                <SheetCell
                  key={cell.imageId}
                  cell={cell}
                  sheet={sheet}
                  image={image}
                  interactive={interactive}
                  scale={scale}
                  onScaleChange={onScaleChange}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function hitSheetIndex(
  root: HTMLElement,
  x: number,
  y: number,
  active: number,
): number | null {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-sheet-card]')];
  const hits = cards.filter((card) => {
    const r = card.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  if (!hits.length) return null;

  // La del frente no bloquea: si hay alguna de atrás bajo el cursor, gana la más lejana.
  const sides = hits.filter((c) => Number(c.dataset.index) !== active);
  if (sides.length) {
    sides.sort(
      (a, b) =>
        Math.abs(Number(b.dataset.index) - active) - Math.abs(Number(a.dataset.index) - active),
    );
    return Number(sides[0].dataset.index);
  }
  return active;
}
