import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, ArrowUpDown, X } from 'lucide-react';
import { SortCriteria } from './SortCriteria';
import { FabricationOrderDnD } from './FabricationOrderDnD';
import { useOrdersStore } from '@/lib/state/orders.store';
import { SortCriteria as SortCriteriaType, FabricationState } from '@/lib/types/index';

interface SorterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SorterDialog({ open, onOpenChange }: SorterDialogProps) {
  const { sort, setSort } = useOrdersStore();
  const [localFabricationPriority, setLocalFabricationPriority] = useState<FabricationState[]>(sort.fabricationPriority);
  const [localCriteria, setLocalCriteria] = useState<SortCriteriaType[]>(sort.criteria);

  // Sincronizar estado local cuando se abre el modal o cambia el sort
  useEffect(() => {
    if (open) {
      setLocalFabricationPriority(sort.fabricationPriority);
      setLocalCriteria(sort.criteria);
    }
  }, [open, sort]);

  const handleAddCriteria = () => {
    const newCriteria: SortCriteriaType = {
      field: 'fecha',
      dir: 'desc'
    };
    setLocalCriteria([...localCriteria, newCriteria]);
  };

  const handleUpdateCriteria = (index: number, criteria: SortCriteriaType) => {
    const updated = [...localCriteria];
    updated[index] = criteria;
    setLocalCriteria(updated);
  };

  const handleRemoveCriteria = (index: number) => {
    setLocalCriteria(localCriteria.filter((_, i) => i !== index));
  };

  const handleFabricationOrderChange = (newOrder: FabricationState[]) => {
    setLocalFabricationPriority(newOrder);
  };

  const handleApply = () => {
    // Actualizar el sort completo de una vez
    setSort({
      fabricationPriority: localFabricationPriority,
      criteria: localCriteria
    });
    
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalFabricationPriority(sort.fabricationPriority);
    setLocalCriteria(sort.criteria);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">Configurar Ordenamiento</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Define la prioridad de fabricación y los criterios de ordenamiento
          </p>
        </DialogHeader>
        
        <div className="space-y-6 py-2">
          {/* Orden de prioridad de fabricación */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              Prioridad de fabricación
            </h3>
            <FabricationOrderDnD
              fabricationPriority={localFabricationPriority}
              onOrderChange={handleFabricationOrderChange}
            />
          </div>

          <div className="border-t"></div>

          {/* Criterios de ordenamiento */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                Criterios de ordenamiento
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCriteria}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Agregar criterio
              </Button>
            </div>
            
            <div className="space-y-2">
              {localCriteria.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                  No hay criterios configurados. Agrega uno para comenzar.
                </div>
              ) : (
                localCriteria.map((criteria, index) => (
                  <SortCriteria
                    key={index}
                    criteria={criteria}
                    index={index}
                    onUpdate={handleUpdateCriteria}
                    onRemove={handleRemoveCriteria}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel} className="gap-2">
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button onClick={handleApply} className="gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Aplicar ordenamiento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
