import { useEffect, useState, type ReactNode } from 'react';
import { CheckCheck, ChevronUp, Download, Loader2, Play, RotateCw, Save } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CheckGroup, MesaProgress } from '@/lib/programas/mesa';
import { cn } from '@/lib/utils/cn';
import { Dot, FOCUS, Kbd, PILL_GHOST, PILL_PRIMARY } from './mesaUi';
import { checkSummary, MesaChecklist, MesaSteps } from './MesaChecklist';

export interface FabricationRecord {
  at: string;
  /** Sellos marcados para retocar o rehacer (el resto quedó Hecho). */
  retocar: number;
  rehacer: number;
}

/** El programa está en la máquina: algún sello en Haciendo. */
export interface FabricatingRecord {
  /** Hora en que se tocó «Empezar a fabricar» (null si no quedó registrada). */
  since: string | null;
}

function elapsed(since: number, now: number) {
  const s = Math.max(0, Math.round((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Barra fija al pie de la mesa: en qué etapa está el programa, qué falta y la
 * única acción principal. Siempre visible, aunque el detalle del sello scrollee.
 */
export function MesaActionBar({
  progress, groups, checking, dirty, savedRevision, hasStamps, readOnly, locked, legacyAspire, waitingSince, fabricated, fabricating, starting,
  onSave, onAspire, onStart, onFabricated, onPick, onSetup,
}: {
  progress: MesaProgress;
  groups: CheckGroup[];
  checking: boolean;
  dirty: boolean;
  savedRevision: number | null;
  hasStamps: boolean;
  readOnly: boolean;
  locked: boolean;
  legacyAspire: boolean;
  /** Desde cuándo se espera el resultado del gadget (ms). */
  waitingSince: number | null;
  fabricated: FabricationRecord | null;
  fabricating: FabricatingRecord | null;
  /** Se está pasando el programa a Haciendo. */
  starting: boolean;
  onSave: () => void;
  onAspire: () => void;
  /** Todos los sellos a Haciendo: la máquina quedó corriendo. */
  onStart: () => void;
  onFabricated: () => void;
  onPick: (instanceId: string) => void;
  onSetup: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (waitingSince === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [waitingSince]);
  const [open, setOpen] = useState(false);
  const summary = checkSummary(groups, checking);

  const mustSave = !fabricating && (dirty || progress.step === 'armado' || progress.step === 'revisar');
  let status: ReactNode = progress.blocking;
  let action: ReactNode = null;
  if (fabricated) {
    const bad = [fabricated.retocar && `${fabricated.retocar} para retocar`, fabricated.rehacer && `${fabricated.rehacer} para rehacer`].filter(Boolean).join(' · ');
    status = <>Fabricado el {fabricated.at}{bad ? <span className="text-amber-200/90"> · {bad}</span> : ' · todo salió bien'}</>;
  } else if (fabricating) {
    status = (
      <span className="flex items-center gap-2">
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300/60 motion-reduce:animate-none" /><span className="relative inline-flex size-2 rounded-full bg-emerald-300" /></span>
        En la máquina{fabricating.since ? <> desde las {fabricating.since}</> : null} · cuando termine y lo pruebes en cuero, marcalo fabricado.
      </span>
    );
    action = <button type="button" className={cn(PILL_PRIMARY, 'min-w-[13rem] py-2.5')} onClick={onFabricated}><CheckCheck className="size-4" />Marcar fabricado</button>;
  } else if (locked) {
    status = 'Programa bloqueado: solo lectura.';
  } else if (mustSave) {
    status = dirty && savedRevision !== null ? <><Dot tone="warning" className="mr-2 align-middle" />Cambios sin guardar · la revisión {savedRevision} quedó atrás</> : progress.blocking;
    action = (
      <button type="button" className={cn(PILL_PRIMARY, 'min-w-[13rem] py-2.5')} disabled={checking || readOnly || !hasStamps} onClick={onSave}
        title="Guardar y chequear (Ctrl+S)">
        {checking ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {checking ? 'Chequeando la fresa…' : legacyAspire ? 'Chequear la fresa' : 'Guardar y chequear'}
      </button>
    );
  } else if (progress.step === 'aspire') {
    if (waitingSince !== null) {
      status = (
        <span className="flex items-center gap-2" role="status">
          <Loader2 className="size-3.5 animate-spin text-zinc-300" />
          {legacyAspire ? 'Abrí el ZIP con el gadget de la máquina' : 'Esperando a Aspire: corré el gadget 3.2'}
          <span className="tabular-nums text-zinc-400">· {elapsed(waitingSince, now)}</span>
        </span>
      );
      action = <button type="button" className={PILL_GHOST} onClick={onAspire}><RotateCw className="size-4" />{legacyAspire ? 'Bajar de nuevo' : 'Mandar de nuevo'}</button>;
    } else {
      status = legacyAspire ? 'Va con el gadget anterior: bajá el ZIP y abrilo en Aspire.' : progress.blocking;
      action = (
        <button type="button" className={cn(PILL_PRIMARY, 'min-w-[13rem] py-2.5')} onClick={onAspire}>
          <Download className="size-4" />{legacyAspire ? 'Bajar ZIP para Aspire' : 'Llevar a Aspire'}
        </button>
      );
    }
  } else if (progress.done.fabricar) {
    status = 'Listo para la máquina. Pasá las trayectorias a la CNC y, cuando la dejes corriendo, tocá «Empezar a fabricar».';
    action = (
      <button type="button" className={cn(PILL_PRIMARY, 'min-w-[13rem] py-2.5')} disabled={starting} onClick={onStart}>
        {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Empezar a fabricar
      </button>
    );
  }

  return (
    <footer className="flex min-h-[64px] flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white/[0.035] px-5 py-3" aria-label="Estado del programa">
      <MesaSteps progress={progress} fabricating={!!fabricating} fabricated={!!fabricated} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(FOCUS, 'flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] hover:bg-white/[0.06]',
            summary.tone === 'error' ? 'text-red-300' : summary.tone === 'warning' ? 'text-amber-200' : 'text-zinc-300')}
            aria-label="Ver controles antes de Aspire">
            {checking ? <Loader2 className="size-3.5 animate-spin" /> : <Dot tone={summary.tone} />}
            {summary.text}
            <ChevronUp className={cn('size-3.5 text-zinc-400 transition-transform', !open && 'rotate-180')} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[380px] rounded-2xl border-white/10 bg-zinc-950 p-4">
          <h3 className="mb-3 text-[14px] font-medium">Antes de Aspire</h3>
          <MesaChecklist groups={groups} checking={checking} onPick={(id) => { setOpen(false); onPick(id); }} onSetup={() => { setOpen(false); onSetup(); }} />
        </PopoverContent>
      </Popover>
      <p className="min-w-[14rem] flex-1 text-[13px] text-zinc-300" aria-live="polite">{status}</p>
      {mustSave && !fabricated && !locked ? <span className="hidden items-center gap-1 text-[12px] text-zinc-400 xl:flex"><Kbd>Ctrl</Kbd><Kbd>S</Kbd></span> : null}
      {action}
    </footer>
  );
}
