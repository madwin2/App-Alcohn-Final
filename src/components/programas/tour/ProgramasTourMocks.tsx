import { useRef, type ReactNode } from 'react';
import { DndContext } from '@dnd-kit/core';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Plus, Search } from 'lucide-react';
import type { Program, ProgramStamp } from '@/lib/types/index';
import { cn } from '@/lib/utils';
import { StampThumb } from '@/components/programas/StampThumb';
import {
  ProgramCardDesign,
  ProgramSheetDragPreview,
} from '@/components/programas/Grid/ProgramCardDesign';
import {
  GlassFinishedFolder,
  GlassTrashBin,
} from '@/components/programas/Grid/ProgramsSidePanel';
import { PROGRAM_CARD_SCENARIOS } from '@/app/dev/programas-card/mockPrograms';

gsap.registerPlugin(useGSAP);

const VECTORS = [
  '/programas/mock-vectors/v2.svg',
  '/programas/mock-vectors/v3.svg',
  '/programas/mock-vectors/v4.svg',
  '/programas/mock-vectors/v5.svg',
  '/programas/mock-vectors/v6.svg',
];

const POCKET_H_PX = 12.5 * 16;
const POCKET_W_PX = 260;

function tourStamp(
  partial: Partial<ProgramStamp> & Pick<ProgramStamp, 'id' | 'designName'>,
  imgIndex = 0,
): ProgramStamp {
  const img = VECTORS[imgIndex % VECTORS.length];
  return {
    widthMm: 25,
    heightMm: 40,
    stampType: 'CLASICO',
    tipoPlanchuela: 25,
    lengthAlongMm: 42,
    fabricationState: 'SIN_HACER',
    previewUrl: img,
    vectorPreviewUrl: img,
    ...partial,
  };
}

function withVectorThumbs(program: Program, seed = 0): Program {
  return {
    ...program,
    previewUrl: VECTORS[seed % VECTORS.length],
    stamps: program.stamps.map((s, i) => {
      const img = VECTORS[(seed + i) % VECTORS.length];
      return { ...s, previewUrl: img, vectorPreviewUrl: img, photoUrl: undefined };
    }),
  };
}

const progFab = withVectorThumbs(
  PROGRAM_CARD_SCENARIOS.find((s) => s.id === 'en-fabricacion')!.program,
  0,
);
const progListo = withVectorThumbs(
  PROGRAM_CARD_SCENARIOS.find((s) => s.id === 'listo')!.program,
  1,
);
const progFin = withVectorThumbs(
  PROGRAM_CARD_SCENARIOS.find((s) => s.id === 'finalizado')!.program,
  2,
);
const progBorrador = withVectorThumbs(
  PROGRAM_CARD_SCENARIOS.find((s) => s.id === 'borrador-con-sellos')!.program,
  0,
);
const progBloqueado = withVectorThumbs(
  PROGRAM_CARD_SCENARIOS.find((s) => s.id === 'bloqueado')!.program,
  2,
);

const VECTOR_ENTRIES = [
  {
    stamp: tourStamp(
      {
        id: 'tv1',
        designName: 'Caballeriza',
        orderDate: '2026-09-18',
        tipoPlanchuela: 12,
        lengthAlongMm: 88,
      },
      0,
    ),
    machines: ['C', 'G'] as const,
  },
  {
    stamp: tourStamp({ id: 'tv2', designName: 'Ñandú', orderDate: '2026-09-17', tipoPlanchuela: 25 }, 1),
    machines: ['C'] as const,
  },
  {
    stamp: tourStamp(
      {
        id: 'tv3',
        designName: 'Herradura',
        orderDate: '2026-09-16',
        tipoPlanchuela: 38,
        widthMm: 38,
      },
      2,
    ),
    machines: ['G', 'XL'] as const,
  },
  {
    stamp: tourStamp(
      { id: 'tv4', designName: 'El Galpón', orderDate: '2026-09-15', tipoPlanchuela: 19 },
      3,
    ),
    machines: ['C', 'G'] as const,
  },
];

/** Llena el panel de media y centra el contenido. */
function Stage({
  children,
  className,
  caption,
}: {
  children: ReactNode;
  className?: string;
  caption?: string;
}) {
  return (
    <DndContext>
      <div className={cn('absolute inset-0 overflow-hidden bg-zinc-950', className)}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% 40%, rgba(39,39,42,0.85), transparent 68%)',
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
          {children}
          {caption ? (
            <p className="text-center text-[10px] text-zinc-500">{caption}</p>
          ) : null}
        </div>
      </div>
    </DndContext>
  );
}

function ColHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="mb-1 flex items-center justify-center gap-1.5">
      <span className={cn('h-3 w-0.5 rounded-full', accent)} />
      <p className="text-[10px] font-semibold tracking-tight text-zinc-200">{label}</p>
    </div>
  );
}

