import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FiltersForm } from './FiltersForm';
import { useOrdersStore } from '@/lib/state/orders.store';
import { Filters } from '@/lib/types/index';

interface FiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FiltersDialog({ open, onOpenChange }: FiltersDialogProps) {
  const { filters, setFilters, clearFilters } = useOrdersStore();

  const handleSubmit = (data: Filters) => {
    setFilters(data);
    onOpenChange(false);
  };

  const handleClear = () => {
    clearFilters();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Filtros de pedidos</DialogTitle>
        </DialogHeader>
        <FiltersForm
          onSubmit={handleSubmit}
          onClear={handleClear}
          initialData={filters}
        />
      </DialogContent>
    </Dialog>
  );
}
