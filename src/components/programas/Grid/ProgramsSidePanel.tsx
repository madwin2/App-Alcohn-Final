import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { Clock } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { Program, ProgramMachineType, ProgramStamp } from '@/lib/types/index';
import { StampThumb } from '@/components/programas/StampThumb';
import { getEligibleStamps } from '@/lib/supabase/services/programs.service';
import {
  resolvePlanchuelaRef,
  stampLengthAlongMm,
} from '@/lib/programas/material';
import { cn } from '@/lib/utils';

gsap.registerPlugin(useGSAP, Flip);

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type StampDragData = {
  type: 'stamp';
  stamp: ProgramStamp;
  machines: ProgramMachineType[];
};

export type ProgramDragData = {
  type: 'program';
  programId: string;
  getDragOrigin?: () => {
    programId: string;
    left: number;
    top: number;
    width: number;
    height: number;
    liftNeeded: number;
    lipY: number;
  } | null;
};

type EligibleEntry = {
  stamp: ProgramStamp;
  machines: ProgramMachineType[];
};

export type { EligibleEntry };

const MACHINE_ORDER: ProgramMachineType[] = ['C', 'G', 'XL'];

async function loadEligibleFromApi(): Promise<EligibleEntry[]> {
  const lists = await Promise.all(
    MACHINE_ORDER.map(async (machine) => ({
      machine,
      stamps: await getEligibleStamps({ machine }),
    })),
  );
  const byId = new Map<string, EligibleEntry>();
  for (const { machine, stamps } of lists) {
    for (const stamp of stamps) {
      const prev = byId.get(stamp.id);
      if (prev) {
        if (!prev.machines.includes(machine)) prev.machines.push(machine);
      } else {
        byId.set(stamp.id, { stamp, machines: [machine] });
      }
    }
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    if (Boolean(a.stamp.isPriority) !== Boolean(b.stamp.isPriority)) {
      return a.stamp.isPriority ? -1 : 1;
    }
    const oa = a.stamp.orderDate
      ? new Date(a.stamp.orderDate).getTime()
      : Number.POSITIVE_INFINITY;
    const ob = b.stamp.orderDate
      ? new Date(b.stamp.orderDate).getTime()
      : Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    const ca = a.stamp.createdAt ? new Date(a.stamp.createdAt).getTime() : 0;
    const cb = b.stamp.createdAt ? new Date(b.stamp.createdAt).getTime() : 0;
    return ca - cb;
  });
  return merged;
}

function machineTone(m: ProgramMachineType) {
  switch (m) {
    case 'C':
      return 'bg-purple-600 text-white shadow-[0_1px_4px_rgba(147,51,234,0.45)]';
    case 'G':
      return 'bg-blue-600 text-white shadow-[0_1px_4px_rgba(37,99,235,0.45)]';
    case 'XL':
      return 'bg-emerald-600 text-white shadow-[0_1px_4px_rgba(5,150,105,0.45)]';
    default:
      return 'bg-zinc-600 text-white';
  }
}

function stampOrderDateLabel(stamp: ProgramStamp): string | null {
  const raw = stamp.orderDate || stamp.createdAt;
  if (!raw) return null;
  try {
    const d = raw.length <= 10 ? parseISO(raw.slice(0, 10)) : new Date(raw);
    if (!isValid(d)) return null;
    return format(d, 'dd/MM/yy');
  } catch {
    return null;
  }
}

function stampPlanchuelaLabel(stamp: ProgramStamp): string | null {
  const ref = resolvePlanchuelaRef(stamp);
  const mm = stamp.lengthAlongMm ?? stampLengthAlongMm(stamp);
  if (!ref || mm <= 0) return null;
  return `P${ref} · +${Math.round(mm)} mm`;
}

