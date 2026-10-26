import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FabricationState, ProgramStamp } from '@/lib/types/index';
import { StampThumb } from '../StampThumb';
import { cn } from '@/lib/utils';

/** HACIENDO: sigue en la máquina (falta el repaso). Solo si se pide `allowPending`. */
export type StampDoneAction = 'HECHO' | 'REHACER' | 'RETOCAR' | 'HACIENDO';

interface DoneReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stamps: ProgramStamp[];
  programName: string;
  onConfirm: (assignments: { stampId: string; state: FabricationState }[]) => void;
  /** Ofrece «Falta repaso»: el sello queda en Haciendo, en la máquina. */
  allowPending?: boolean;
  /** Agrupa por planchuela, con botones para marcarla entera. */
  sections?: { label: string; stampIds: string[] }[];
  /** Estado con que arranca cada sello (por defecto Hecho). */
  initial?: Record<string, StampDoneAction>;
  title?: string;
  description?: string;
}

const ACTIONS: { value: StampDoneAction; label: string }[] = [
  { value: 'HECHO', label: 'Hecho' },
  { value: 'HACIENDO', label: 'Falta repaso' },
  { value: 'RETOCAR', label: 'Retocar' },
  { value: 'REHACER', label: 'Rehacer' },
];

const TONE: Record<StampDoneAction, string> = {
  HECHO: 'bg-green-600 text-white border-green-600',
  HACIENDO: 'bg-sky-600 text-white border-sky-600',
  RETOCAR: 'bg-amber-500 text-white border-amber-500',
  REHACER: 'bg-destructive text-destructive-foreground border-destructive',
};

export function DoneReviewDialog({
  open,
  onOpenChange,
  stamps,
  programName,
  onConfirm,
  allowPending = false,
  sections,
  initial,
  title = 'Sellos a retocar o rehacer',
  description,
}: DoneReviewDialogProps) {
  const options = ACTIONS.filter((a) => allowPending || a.value !== 'HACIENDO');
  const [actions, setActions] = useState<Record<string, StampDoneAction>>({});

  useEffect(() => {
    if (!open) return;
    const start: Record<string, StampDoneAction> = {};
    for (const s of stamps) start[s.id] = initial?.[s.id] ?? 'HECHO';
    setActions(start);
    // Solo al abrir: la lista llega armada en cada render y no debe pisar lo elegido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setAction = (stampId: string, value: StampDoneAction) => {
    setActions((prev) => ({ ...prev, [stampId]: value }));
  };

  const setMany = (ids: string[], value: StampDoneAction) => {
    setActions((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, value])) }));
  };

  const handleConfirm = () => {
    onConfirm(
      stamps.map((s) => ({
        stampId: s.id,
        state: (actions[s.id] || 'HECHO') as FabricationState,
      })),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? `Marcá en «${programName}» qué sellos salieron mal. El resto queda en Hecho.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {(sections ?? [{ label: '', stampIds: stamps.map((s) => s.id) }]).map((section) => {
            const list = section.stampIds.flatMap((id) => stamps.filter((s) => s.id === id));
            if (!list.length) return null;
            const all = list.every((s) => actions[s.id] === actions[list[0].id]) ? actions[list[0].id] : null;
            return (
              <section key={section.label || 'todos'} className="space-y-2">
                {section.label ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <h4 className="text-sm font-medium">{section.label} <span className="font-normal text-muted-foreground">· {list.length} {list.length === 1 ? 'sello' : 'sellos'}</span></h4>
                    <div className="flex flex-wrap gap-1" role="group" aria-label={`Marcar toda la ${section.label}`}>
                      {options.map((opt) => (
                        <button key={opt.value} type="button" onClick={() => setMany(list.map((s) => s.id), opt.value)}
                          className={cn('px-2 py-0.5 rounded text-[11px] border transition-colors',
                            all === opt.value ? TONE[opt.value] : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted')}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {list.map((stamp) => (
                  <StampRow key={stamp.id} stamp={stamp} current={actions[stamp.id] || 'HECHO'} options={options} onSet={(v) => setAction(stamp.id, v)} />
                ))}
              </section>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StampRow({ stamp, current, options, onSet }: {
  stamp: ProgramStamp;
  current: StampDoneAction;
  options: { value: StampDoneAction; label: string }[];
  onSet: (value: StampDoneAction) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-2">
      <StampThumb stamp={stamp} className="w-14 h-14" />
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <div className="text-sm font-medium truncate">{stamp.designName}</div>
          {stamp.notes?.trim() ? (
            <p className="text-xs text-blue-400 whitespace-pre-wrap break-words">
              {stamp.notes.trim()}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSet(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded text-xs border transition-colors',
                current === opt.value ? TONE[opt.value] : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
