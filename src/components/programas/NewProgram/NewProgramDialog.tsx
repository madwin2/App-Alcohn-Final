import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewProgramForm } from './NewProgramForm';
import { Program } from '@/lib/types/index';

interface NewProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  createProgram: (program: Partial<Program>) => Promise<Program>;
}

export function NewProgramDialog({
  open,
  onOpenChange,
  onCreated,
  createProgram,
}: NewProgramDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Programa</DialogTitle>
        </DialogHeader>
        <NewProgramForm
          createProgram={createProgram}
          onSuccess={() => {
            onOpenChange(false);
            onCreated?.();
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
