import { Check, ClipboardPaste, Crop, FileUp, Replace, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FakeLogo, StageShell, Thumb } from './tourPrimitives';

export function MockTabs() {
  const tabs = [
    { id: 'Pedidos', tip: 'Cola de sellos' },
    { id: 'Lote libre', tip: 'Archivos sueltos' },
    { id: 'Asignar SVG', tip: 'SVG ya hechos' },
    { id: 'Revisión', tip: 'Antes de guardar' },
  ];
  return (
    <StageShell>
      <div className="mx-auto w-full max-w-sm space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Cuatro pestañas
        </p>
        <div className="space-y-2">
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              className={cn(
                'flex items-center justify-between rounded-xl border px-3.5 py-2.5',
                i === 0
                  ? 'border-white/20 bg-white/10 text-white'
                  : 'border-white/5 bg-zinc-950/60 text-zinc-400',
              )}
            >
              <span className="text-sm font-medium">{tab.id}</span>
              <span className="text-[11px] text-zinc-500">{tab.tip}</span>
            </div>
          ))}
        </div>
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-emerald-300/90">
          Varios logos en una hoja = <span className="font-semibold text-emerald-200">1 crédito</span>
        </p>
      </div>
    </StageShell>
  );
}

export function MockSheet() {
  return (
    <StageShell className="gap-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-zinc-500">Hoja 1 de 1</p>
          <p className="text-xs font-medium text-zinc-200">2 diseños · 1 crédito</p>
        </div>
        <div className="w-28">
          <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
            <span>Carga</span>
            <span className="text-emerald-400">91%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-[91%] rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_4.5rem] gap-2.5">
        <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-white p-4 shadow-inner">
          <div className="absolute left-[12%] top-[18%] h-[58%] w-[42%] rounded-md ring-1 ring-sky-400/70">
            <FakeLogo variant="bird" />
          </div>
          <div className="absolute right-[14%] top-[28%] h-[38%] w-[28%] rounded-md ring-1 ring-sky-400/70">
            <FakeLogo variant="mono" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 overflow-hidden">
          <Thumb variant="bird" selected label="Ñandú" />
          <Thumb variant="mono" selected />
          <Thumb variant="seal" />
        </div>
      </div>
    </StageShell>
  );
}

export function MockMenu() {
  return (
    <StageShell>
      <div className="relative mx-auto w-full max-w-[15rem]">
        <div className="grid grid-cols-2 gap-2 opacity-50">
          <Thumb variant="seal" />
          <Thumb variant="crown" />
          <Thumb variant="mono" />
          <Thumb variant="bird" />
        </div>
        <div className="absolute left-1/2 top-1/2 z-10 w-[11.5rem] -translate-x-[40%] -translate-y-[55%] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 shadow-2xl backdrop-blur">
          <div className="border-b border-white/5 px-1 py-1">
            {['Abrir imagen…', 'Copiar imagen', 'Guardar imagen'].map((label) => (
              <div key={label} className="rounded-md px-2.5 py-1.5 text-[11px] text-zinc-400">
                {label}
              </div>
            ))}
          </div>
          <div className="px-1 py-1">
            <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-200">
              <Crop className="size-3.5 text-zinc-400" />
              Recortar…
            </div>
            <div className="flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white">
              <ClipboardPaste className="size-3.5 text-zinc-300" />
              Reemplazar por Portapapeles
            </div>
          </div>
        </div>
      </div>
    </StageShell>
  );
}

export function MockRun() {
  return (
    <StageShell className="items-center">
      <div className="w-full max-w-xs space-y-4">
        <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
          <div className="mb-2 flex justify-between text-[11px] text-zinc-500">
            <span>2 sellos · 1 hoja</span>
            <span>1 crédito</span>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-emerald-400/30 bg-white/[0.04] px-4 py-2.5 text-center text-sm font-medium text-white">
            <div className="absolute inset-y-0 left-0 w-[62%] bg-gradient-to-r from-emerald-700/90 via-emerald-500/80 to-emerald-400/50" />
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 animate-pulse text-emerald-100" />
              Vectorizando… 62%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <div className="h-px flex-1 bg-zinc-800" />
          al terminar → Revisión
          <div className="h-px flex-1 bg-zinc-800" />
        </div>
        <div className="rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-3 py-2.5 text-center text-[11px] text-zinc-400">
          Todavía <span className="text-zinc-200">no</span> se guarda en el pedido
        </div>
      </div>
    </StageShell>
  );
}

export function MockRevision() {
  return (
    <StageShell>
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <div className="relative aspect-square bg-white p-3">
            <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white">
              Antes
            </span>
            <FakeLogo variant="bird" />
          </div>
          <div className="relative aspect-square bg-white p-3">
            <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white">
              SVG
            </span>
            <FakeLogo variant="bird" />
          </div>
        </div>
        <div className="space-y-2.5 p-3">
          <div>
            <p className="text-sm font-medium text-white">Ñandú — Cliente Demo</p>
            <p className="text-[11px] text-zinc-500">4.0 × 4.0 cm</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-950">
              <Check className="size-3" />
              Confirmar
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300">
              <X className="size-3" />
              Rechazar
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300">
              <Replace className="size-3" />
              Cambiar
            </span>
          </div>
        </div>
      </div>
    </StageShell>
  );
}

export function MockAsignar() {
  return (
    <StageShell className="gap-3">
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-zinc-950/50 px-4 py-5 text-center">
        <FileUp className="mb-2 size-5 text-zinc-400" />
        <p className="text-sm font-medium text-zinc-200">Arrastrá SVG ya hechos</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">Se asignan por nombre al sello</p>
      </div>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-950/70 p-2.5">
        <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-white p-1">
          <FakeLogo variant="crown" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">Coronita.svg</p>
          <p className="truncate text-[10px] text-zinc-500">Coronita — Serguey Alvarez</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          100%
        </span>
      </div>
    </StageShell>
  );
}
