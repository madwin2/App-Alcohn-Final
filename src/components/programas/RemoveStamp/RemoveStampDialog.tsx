import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FabricationState, ProgramStamp } from '@/lib/types/index';
import { getFabricationLabel } from '@/lib/utils/format';

const FAB_OPTIONS: FabricationState[] = [
  'SIN_HACER',
  'HACIENDO',
  'REHACER',
  'RETOCAR',
  'VERIFICAR',
  'HECHO',
  'PROGRAMADO',
];

export type RemoveStampChoice =
  | { mode: 'PREVIOUS' }
  | { mode: 'NEW'; state: FabricationState };

interface RemoveStampDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stamp?: ProgramStamp | null;
  /** Si se borran varios (p.ej. borrar programa), mensaje genérico. */
  bulkCount?: number;
  onConfirm: (choice: RemoveStampChoice) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: 'default' | 'destructive';
}

export function RemoveStampDialog({
  open,
  onOpenChange,
  stamp,
  bulkCount,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  confirmVariant = 'default',
}: RemoveStampDialogProps) {
  const [mode, setMode] = useState<'PREVIOUS' | 'NEW'>('PREVIOUS');
  const [newState, setNewState] = useState<FabricationState>('SIN_HACER');

  const prevLabel = stamp?.previousFabricationState
    ? getFabricationLabel(stamp.previousFabricationState)
    : 'Sin Hacer';

  const handleConfirm = () => {
    if (mode === 'PREVIOUS') onConfirm({ mode: 'PREVIOUS' });
    else onConfirm({ mode: 'NEW', state: newState });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>
            {title
              || (bulkCount && bulkCount > 1
                ? `Liberar ${bulkCount} sellos del programa`
                : `Quitar sello${stamp ? `: ${stamp.designName}` : ''}`)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {description
              || 'Elegí qué estado de fabricación dejar en el sello al sacarlo del programa.'}
          </p>

          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="restore-mode"
                checked={mode === 'PREVIOUS'}
                onChange={() => setMode('PREVIOUS')}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium">Mantener el estado anterior</span>
                {!bulkCount || bulkCount === 1 ? (
                  <span className="block text-muted-foreground">Antes de programarlo: {prevLabel}</span>
                ) : (
                  <span className="block text-muted-foreground">
                    Restaura el estado previo de cada sello
                  </span>
                )}
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="restore-mode"
                checked={mode === 'NEW'}
                onChange={() => setMode('NEW')}
                className="mt-1"
              />
              <span className="text-sm font-medium">Elegir un estado nuevo</span>
            </label>
          </div>

          {mode === 'NEW' && (
            <div className="space-y-2 pl-6">
              <Label>Estado de fabricación</Label>
              <Select value={newState} onValueChange={(v) => setNewState(v as FabricationState)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAB_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getFabricationLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant={confirmVariant} onClick={handleConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
