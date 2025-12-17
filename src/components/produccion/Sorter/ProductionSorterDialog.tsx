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
    // Asegurar que se pasen productionPriority y criteria
    setSort({
      productionPriority: data.productionPriority || sort.productionPriority,
      criteria: data.criteria || sort.criteria,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">Ordenar Producción</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Configura el orden de prioridad y los criterios de ordenamiento
          </p>
        </DialogHeader>
        <ProductionSortForm
          onSubmit={handleSubmit}
          initialData={sort}
        />
      </DialogContent>
    </Dialog>
  );
}














