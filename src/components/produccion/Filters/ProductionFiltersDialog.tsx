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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">Filtros de Producción</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Selecciona los criterios para filtrar los items de producción
          </p>
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