function FrozenCard({
  program,
  scale = 0.72,
  className,
}: {
  program: Program;
  scale?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('pointer-events-none relative select-none', className)}
      style={{
        width: POCKET_W_PX * scale,
        height: POCKET_H_PX * scale,
      }}
      aria-hidden
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: POCKET_W_PX,
          height: POCKET_H_PX,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <ProgramCardDesign program={program} className="w-full" />
      </div>
    </div>
  );
}

function VectorCardStatic({
  stamp,
  machines,
  hovered,
}: {
  stamp: ProgramStamp;
  machines: readonly string[];
  hovered?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center rounded-xl p-1.5',
        hovered ? 'bg-zinc-800/70' : 'bg-transparent',
      )}
    >
      <div className="relative aspect-square w-full max-w-[4rem]">
        <StampThumb
          stamp={stamp}
          prefer="vector"
          className="h-full w-full rounded-md border-0 bg-white"
        />
        <div className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex flex-col items-end gap-0.5">
          {machines.map((m) => (
            <span
              key={m}
              className={cn(
                'flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5',
                'text-[7px] font-bold leading-none ring-1 ring-zinc-950',
                m === 'C' && 'bg-violet-600 text-white',
                m === 'G' && 'bg-sky-600 text-white',
                m === 'XL' && 'bg-amber-600 text-white',
              )}
            >
              {m}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-1 line-clamp-1 text-center text-[8px] font-medium text-zinc-200">
        {stamp.designName}
      </p>
      <p className="text-[7px] tabular-nums text-zinc-500">
        {stamp.orderDate
          ? new Date(stamp.orderDate).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
            })
          : ''}
      </p>
    </div>
  );
}

export function MockIntro() {
  return (
    <Stage>
      <FrozenCard program={progFab} scale={0.78} />
    </Stage>
  );
}

export function MockBoard() {
  return (
    <Stage>
      <div className="grid w-full max-w-lg grid-cols-[1fr_1fr_1fr_minmax(5.75rem,6.75rem)] items-start gap-2">
        <div className="min-w-0">
          <ColHeader label="Chica" accent="bg-violet-500" />
          <div className="flex justify-center">
            <FrozenCard program={progFab} scale={0.38} />
          </div>
        </div>
        <div className="min-w-0">
          <ColHeader label="Grande" accent="bg-sky-500" />
          <div className="flex justify-center">
            <FrozenCard program={progListo} scale={0.38} />
          </div>
        </div>
        <div className="min-w-0">
          <ColHeader label="XL" accent="bg-amber-500" />
          <div className="flex justify-center">
            <FrozenCard program={progBloqueado} scale={0.38} />
          </div>
        </div>
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/70">
          <div className="border-b border-white/5 px-2 py-1.5">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Vectores
            </p>
          </div>
          <div className="grid grid-cols-2 gap-0.5 p-1">
            {VECTOR_ENTRIES.map((e, i) => (
              <VectorCardStatic
                key={e.stamp.id}
                stamp={e.stamp}
                machines={e.machines}
                hovered={i === 0}
              />
            ))}
          </div>
        </div>
      </div>
    </Stage>
  );
}

export function MockPocket() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = wrapRef.current;
      if (!root) return;
      const peek = root.querySelector('[data-program-peek]') as HTMLElement | null;
      if (!peek) return;

      const restH = Math.max(48, peek.getBoundingClientRect().height);
      gsap.set(peek, { maxHeight: restH, overflow: 'hidden' });

      gsap.to(peek, {
        maxHeight: Math.min(restH * 1.55, 280),
        paddingBottom: 36,
        duration: 1.35,
        ease: 'power2.inOut',
        yoyo: true,
        repeat: -1,
        repeatDelay: 0.45,
      });
    },
    { scope: wrapRef },
  );

  return (
    <Stage caption="Hover asoma · click abre en grande">
      <div ref={wrapRef} className="group/pocket">
        <FrozenCard program={progFab} scale={0.82} />
      </div>
    </Stage>
  );
}

export function MockEstados() {
  const cards = [
    { program: progFab, caption: 'En fabricación' },
    { program: progListo, caption: 'Listo' },
    { program: progFin, caption: 'Finalizado' },
  ];
  return (
    <Stage caption="La ficha de color va detrás de la hoja blanca">
      <div className="flex items-end justify-center gap-3">
        {cards.map(({ program, caption }) => (
          <div key={program.id} className="flex flex-col items-center gap-1.5">
            <FrozenCard program={program} scale={0.4} />
            <p className="text-[9px] font-medium text-zinc-400">{caption}</p>
          </div>
        ))}
      </div>
    </Stage>
  );
}

