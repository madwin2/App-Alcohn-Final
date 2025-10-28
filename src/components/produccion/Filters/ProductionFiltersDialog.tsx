import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProductionFiltersForm } from './ProductionFiltersForm';
import { useProductionStore } from '@/lib/state/production.store';
import { ProductionFilters } from '@/lib/state/production.store';

interface ProductionFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductionFiltersDialog({ open, onOpenChange }: ProductionFiltersDialogProps) {
  const { filters, setFilters, clearFilters } = useProductionStore();

  const handleSubmit = (data: ProductionFilters) => {
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
          <DialogTitle>Filtros de producción</DialogTitle>
        </DialogHeader>
        <ProductionFiltersForm
          onSubmit={handleSubmit}
          onClear={handleClear}
          initialData={filters}
        />
      </DialogContent>
    </Dialog>
  );
}








