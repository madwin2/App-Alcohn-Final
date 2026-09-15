import { useEffect, useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { cn } from '@/lib/utils/cn';

gsap.registerPlugin(useGSAP);

interface Props {
  children: ReactNode;
  className?: string;
}

const FADE_TOP =
  'linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background)/0.92) 18%, hsl(var(--background)/0.65) 38%, hsl(var(--background)/0.32) 58%, hsl(var(--background)/0.1) 78%, transparent 100%)';
const FADE_BOTTOM =
  'linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background)/0.92) 18%, hsl(var(--background)/0.65) 38%, hsl(var(--background)/0.32) 58%, hsl(var(--background)/0.1) 78%, transparent 100%)';

/**
 * Campo abierto de miniaturas: sin caja, títulos ni scrollbar.
 * Fade largo arriba/abajo + gravedad suave al cursor.
 */
export function ThumbsRail({ children, className }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0, active: false });

  useGSAP(
    () => {
      const root = rootRef.current;
      const grid = gridRef.current;
      if (!root || !grid) return;

      const tick = () => {
        if (!mouse.current.active) return;
        const items = grid.querySelectorAll<HTMLElement>('[data-thumb]');
        items.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = (mouse.current.x - cx) / Math.max(rect.width, 1);
          const dy = (mouse.current.y - cy) / Math.max(rect.height, 1);
          const dist = Math.hypot(dx, dy);
          const falloff = Math.max(0, 1 - dist / 2.4);
          const lift = falloff * falloff;
          gsap.to(el, {
            x: dx * 14 * lift,
            y: dy * 10 * lift - 10 * lift,
            rotate: dx * 3.5 * lift,
            duration: 0.85,
            ease: 'power3.out',
            overwrite: 'auto',
          });
        });
      };

      const onMove = (e: MouseEvent) => {
        mouse.current = { x: e.clientX, y: e.clientY, active: true };
        tick();
      };
      const onLeave = () => {
        mouse.current.active = false;
        grid.querySelectorAll<HTMLElement>('[data-thumb]').forEach((el) => {
          gsap.to(el, {
            x: 0,
            y: 0,
            rotate: 0,
            duration: 1.1,
            ease: 'elastic.out(1, 0.55)',
            overwrite: 'auto',
          });
        });
      };

      root.addEventListener('mousemove', onMove);
      root.addEventListener('mouseleave', onLeave);
      return () => {
        root.removeEventListener('mousemove', onMove);
        root.removeEventListener('mouseleave', onLeave);
      };
    },
    { scope: rootRef },
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let velocity = 0;
    let raf = 0;

    const step = () => {
      if (Math.abs(velocity) < 0.05) {
        velocity = 0;
        raf = 0;
        return;
      }
      scroller.scrollTop += velocity;
      velocity *= 0.92;
      raf = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      velocity += e.deltaY * 0.18;
      if (!raf) raf = requestAnimationFrame(step);
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <aside ref={rootRef} className={cn('relative min-h-0 min-w-0', className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[42%]"
        style={{ backgroundImage: FADE_TOP }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[42%]"
        style={{ backgroundImage: FADE_BOTTOM }}
        aria-hidden
      />
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto overflow-x-hidden px-2 py-[18%] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={gridRef}
          className="grid grid-cols-3 gap-x-3 gap-y-5 xl:grid-cols-4 [&>*:nth-child(3n+2)]:mt-5 [&>*:nth-child(3n+3)]:mt-2 xl:[&>*:nth-child(4n+2)]:mt-6 xl:[&>*:nth-child(4n+3)]:mt-3 xl:[&>*:nth-child(4n+4)]:mt-8"
        >
          {children}
        </div>
      </div>
    </aside>
  );
}
