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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">Filtros de Pedidos</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Selecciona los criterios para filtrar los pedidos
          </p>
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
