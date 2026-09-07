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

export type StampDoneAction = 'HECHO' | 'REHACER' | 'RETOCAR';

interface DoneReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stamps: ProgramStamp[];
  programName: string;
  onConfirm: (assignments: { stampId: string; state: FabricationState }[]) => void;
}

const ACTIONS: { value: StampDoneAction; label: string }[] = [
  { value: 'HECHO', label: 'Hecho' },
  { value: 'RETOCAR', label: 'Retocar' },
  { value: 'REHACER', label: 'Rehacer' },
];

export function DoneReviewDialog({
  open,
  onOpenChange,
  stamps,
  programName,
  onConfirm,
}: DoneReviewDialogProps) {
  const [actions, setActions] = useState<Record<string, StampDoneAction>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, StampDoneAction> = {};
    for (const s of stamps) initial[s.id] = 'HECHO';
    setActions(initial);
  }, [open, stamps]);

  const setAction = (stampId: string, value: StampDoneAction) => {
    setActions((prev) => ({ ...prev, [stampId]: value }));
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
          <DialogTitle>Sellos a retocar o rehacer</DialogTitle>
          <DialogDescription>
            Marcá en «{programName}» qué sellos salieron mal. El resto queda en Hecho.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {stamps.map((stamp) => {
            const current = actions[stamp.id] || 'HECHO';
            return (
              <div
                key={stamp.id}
                className="flex items-start gap-3 rounded-md border border-border p-2"
              >
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
                    {ACTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAction(stamp.id, opt.value)}
                        className={cn(
                          'px-2.5 py-1 rounded text-xs border transition-colors',
                          current === opt.value
                            ? opt.value === 'HECHO'
                              ? 'bg-green-600 text-white border-green-600'
                              : opt.value === 'RETOCAR'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-destructive text-destructive-foreground border-destructive'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
