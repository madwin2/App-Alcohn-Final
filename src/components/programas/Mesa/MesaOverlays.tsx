import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, Crosshair, PencilRuler, ScanSearch, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Recipe } from '@/lib/programas/preparation';
import { cn } from '@/lib/utils/cn';
import { FOCUS, Kbd } from './mesaUi';

export interface StampMenuActions {
  recipe: Recipe;
  canUp: boolean; canDown: boolean; canLeft: boolean; canRight: boolean; readOnly: boolean;
  onFocus: () => void; onFresa: () => void; onEditVector: () => void; onShift: (d: -1 | 1) => void; onEnd: () => void;
  onNeighbor: (d: -1 | 1) => void; onRecipe: (r: Recipe) => void; onRemove: () => void;
}

function Item({ icon, label, kbd, disabled, danger, onClick }: { icon: ReactNode; label: string; kbd?: string; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick}
      className={cn(FOCUS, 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/[0.08] focus-visible:bg-white/[0.08] disabled:opacity-30',
        danger ? 'text-red-300' : 'text-foreground/90')}>
      <span className="text-zinc-400">{icon}</span><span className="flex-1">{label}</span>{kbd ? <span className="text-[12px] text-zinc-500">{kbd}</span> : null}
    </button>
  );
}

/** Menú del clic derecho sobre un sello de la mesa. */
export function StampContextMenu({ at, actions, onClose }: { at: { x: number; y: number } | null; actions: StampMenuActions | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!at || !ref.current) { setPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(at.x, window.innerWidth - r.width - 8), y: Math.min(at.y, window.innerHeight - r.height - 8) });
    ref.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [at]);
  useEffect(() => {
    if (!at) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key, true); window.removeEventListener('wheel', onClose); };
  }, [at, onClose]);
  if (!at || !actions) return null;
  const a = actions, run = (f: () => void) => () => { f(); onClose(); };
  return (
    <div ref={ref} role="menu" className="fixed z-50 w-[230px] rounded-xl bg-zinc-950/95 p-1 shadow-2xl ring-1 ring-white/10 backdrop-blur"
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y, visibility: pos ? 'visible' : 'hidden' }}>
      <Item icon={<Crosshair className="size-4" />} label="Ir al sello" kbd="F" onClick={run(a.onFocus)} />
      <Item icon={<ScanSearch className="size-4" />} label="Ver fresa" onClick={run(a.onFresa)} />
      <Item icon={<PencilRuler className="size-4" />} label="Editar vector" disabled={a.readOnly} onClick={run(a.onEditVector)} />
      <div className="my-1 h-px bg-white/10" />
      <Item icon={<ArrowUp className="size-4" />} label="Subir" kbd="↑" disabled={a.readOnly || !a.canUp} onClick={run(() => a.onShift(-1))} />
      <Item icon={<ArrowDown className="size-4" />} label="Bajar" kbd="↓" disabled={a.readOnly || !a.canDown} onClick={run(() => a.onShift(1))} />
      <Item icon={<ArrowDownToLine className="size-4" />} label="Al final" disabled={a.readOnly || !a.canDown} onClick={run(a.onEnd)} />
      <Item icon={<ArrowLeft className="size-4" />} label="Planchuela de la izquierda" kbd="←" disabled={a.readOnly || !a.canLeft} onClick={run(() => a.onNeighbor(-1))} />
      <Item icon={<ArrowRight className="size-4" />} label="Planchuela de la derecha" kbd="→" disabled={a.readOnly || !a.canRight} onClick={run(() => a.onNeighbor(1))} />
      <div className="my-1 h-px bg-white/10" />
      <div className="flex gap-1 px-1 py-1" role="group" aria-label="Mecanizado">
        {([['CLASICO', 'Clásico'], ['3MM', '3 mm'], ['ALIMENTO', 'Alimento']] as [Recipe, string][]).map(([id, label]) => (
          <button key={id} type="button" disabled={a.readOnly} onClick={run(() => a.onRecipe(id))} aria-pressed={a.recipe === id}
            className={cn(FOCUS, 'flex-1 rounded-full py-1 text-[12px] disabled:opacity-30', a.recipe === id ? 'bg-white/[0.14] text-foreground' : 'text-zinc-400 hover:bg-white/[0.06]')}>{label}</button>
        ))}
      </div>
      <div className="my-1 h-px bg-white/10" />
      <Item icon={<Trash2 className="size-4" />} label="Quitar del programa" kbd="Supr" danger disabled={a.readOnly} onClick={run(a.onRemove)} />
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['1'], 'Vista 2D'], [['2'], 'Vista 3D'], [['3'], 'Mecanizado'],
  [['0'], 'Encuadrar los sellos'], [['Z'], 'Mostrar u ocultar las zonas de fresa'], [['F'], 'Ir al sello elegido'], [['+', '−'], 'Acercar / alejar (también la rueda)'],
  [['↑', '↓'], 'Subir / bajar el sello en su planchuela'], [['←', '→'], 'Pasarlo a la planchuela vecina'],
  [['Tab'], 'Elegir el sello siguiente'], [['Supr'], 'Quitar el sello'], [['Esc'], 'Soltar la selección o cancelar un arrastre'],
  [['Ctrl', 'Z'], 'Deshacer'], [['Ctrl', 'Mayús', 'Z'], 'Rehacer'], [['Ctrl', 'S'], 'Guardar y chequear'],
  [['Ctrl', 'clic'], 'Elegir varios en la cola'], [['Doble clic'], 'Sumar desde la cola / acercar en la mesa'],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Atajos de la mesa</DialogTitle>
          <DialogDescription>Funcionan con el foco en la mesa (fuera de los campos de texto).</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {SHORTCUTS.map(([keys, text]) => (
            <li key={text} className="flex items-center gap-3 text-[13px]">
              <span className="flex w-[7.5rem] shrink-0 flex-wrap gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
              <span className="text-zinc-300">{text}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
