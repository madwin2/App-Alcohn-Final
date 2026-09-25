import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, Search } from 'lucide-react';
import type { Program } from '@/lib/types/index';
import { cn } from '@/lib/utils';
import {
  ProgramCardDesign,
  ProgramSheetDragPreview,
  type ProgramCardDesignProps,
} from './ProgramCardDesign';

gsap.registerPlugin(useGSAP);

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type CardProps = Omit<ProgramCardDesignProps, 'program' | 'className'>;

/** Cuánto asoma el encabezado de cada hoja detrás (fichero). */
const PEEK_Y = 64;
const MAX_VISIBLE = 10;
const CARD_W = 'min(19.5rem, 82vw)';

function sheetTransform(rel: number) {
  // rel 0 = frente; >0 = más atrás (más arriba en el fichero)
  const behind = Math.max(0, rel);
  const ahead = Math.min(0, rel);
  return {
    y: behind * -PEEK_Y + ahead * (PEEK_Y * 1.15),
    z: -behind * 36 + ahead * 40,
    scale: Math.max(0.82, 1 - behind * 0.028 + ahead * 0.04),
    rotateX: 10 + behind * 0.85,
    opacity:
      rel < -1
        ? 0
        : rel < 0
          ? 0.35
          : Math.max(0.55, 1 - behind * 0.045),
    zIndex: 1000 - Math.round(rel * 10),
    visible: rel >= -1 && rel <= MAX_VISIBLE,
  };
}

