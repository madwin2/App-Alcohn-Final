import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { PackedSheet, PreparedImage } from '@/lib/vectorizacion/types';
import { SHEET_MAX_PIXELS } from '@/lib/vectorizacion/sheetPacking';
import { cn } from '@/lib/utils/cn';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { SheetCanvas, hitSheetIndex } from './sheetCanvas';

gsap.registerPlugin(useGSAP);

/** Coverflow: centro grande; laterales chicas; hover/click/scroll para navegar. */
export function SheetPreview({
  sheets,
  images,
  className,
}: {
  sheets: PackedSheet[];
  images: Map<string, PreparedImage>;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const wheelLock = useRef(false);

  useEffect(() => {
    if (!sheets.length) return;
    setActive(sheets.length - 1);
  }, [sheets.length]);

  useGSAP(
    () => {
      const root = stageRef.current;
      if (!root || !sheets.length) return;
      const stageW = root.clientWidth || 1;
      const sideGap = Math.min(stageW * 0.46, 280);

      root.querySelectorAll<HTMLElement>('[data-sheet-card]').forEach((card) => {
        const index = Number(card.dataset.index);
        const offset = index - active;
        const abs = Math.abs(offset);
        const isCenter = offset === 0;
        const isHover = hovered === index && !isCenter;
        // Solo movimiento: empuja hacia afuera (nunca hacia el centro) para no superponerse.
        const nudgeX = isHover ? Math.sign(offset) * 18 : 0;
        const baseScale = isCenter ? 1 : Math.max(0.58, 0.74 - (abs - 1) * 0.07);
        gsap.to(card, {
          x: offset * sideGap + nudgeX,
          y: isHover ? -10 : 0,
          rotate: 0,
          scale: baseScale,
          opacity: isCenter ? 1 : isHover ? 0.78 : Math.max(0.25, 0.48 - (abs - 1) * 0.1),
          zIndex: isHover ? 35 : isCenter ? 40 : 20 - abs,
          filter: isCenter ? 'brightness(1)' : isHover ? 'brightness(0.95)' : 'brightness(0.7)',
          duration: isHover ? 0.3 : 0.7,
          ease: isHover ? 'power2.out' : 'power3.out',
          overwrite: 'auto',
        });
      });
    },
    {
      dependencies: [active, hovered, sheets.length, sheets.map((s) => s.cells.length).join(',')],
      scope: stageRef,
    },
  );

  useEffect(() => {
    const root = stageRef.current;
    if (!root || sheets.length < 2) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelLock.current) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 10) return;
      wheelLock.current = true;
      setActive((i) => (delta > 0 ? Math.min(sheets.length - 1, i + 1) : Math.max(0, i - 1)));
      window.setTimeout(() => {
        wheelLock.current = false;
      }, 380);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setActive((i) => Math.min(sheets.length - 1, i + 1));
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [sheets.length]);

  if (!sheets.length) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center px-6 text-center', className)}>
        <div className="mb-4 flex size-16 items-center justify-center rounded-md bg-muted/35">
          <Layers className="size-7 text-muted-foreground/80" />
        </div>
        <p className="text-[15px] font-medium tracking-tight">Nada en la hoja</p>
        <p className="mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
          Tocá diseños a la derecha — se van armando acá.
        </p>
      </div>
    );
  }

  const current = sheets[active] ?? sheets[0];
  const used = Math.round(((current.width * current.height) / SHEET_MAX_PIXELS) * 100);

  return (
    <div className={cn('relative flex h-full min-h-0 w-full flex-col', className)}>
      <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[15px] font-medium tracking-tight text-foreground">
            Hoja {active + 1} <span className="font-normal text-muted-foreground">de {sheets.length}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {current.cells.length} {current.cells.length === 1 ? 'diseño' : 'diseños'} · 1 crédito
          </p>
        </div>
        <div className="min-w-[140px]">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Carga de la hoja</span>
            <span className="tabular-nums text-foreground/90">{used}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500/85 transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, used)}%` }}
            />
          </div>
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          hovered != null && hovered !== active ? 'cursor-pointer' : 'cursor-default',
        )}
        onPointerMove={(e) => {
          const root = stageRef.current;
          if (!root) return;
          setHovered(hitSheetIndex(root, e.clientX, e.clientY, active));
        }}
        onPointerLeave={() => setHovered(null)}
        onClick={(e) => {
          const root = stageRef.current;
          if (!root) return;
          const hit = hitSheetIndex(root, e.clientX, e.clientY, active);
          if (hit != null) setActive(hit);
        }}
      >
        {sheets.map((sheet, index) => (
          <div
            key={index}
            data-sheet-card
            data-index={index}
            className="pointer-events-none absolute inset-[6%_10%] origin-center will-change-transform"
            aria-hidden={index !== active}
          >
            <SheetCanvas sheet={sheet} images={images} />
          </div>
        ))}

        {sheets.length > 1 ? (
          <>
            <button
              type="button"
              disabled={active <= 0}
              onClick={(e) => {
                e.stopPropagation();
                setActive((i) => Math.max(0, i - 1));
              }}
              className="absolute left-1 top-1/2 z-50 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/70 text-foreground backdrop-blur disabled:opacity-25"
              aria-label="Hoja anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={active >= sheets.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setActive((i) => Math.min(sheets.length - 1, i + 1));
              }}
              className="absolute right-1 top-1/2 z-50 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/70 text-foreground backdrop-blur disabled:opacity-25"
              aria-label="Hoja siguiente"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      {sheets.length > 1 ? (
        <div className="flex shrink-0 justify-center gap-1.5 pt-3">
          {sheets.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Ver hoja ${index + 1}`}
              onClick={() => setActive(index)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                index === active ? 'w-5 bg-foreground/80' : 'w-1.5 bg-foreground/25 hover:bg-foreground/45',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
