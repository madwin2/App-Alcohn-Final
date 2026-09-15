import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackedSheet, PreparedImage } from '@/lib/vectorizacion/types';

function CellCanvas({ image }: { image: PreparedImage }) {
  const ref = useCallback((node: HTMLCanvasElement | null) => {
    if (!node) return;
    const src = image.canvas;
    if (node.width !== src.width) node.width = src.width;
    if (node.height !== src.height) node.height = src.height;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, node.width, node.height);
    ctx.drawImage(src, 0, 0);
  }, [image]);
  return <canvas ref={ref} className="h-full w-full object-contain" aria-label={image.name} />;
}

function useContainSize(aspectW: number, aspectH: number) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ar = aspectW / Math.max(aspectH, 1);
    const measure = () => {
      const bw = el.clientWidth;
      const bh = el.clientHeight;
      if (bw <= 0 || bh <= 0) return;
      let w = bw;
      let h = w / ar;
      if (h > bh) {
        h = bh;
        w = h * ar;
      }
      setSize({ w: Math.floor(w), h: Math.floor(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectW, aspectH]);
  return { boxRef, size };
}

export function SheetCanvas({
  sheet,
  images,
}: {
  sheet: PackedSheet;
  images: Map<string, PreparedImage>;
}) {
  const { boxRef, size } = useContainSize(sheet.width, sheet.height);
  return (
    <div ref={boxRef} className="relative h-full w-full">
      {size.w > 0 ? (
        <div
          className="absolute left-1/2 top-1/2 overflow-hidden rounded-sm bg-white shadow-[0_24px_60px_-28px_rgba(0,0,0,0.7),0_0_0_1px_rgba(16,185,129,0.2)]"
          style={{ width: size.w, height: size.h, transform: 'translate(-50%, -50%)' }}
        >
          {sheet.cells.map((cell) => {
            const image = images.get(cell.imageId);
            return (
              <div
                key={cell.imageId}
                className="absolute overflow-hidden border border-emerald-500/45 bg-white"
                style={{
                  left: `${(cell.x / sheet.width) * 100}%`,
                  top: `${(cell.y / sheet.height) * 100}%`,
                  width: `${(cell.w / sheet.width) * 100}%`,
                  height: `${(cell.h / sheet.height) * 100}%`,
                }}
                title={image?.name}
              >
                {image ? <CellCanvas image={image} /> : null}
              </div>
            );
          })}
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
