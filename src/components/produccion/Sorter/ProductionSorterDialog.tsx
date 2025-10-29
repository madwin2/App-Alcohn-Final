import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProductionSortForm } from './ProductionSortForm';
import { useProductionStore } from '@/lib/state/production.store';

interface ProductionSorterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductionSorterDialog({ open, onOpenChange }: ProductionSorterDialogProps) {
  const { sort, setSort } = useProductionStore();

  const handleSubmit = (data: any) => {
    setSort(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ordenar producción</DialogTitle>
        </DialogHeader>
        <ProductionSortForm
          onSubmit={handleSubmit}
          initialData={sort}
        />
      </DialogContent>
    </Dialog>
  );
}











