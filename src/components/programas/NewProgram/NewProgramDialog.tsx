import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewProgramForm } from './NewProgramForm';

interface NewProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function NewProgramDialog({ open, onOpenChange, onCreated }: NewProgramDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Programa</DialogTitle>
        </DialogHeader>
        <NewProgramForm
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
