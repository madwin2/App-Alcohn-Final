import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SortCriteria } from './SortCriteria';
import { FabricationOrderDnD } from './FabricationOrderDnD';
import { useOrdersStore } from '@/lib/state/orders.store';
import { SortCriteria as SortCriteriaType, FabricationState } from '@/lib/types/index';

interface SorterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SorterDialog({ open, onOpenChange }: SorterDialogProps) {
  const { sort, setFabricationPriority, addSortCriteria, removeSortCriteria, updateSortCriteria } = useOrdersStore();
  const [localFabricationPriority, setLocalFabricationPriority] = useState<FabricationState[]>(sort.fabricationPriority);
  const [localCriteria, setLocalCriteria] = useState<SortCriteriaType[]>(sort.criteria);

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
    setFabricationPriority(localFabricationPriority);
    
    // Aplicar criterios de ordenamiento
    localCriteria.forEach(criteria => {
      addSortCriteria(criteria);
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar ordenamiento</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Orden de prioridad de fabricación */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Prioridad de fabricación</h3>
            <FabricationOrderDnD
              fabricationPriority={localFabricationPriority}
              onOrderChange={handleFabricationOrderChange}
            />
          </div>

          {/* Criterios de ordenamiento */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Criterios de ordenamiento</h3>
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
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay criterios de ordenamiento configurados
                </p>
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
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button onClick={handleApply}>
            Aplicar ordenamiento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