function DraggableStamp({
  entry,
  collapsed,
  onDraggingChange,
}: {
  entry: EligibleEntry;
  collapsed: boolean;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const id = `stamp:${entry.stamp.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: {
      type: 'stamp',
      stamp: entry.stamp,
      machines: entry.machines,
    } satisfies StampDragData,
  });

  const wasDraggingRef = useRef(false);
  useEffect(() => {
    if (isDragging === wasDraggingRef.current) return;
    wasDraggingRef.current = isDragging;
    onDraggingChange(isDragging);
  }, [isDragging, onDraggingChange]);

  const machines = MACHINE_ORDER.filter((m) => entry.machines.includes(m));
  const note = entry.stamp.notes?.trim() || '';
  const priority = Boolean(entry.stamp.isPriority);
  const orderDate = stampOrderDateLabel(entry.stamp);
  const planchuela = stampPlanchuelaLabel(entry.stamp);

  return (
    <div
      ref={setNodeRef}
      data-vector-card=""
      data-collapsed={collapsed ? '' : undefined}
      className={cn(
        'relative cursor-grab overflow-visible rounded-xl bg-transparent p-1.5',
        'transition-colors active:cursor-grabbing',
        'hover:bg-zinc-800/70',
        // Sale de la grilla (display:none) para que el resto se reacomode; Flip anima el cambio.
        collapsed && 'hidden',
      )}
      {...listeners}
      {...attributes}
      title={entry.stamp.designName}
      aria-hidden={collapsed || undefined}
    >
      {note ? (
        <span
          role="img"
          aria-label="Tiene nota del pedido"
          title={note}
          className={cn(
            'pointer-events-none absolute -left-1.5 -top-1.5 z-20 flex h-4 w-4',
            'items-center justify-center rounded-full bg-zinc-900',
            'text-[10px] font-bold leading-none text-white',
            'ring-2 ring-background shadow-sm',
          )}
        >
          !
        </span>
      ) : null}
      {priority ? (
        <span
          role="img"
          aria-label="Prioritario"
          title="Prioritario"
          className={cn(
            'pointer-events-none absolute -right-1.5 -top-1.5 z-20 flex h-4 w-4',
            'items-center justify-center rounded-full bg-zinc-900 text-white',
            'ring-2 ring-background shadow-sm',
          )}
        >
          <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
        </span>
      ) : null}

      <div className="relative mx-auto aspect-square w-full max-w-[4.5rem]">
        <StampThumb
          stamp={entry.stamp}
          prefer="photo"
          className="h-full w-full rounded-md border-0 bg-white"
        />
        <div
          className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex flex-col items-end gap-0.5"
          aria-label={`Máquina ${machines.join(', ')}`}
        >
          {machines.map((m) => (
            <span
              key={m}
              className={cn(
                'flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5',
                'text-[7px] font-bold leading-none ring-1 ring-background',
                machineTone(m),
              )}
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-1 line-clamp-2 text-center text-[9px] font-medium leading-tight text-foreground">
        {entry.stamp.designName}
      </p>
      {(orderDate || planchuela) && (
        <div className="mt-0.5 flex flex-col items-center gap-0.5 text-center text-[8px] tabular-nums leading-none text-muted-foreground">
          {orderDate && <span>{orderDate}</span>}
          {planchuela && <span>{planchuela}</span>}
        </div>
      )}
    </div>
  );
}

function VectorsStampGrid({ list }: { list: EligibleEntry[] }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null);
  const [collapsedId, setCollapsedId] = useState<string | null>(null);
  const collapsedIdRef = useRef<string | null>(null);
  collapsedIdRef.current = collapsedId;

  const prepareFlip = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll('[data-vector-card]');
    Flip.killFlipsOf(cards);
    flipStateRef.current = Flip.getState(cards);
  }, []);

  const handleDraggingChange = useCallback(
    (stampId: string, dragging: boolean) => {
      const prev = collapsedIdRef.current;
      const next = dragging ? stampId : prev === stampId ? null : prev;
      if (next === prev) return;
      prepareFlip();
      collapsedIdRef.current = next;
      setCollapsedId(next);
    },
    [prepareFlip],
  );

  useLayoutEffect(() => {
    const state = flipStateRef.current;
    if (!state) return;
    flipStateRef.current = null;
    const reduce = prefersReducedMotion();
    Flip.from(state, {
      duration: reduce ? 0 : 0.48,
      ease: 'power3.inOut',
      absolute: true,
      nested: true,
      stagger: reduce ? 0 : 0.03,
      onLeave: (els) => {
        gsap.to(els, {
          opacity: 0,
          scale: 0.9,
          duration: reduce ? 0 : 0.3,
          ease: 'power2.in',
        });
      },
      onEnter: (els) => {
        gsap.fromTo(
          els,
          { opacity: 0, scale: 0.94 },
          {
            opacity: 1,
            scale: 1,
            duration: reduce ? 0 : 0.38,
            ease: 'power2.out',
          },
        );
      },
      onComplete: () => {
        const grid = gridRef.current;
        if (!grid) return;
        grid.querySelectorAll('[data-vector-card]:not([data-collapsed])').forEach((el) => {
          gsap.set(el, {
            clearProps:
              'transform,x,y,top,left,width,height,position,margin,opacity,visibility,scale',
          });
        });
      },
    });
  }, [collapsedId]);

  // Si el ítem ya no está en el pool (drop exitoso), limpiar el id colapsado.
  useEffect(() => {
    if (!collapsedId) return;
    if (list.some((e) => e.stamp.id === collapsedId)) return;
    collapsedIdRef.current = null;
    setCollapsedId(null);
  }, [list, collapsedId]);

  return (
    <div ref={gridRef} className="relative grid grid-cols-2 gap-2.5">
      {list.map((entry) => (
        <DraggableStamp
          key={entry.stamp.id}
          entry={entry}
          collapsed={collapsedId === entry.stamp.id}
          onDraggingChange={(dragging) => handleDraggingChange(entry.stamp.id, dragging)}
        />
      ))}
    </div>
  );
}

export function GlassFinishedFolder({
  open,
}: {
  open: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const backId = `gf-back-${uid}`;
  const frontId = `gf-front-${uid}`;
  const blurId = `gf-blur-${uid}`;
  const noiseId = `gf-noise-${uid}`;
  const frontClip = `gf-fclip-${uid}`;

  const L = 8;
  const R = 84;

  // Dorso + pestaña en UN solo path (sin capas extra que dejen artefactos)
  const backPath = [
    `M${L} 14`,
    'H34',
    'L40 22',
    `H${R - 6}`,
    `Q${R} 22 ${R} 28`,
    'V70',
    `Q${R} 76 ${R - 6} 76`,
    `H${L + 6}`,
    `Q${L} 76 ${L} 70`,
    'V22',
    `H${L}`,
    'Z',
  ].join(' ');

  const frontPath = [
    `M${L + 6} 30`,
    `H${R - 6}`,
    `Q${R} 30 ${R} 36`,
    'V70',
    `Q${R} 76 ${R - 6} 76`,
    `H${L + 6}`,
    `Q${L} 76 ${L} 70`,
    'V36',
    `Q${L} 30 ${L + 6} 30`,
    'Z',
  ].join(' ');

  return (
    <svg
      viewBox="0 0 92 82"
      className="h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={backId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4a4a52" />
          <stop offset="100%" stopColor="#1a1a1e" />
        </linearGradient>
        <linearGradient id={frontId} x1="0%" y1="0%" x2="10%" y2="100%">
          <stop offset="0%" stopColor="rgba(220,224,232,0.5)" />
          <stop offset="55%" stopColor="rgba(100,104,114,0.42)" />
          <stop offset="100%" stopColor="rgba(40,42,48,0.58)" />
        </linearGradient>
        <filter id={blurId} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>
        <filter id={noiseId} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.2"
            numOctaves="3"
            stitchTiles="stitch"
            result="n"
          />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0.9
                    0 0 0 0 0.92
                    0 0 0 0 0.95
                    0 0 0 0.2 0"
          />
        </filter>
        <clipPath id={frontClip}>
          <path d={frontPath} />
        </clipPath>
      </defs>

      <ellipse cx="46" cy="79" rx="28" ry="2.8" fill="#000" opacity="0.3" />

      <path d={backPath} fill={`url(#${backId})`} />

      <g
        style={{
          transform: open ? 'translateY(-7px)' : 'translateY(0)',
          transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <path d="M24 20h38l7 7v8H24V20z" fill="#e4e4ea" />
        <path d="M62 20v7h7z" fill="#c4c4ce" />
        <path d="M28 16h36l8 8v10H28V16z" fill="#f0f0f4" />
        <path d="M64 16v8h8z" fill="#d0d0d8" />
        <path d="M32 12h34l8 8v12H32V12z" fill="#fafafa" />
        <path d="M66 12v8h8z" fill="#dddde4" />
      </g>

      <g
        clipPath={`url(#${frontClip})`}
        filter={`url(#${blurId})`}
        style={{
          transform: open ? 'translateY(-7px)' : 'translateY(0)',
          transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <path d="M24 20h38l7 7v40H24V20z" fill="#e4e4ea" />
        <path d="M28 16h36l8 8v44H28V16z" fill="#f0f0f4" />
        <path d="M32 12h34l8 8v48H32V12z" fill="#fafafa" />
      </g>

      <path
        d={frontPath}
        fill={`url(#${frontId})`}
        style={{
          transform: open ? 'translateY(1px)' : 'translateY(0)',
          transition: 'transform 280ms ease-out',
        }}
      />
      <path
        d={frontPath}
        filter={`url(#${noiseId})`}
        opacity="0.5"
        style={{
          transform: open ? 'translateY(1px)' : 'translateY(0)',
          transition: 'transform 280ms ease-out',
          pointerEvents: 'none',
        }}
      />
      <path
        d={`M${L + 6} 30 H${R - 6} Q${R} 30 ${R} 36 V38 H${L} V36 Q${L} 30 ${L + 6} 30 Z`}
        fill="rgba(255,255,255,0.18)"
        style={{
          transform: open ? 'translateY(1px)' : 'translateY(0)',
          transition: 'transform 280ms ease-out',
          pointerEvents: 'none',
        }}
      />
      <path
        d={frontPath}
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1"
        style={{
          transform: open ? 'translateY(1px)' : 'translateY(0)',
          transition: 'transform 280ms ease-out',
          pointerEvents: 'none',
        }}
      />
    </svg>
  );
}

function FolderDropIcon({
  id,
  count,
  onOpen,
}: {
  id: string;
  count: number;
  onOpen: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const animRef = useRef<HTMLDivElement>(null);
  const floatTweenRef = useRef<gsap.core.Tween | null>(null);

  const setRefs = (node: HTMLButtonElement | null) => {
    setNodeRef(node);
  };

  useGSAP(
    () => {
      if (!animRef.current) return;
      floatTweenRef.current?.kill();
      floatTweenRef.current = gsap.to(animRef.current.querySelector('[data-folder-float]'), {
        y: -3,
        duration: 2.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    },
    { scope: animRef },
  );

  useEffect(() => {
    const body = animRef.current?.querySelector('[data-folder-float]');
    if (!body) return;
    if (isOver) {
      floatTweenRef.current?.pause();
      gsap.to(body, { scale: 1.07, y: -2, duration: 0.3, ease: 'power2.out' });
    } else {
      gsap.to(body, {
        scale: 1,
        y: 0,
        duration: 0.28,
        ease: 'power2.out',
        onComplete: () => floatTweenRef.current?.play(),
      });
    }
  }, [isOver]);

  return (
    <button
      type="button"
      ref={setRefs}
      data-dock-target={id}
      onClick={onOpen}
      className={cn(
        'group relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2 outline-none',
        'transition duration-300',
        isOver && 'scale-110',
      )}
      aria-label={`Terminados (${count})`}
      title="Terminados — soltá un programa o hacé click"
    >
      <div ref={animRef} className="relative h-[4.6rem] w-[5.25rem]">
        <div data-folder-float className="relative h-full w-full will-change-transform">
          <GlassFinishedFolder open={isOver} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-100 px-1 text-[9px] font-bold text-zinc-900 ring-2 ring-background">
              {count}
            </span>
          )}
        </div>
      </div>
      <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        Terminados
      </span>
    </button>
  );
}

export function GlassTrashBin({ open }: { open: boolean }) {
  const uid = useId().replace(/:/g, '');
  const bodyId = `tb-body-${uid}`;
  const rimId = `tb-rim-${uid}`;
  const innerId = `tb-inner-${uid}`;
  const softId = `tb-soft-${uid}`;
  const frostId = `tb-frost-${uid}`;
  const blurId = `tb-blur-${uid}`;
  const bodyClip = `tb-clip-${uid}`;

  const bodyPath = `M14 22
           C14 22 16 62 20 68
           C22 71 28 73 36 73
           C44 73 50 71 52 68
           C56 62 58 22 58 22
           Z`;

  return (
    <svg
      viewBox="0 0 72 78"
      className="h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={bodyId} x1="0%" y1="0%" x2="100%" y2="20%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="75%" stopColor="rgba(230,232,240,0.38)" />
          <stop offset="100%" stopColor="rgba(180,184,196,0.45)" />
        </linearGradient>
        <linearGradient id={rimId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(200,204,214,0.55)" />
        </linearGradient>
        <radialGradient id={innerId} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#9a9aa4" />
          <stop offset="100%" stopColor="#4a4a54" />
        </radialGradient>
        <filter id={softId} x="-25%" y="-15%" width="150%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.8" floodColor="#000" floodOpacity="0.4" />
        </filter>
        <filter id={blurId} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" />
        </filter>
        <filter id={frostId} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.05"
            numOctaves="3"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.95
                    0 0 0 0 0.96
                    0 0 0 0 0.98
                    0 0 0 0.28 0"
            result="frost"
          />
          <feComposite in="frost" in2="SourceGraphic" operator="in" result="frostClip" />
          <feBlend in="SourceGraphic" in2="frostClip" mode="soft-light" />
        </filter>
        <clipPath id={bodyClip}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <ellipse cx="36" cy="73" rx="18" ry="3" fill="#000" opacity="0.22" />

      {/* Contenido interno (se ve borroso a través del frost) */}
      <g clipPath={`url(#${bodyClip})`} filter={`url(#${blurId})`} opacity="0.85">
        <ellipse cx="36" cy="48" rx="14" ry="18" fill="#7dd3fc" opacity="0.45" />
        <ellipse cx="28" cy="55" rx="10" ry="12" fill="#86efac" opacity="0.4" />
        <ellipse cx="44" cy="52" rx="9" ry="11" fill="#fdba74" opacity="0.4" />
        <ellipse cx="36" cy="40" rx="11" ry="8" fill="#f4f4f8" opacity="0.55" />
      </g>

      {/* Cuerpo glass frosted */}
      <path
        d={bodyPath}
        fill={`url(#${bodyId})`}
        filter={`url(#${frostId})`}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.8"
      />
      <path
        d={bodyPath}
        fill="none"
        filter={`url(#${softId})`}
        stroke="transparent"
      />

      {/* Highlight lateral (vidrio) */}
      <path
        d="M28 24
           C29 40 30 58 32 66
           C33 69 34.5 70.5 36 70.5
           C37.5 70.5 39 69 40 66
           C42 58 43 40 44 24
           Z"
        fill="rgba(255,255,255,0.22)"
      />

      <ellipse cx="36" cy="22" rx="22" ry="7.5" fill={`url(#${innerId})`} />

      <ellipse
        cx="36"
        cy="22"
        rx="22"
        ry="7.5"
        fill="none"
        stroke={`url(#${rimId})`}
        strokeWidth="3.2"
      />
      <ellipse
        cx="36"
        cy="21.2"
        rx="20.5"
        ry="6.2"
        fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.1"
      />

      <g
        style={{
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(6px)',
          transition:
            'opacity 280ms ease-out, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <path d="M24 18l4-8 3 5 5-7 4 9 6-6 3 7z" fill="#f0f0f4" opacity="0.95" />
        <path d="M30 14l6-5 2 4 4-3 1 6z" fill="#7dd3fc" opacity="0.8" />
        <path d="M42 12l5-4 2 5 3-2 1 5z" fill="#86efac" opacity="0.75" />
        <path d="M36 16l3-6 4 3 2-4 3 7z" fill="#fdba74" opacity="0.7" />
      </g>
    </svg>
  );
}

function TrashDropIcon({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const animRef = useRef<HTMLDivElement>(null);
  const floatTweenRef = useRef<gsap.core.Tween | null>(null);

  useGSAP(
    () => {
      if (!animRef.current) return;
      floatTweenRef.current?.kill();
      floatTweenRef.current = gsap.to(animRef.current.querySelector('[data-trash-float]'), {
        y: -3,
        duration: 2.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    },
    { scope: animRef },
  );

  useEffect(() => {
    const body = animRef.current?.querySelector('[data-trash-float]');
    if (!body) return;
    if (isOver) {
      floatTweenRef.current?.pause();
      gsap.to(body, { scale: 1.08, y: -2, duration: 0.3, ease: 'power2.out' });
    } else {
      gsap.to(body, {
        scale: 1,
        y: 0,
        duration: 0.28,
        ease: 'power2.out',
        onComplete: () => floatTweenRef.current?.play(),
      });
    }
  }, [isOver]);

  return (
    <div
      ref={setNodeRef}
      data-dock-target={id}
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2',
        'transition duration-300',
        isOver && 'scale-110',
      )}
      aria-label="Papelera"
      title="Papelera — soltá un programa para borrarlo"
    >
      <div ref={animRef} className="relative h-[4.6rem] w-[4.25rem]">
        <div data-trash-float className="relative h-full w-full will-change-transform">
          <GlassTrashBin open={isOver} />
        </div>
      </div>
      <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        Papelera
      </span>
    </div>
  );
}

interface ProgramsSidePanelProps {
  finishedPrograms: Program[];
  refreshKey?: number;
  /** Si se pasa, no pega a Supabase (sandbox /dev). */
  loadEligibleEntries?: () => Promise<EligibleEntry[]>;
  onOpenFinished?: () => void;
}

export function ProgramsSidePanel({
  finishedPrograms,
  refreshKey = 0,
  loadEligibleEntries,
  onOpenFinished,
}: ProgramsSidePanelProps) {
  const [entries, setEntries] = useState<EligibleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const merged = await (loadEligibleEntries ?? loadEligibleFromApi)();
        if (cancelled) return;
        setEntries(merged);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los vectores');
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, loadEligibleEntries]);

  const finishedCount = finishedPrograms.length;
  const list = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (Boolean(a.stamp.isPriority) !== Boolean(b.stamp.isPriority)) {
        return a.stamp.isPriority ? -1 : 1;
      }
      const oa = a.stamp.orderDate
        ? new Date(a.stamp.orderDate).getTime()
        : Number.POSITIVE_INFINITY;
      const ob = b.stamp.orderDate
        ? new Date(b.stamp.orderDate).getTime()
        : Number.POSITIVE_INFINITY;
      if (oa !== ob) return oa - ob;
      const ca = a.stamp.createdAt ? new Date(a.stamp.createdAt).getTime() : 0;
      const cb = b.stamp.createdAt ? new Date(b.stamp.createdAt).getTime() : 0;
      return ca - cb;
    });
  }, [entries]);

  return (
    <aside className="flex h-full min-h-[28rem] flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/40 shadow-sm">
        <div className="border-b border-border/60 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Vectores
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Cargando…</p>
          ) : error ? (
            <p className="px-1 py-6 text-center text-xs text-destructive">{error}</p>
          ) : list.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No hay vectores listos
            </p>
          ) : (
            <VectorsStampGrid list={list} />
          )}
        </div>
      </div>

      <div className="flex items-end justify-around gap-2 px-1 pb-1 pt-2">
        <FolderDropIcon
          id="folder-finished"
          count={finishedCount}
          onOpen={() => onOpenFinished?.()}
        />
        <TrashDropIcon id="trash-program" />
      </div>
    </aside>
  );
}

/**
 * Droppable para recibir vectores. La hoja se arrastra desde adentro de ProgramCardDesign.
 */
export function ProgramDropTarget({
  programId,
  children,
  className,
}: {
  programId: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `program:${programId}`,
    data: { type: 'program-slot', programId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative rounded-sm transition',
        isOver && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptySlotDropTarget({
  machine,
  children,
}: {
  machine: ProgramMachineType;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `empty:${machine}`,
    data: { type: 'empty-slot', machine },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative rounded-sm transition',
        isOver && 'ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background',
      )}
    >
      {children}
    </div>
  );
}

/** @deprecated Usá ProgramDropTarget (toda la hoja es arrastrable). */
export function ProgramDragHandle(_props: {
  programId: string;
  className?: string;
}) {
  return null;
}