export function FinishedProgramsBrowse({
  programs,
  cardProps,
  onBack,
}: {
  programs: Program[];
  cardProps: CardProps;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<{ y: number; index: number } | null>(null);
  const wheelLockRef = useRef(false);
  const leavingRef = useRef(false);
  const enteredRef = useRef(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((p) => p.name.toLowerCase().includes(q));
  }, [programs, query]);

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const goTo = useCallback(
    (next: number) => {
      if (filtered.length === 0) return;
      setActiveIndex(Math.max(0, Math.min(filtered.length - 1, next)));
    },
    [filtered.length],
  );

  const applyLayout = useCallback(
    (opts?: { immediate?: boolean; staggerIn?: boolean }) => {
      const reduced = prefersReducedMotion();
      const immediate = Boolean(opts?.immediate) || reduced;
      const staggerIn = Boolean(opts?.staggerIn) && !reduced;

      filtered.forEach((program, i) => {
        const el = cardsRef.current.get(program.id);
        if (!el) return;
        const rel = i - activeIndex;
        const t = sheetTransform(rel);

        if (!t.visible) {
          gsap.set(el, { autoAlpha: 0, pointerEvents: 'none' });
          return;
        }

        const vars = {
          y: t.y,
          z: t.z,
          scale: t.scale,
          rotationX: t.rotateX,
          autoAlpha: t.opacity,
          zIndex: t.zIndex,
          pointerEvents: rel === 0 ? 'auto' : 'auto',
          transformPerspective: 1600,
          transformOrigin: '50% 100%',
          force3D: true,
        };

        if (immediate) {
          gsap.set(el, vars);
          return;
        }

        if (staggerIn) {
          gsap.fromTo(
            el,
            {
              y: t.y - 48 - rel * 12,
              z: t.z - 80,
              scale: t.scale * 0.92,
              rotationX: t.rotateX + 8,
              autoAlpha: 0,
              transformPerspective: 1600,
              transformOrigin: '50% 100%',
            },
            {
              ...vars,
              duration: 0.7,
              delay: Math.min(i, 8) * 0.045,
              ease: 'power3.out',
              overwrite: 'auto',
            },
          );
          return;
        }

        gsap.to(el, {
          ...vars,
          duration: 0.65,
          ease: 'power2.inOut',
          overwrite: 'auto',
        });
      });
    },
    [activeIndex, filtered],
  );

  // Entrada de página + armado del fichero
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const reduced = prefersReducedMotion();

      if (!enteredRef.current) {
        enteredRef.current = true;
        if (reduced) {
          gsap.set(root, { autoAlpha: 1, y: 0 });
          applyLayout({ immediate: true });
        } else {
          gsap.set(root, { autoAlpha: 0, y: 18 });
          applyLayout({ immediate: true });
          gsap.to(root, {
            autoAlpha: 1,
            y: 0,
            duration: 0.45,
            ease: 'power2.out',
          });
          // Re-armar con stagger una vez montados los nodos
          requestAnimationFrame(() => applyLayout({ staggerIn: true }));
        }
        return;
      }

      applyLayout();
    },
    { dependencies: [activeIndex, filtered, applyLayout], scope: rootRef },
  );

  const handleBack = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) {
      onBack();
      return;
    }
    gsap.to(root, {
      autoAlpha: 0,
      y: 14,
      duration: 0.32,
      ease: 'power2.inOut',
      onComplete: onBack,
    });
  }, [onBack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openId) {
        if (e.key === 'Escape') setOpenId(null);
        return;
      }
      if (e.key === 'Escape') {
        handleBack();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(activeIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(activeIndex - 1);
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        setOpenId(filtered[activeIndex].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, filtered, goTo, handleBack, openId]);

  const onWheel = (e: ReactWheelEvent) => {
    if (openId) return;
    e.preventDefault();
    if (wheelLockRef.current) return;
    wheelLockRef.current = true;
    const dir = e.deltaY > 0 ? 1 : -1;
    goTo(activeIndex + dir);
    window.setTimeout(() => {
      wheelLockRef.current = false;
    }, prefersReducedMotion() ? 0 : 320);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (openId || e.button !== 0) return;
    // No capturar si el click es en el buscador
    const target = e.target as HTMLElement;
    if (target.closest('input, button, label')) return;
    dragRef.current = { y: e.clientY, index: activeIndex };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.y - e.clientY;
    const steps = Math.round(dy / PEEK_Y);
    goTo(drag.index + steps);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const openProgram = filtered[activeIndex] ?? null;
  const stackLift = Math.min(filtered.length - 1, MAX_VISIBLE) * PEEK_Y;

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-h-[36rem] flex-col"
    >
      <div className="absolute left-0 top-0 z-20">
        <button
          type="button"
          onClick={handleBack}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-2.5 py-2',
            'text-sm font-medium text-zinc-300 transition-colors',
            'hover:bg-zinc-800/80 hover:text-white',
          )}
          aria-label="Volver a programas"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          <span className="hidden sm:inline">Programas</span>
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Terminados
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          {filtered.length === 0
            ? query
              ? 'Sin resultados'
              : 'Todavía no hay programas finalizados'
            : `${activeIndex + 1} / ${filtered.length}`}
        </p>
      </div>

      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 cursor-grab touch-none items-center justify-center overflow-hidden px-4 pb-24 pt-14 active:cursor-grabbing"
        style={{ perspective: '1600px', perspectiveOrigin: '50% 55%' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="listbox"
        aria-label="Programas terminados"
        aria-activedescendant={openProgram ? `finished-sheet-${openProgram.id}` : undefined}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-[58%] h-16 w-[min(24rem,78vw)] -translate-x-1/2 rounded-[100%] bg-black/55 blur-3xl"
          aria-hidden
        />

        {/* Contenedor del fichero: altura = hoja + picos visibles */}
        <div
          className="relative"
          style={{
            width: CARD_W,
            height: `calc(22rem + ${stackLift}px)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {filtered.map((program, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={program.id}
                id={`finished-sheet-${program.id}`}
                role="option"
                aria-selected={isActive}
                ref={(node) => {
                  if (node) cardsRef.current.set(program.id, node);
                  else cardsRef.current.delete(program.id);
                }}
                className="absolute inset-x-0 bottom-0 will-change-transform"
                style={{ transformStyle: 'preserve-3d' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (i !== activeIndex) {
                    goTo(i);
                    return;
                  }
                  setOpenId(program.id);
                }}
              >
                <ProgramSheetDragPreview
                  program={program}
                  className={cn(
                    'w-full max-w-none',
                    'shadow-[0_18px_40px_rgba(0,0,0,0.42),0_2px_0_rgba(255,255,255,0.06)_inset]',
                    isActive && 'ring-1 ring-white/15',
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 pt-2">
        <label className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Buscar por nombre…"
            className={cn(
              'h-11 w-full rounded-full border border-zinc-700/80 bg-zinc-900/90',
              'pl-10 pr-4 text-sm text-zinc-100 outline-none',
              'placeholder:text-zinc-500',
              'focus:border-zinc-500 focus:ring-2 focus:ring-zinc-600/40',
            )}
          />
        </label>
      </div>

      {openId ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          onClick={() => setOpenId(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="absolute -left-1 -top-12 z-10 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Cerrar hoja
            </button>
            {programs
              .filter((p) => p.id === openId)
              .map((program) => (
                <ProgramCardDesign
                  key={program.id}
                  program={program}
                  {...cardProps}
                  className="mx-auto"
                />
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
