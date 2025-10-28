import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProgramsSortForm } from './ProgramsSortForm';

interface ProgramsSorterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Diálogo para ordenar programas
export function ProgramsSorterDialog({ open, onOpenChange }: ProgramsSorterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Ordenar Programas</DialogTitle>
        </DialogHeader>
        <ProgramsSortForm onApply={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