export function MockVectores() {
  return (
    <Stage caption="Preview blanco · hover gris · arrastrá al bolsillo">
      <div className="w-full max-w-[17.5rem] rounded-xl border border-white/10 bg-zinc-900/70 shadow-lg">
        <div className="border-b border-white/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Vectores
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 p-2.5">
          {VECTOR_ENTRIES.map((e, i) => (
            <VectorCardStatic
              key={e.stamp.id}
              stamp={e.stamp}
              machines={e.machines}
              hovered={i === 0}
            />
          ))}
        </div>
      </div>
    </Stage>
  );
}

export function MockHoja() {
  const pickerStamps = VECTOR_ENTRIES.slice(0, 3).map((e) => e.stamp);
  return (
    <Stage>
      <div className="relative w-[min(100%,14rem)]">
        <div className="pointer-events-none overflow-hidden rounded-md shadow-2xl ring-1 ring-white/10">
          <ProgramSheetDragPreview
            program={progBorrador}
            className="!max-h-none w-full max-w-none"
          />
        </div>
        <div className="absolute inset-x-3 bottom-[16%] rounded-md border border-zinc-200 bg-white p-2 shadow-xl">
          <p className="mb-1.5 text-[8px] font-medium text-zinc-500">
            Elegí diseños para sumar
          </p>
          <div className="flex gap-1.5">
            {pickerStamps.map((s) => (
              <div
                key={s.id}
                className="relative h-10 w-10 overflow-hidden rounded bg-white ring-2 ring-sky-500/60"
              >
                <StampThumb stamp={s} prefer="vector" className="h-full w-full border-0 bg-white" />
              </div>
            ))}
            <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-zinc-300 text-zinc-400">
              <Plus className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <span className="rounded bg-zinc-900 px-2.5 py-1 text-[9px] font-medium text-white">
              Agregar 2
            </span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

export function MockDock() {
  const sheetRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = sheetRef.current;
      if (!el) return;
      gsap.fromTo(
        el,
        { y: -18, x: -10, rotate: -8 },
        {
          y: 8,
          x: 18,
          rotate: -2,
          duration: 1.5,
          ease: 'power1.inOut',
          yoyo: true,
          repeat: -1,
          repeatDelay: 0.35,
        },
      );
    },
    { scope: sheetRef },
  );

  return (
    <Stage>
      <div className="flex flex-col items-center gap-5">
        <div
          ref={sheetRef}
          className="pointer-events-none w-[11rem] will-change-transform"
          style={{ filter: 'drop-shadow(0 18px 28px rgba(0,0,0,0.5))' }}
        >
          <ProgramSheetDragPreview
            program={progFab}
            className="w-full max-w-none !max-h-[11.5rem]"
          />
        </div>
        <div className="flex items-end justify-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <div className="relative h-[4.6rem] w-[5.25rem]">
              <GlassFinishedFolder open />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-100 px-1 text-[9px] font-bold text-zinc-900 ring-2 ring-zinc-950">
                4
              </span>
            </div>
            <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-400">
              Terminados
            </span>
            <span className="text-[9px] text-emerald-400">← soltá acá</span>
          </div>
          <div className="flex flex-col items-center gap-1 opacity-80">
            <div className="relative h-[4.6rem] w-[4.5rem]">
              <GlassTrashBin open={false} />
            </div>
            <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              Papelera
            </span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

export function MockTerminados() {
  const stackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const cards = stackRef.current?.querySelectorAll('[data-fin-card]');
      if (!cards?.length) return;
      gsap.fromTo(
        cards,
        { y: (i) => 8 + i * 2 },
        {
          y: (i) => -i * 2,
          duration: 1.6,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          stagger: 0.08,
        },
      );
    },
    { scope: stackRef },
  );

  const stack = [progFin, progListo, progFab];
  return (
    <Stage>
      <div className="flex w-full max-w-[15rem] flex-col items-center gap-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Terminados · 1 / 3
        </p>
        <div
          ref={stackRef}
          className="relative h-[12rem] w-full"
          style={{ perspective: '1100px' }}
        >
          {stack.map((program, i) => {
            const behind = stack.length - 1 - i;
            return (
              <div
                key={program.id}
                data-fin-card=""
                className="pointer-events-none absolute inset-x-[6%] bottom-0 origin-bottom will-change-transform"
                style={{
                  transform: `translateY(${-behind * 24}px) rotateX(${8 + behind}deg) scale(${1 - behind * 0.035})`,
                  zIndex: 20 - behind,
                }}
              >
                <ProgramSheetDragPreview
                  program={program}
                  className="w-full max-w-none !max-h-[10.5rem] shadow-[0_16px_36px_rgba(0,0,0,0.4)]"
                />
              </div>
            );
          })}
        </div>
        <div className="flex h-10 w-full max-w-[13.5rem] shrink-0 flex-row items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate text-left text-[11px] leading-none text-zinc-500">
            Buscar por nombre…
          </span>
        </div>
      </div>
    </Stage>
  );
}
