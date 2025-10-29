import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProgramsFiltersForm } from './ProgramsFiltersForm';

interface ProgramsFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Diálogo para filtrar programas por categoría, estado, etc.
export function ProgramsFiltersDialog({ open, onOpenChange }: ProgramsFiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Filtrar Programas</DialogTitle>
        </DialogHeader>
        <ProgramsFiltersForm onApply={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}




