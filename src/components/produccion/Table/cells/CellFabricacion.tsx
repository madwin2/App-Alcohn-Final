import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionItem, ProductionState } from '@/lib/types/index';
import { getFabricationStateColor, getFabricationChipVisual, getFabricationLabel } from '@/lib/utils/format';

interface CellFabricacionProps {
  item: ProductionItem;
  onFabricacionChange?: (itemId: string, newState: ProductionState) => void;
}

// Mapeo de estados de producción a estados de fabricación de pedidos
const productionToFabricationMap: Record<ProductionState, string> = {
  'PENDIENTE': 'SIN_HACER',
  'EN_PROGRESO': 'HACIENDO',
  'COMPLETADO': 'HECHO',
  'REVISAR': 'VERIFICAR',
  'REHACER': 'REHACER'
};

const fabricationToProductionMap: Record<string, ProductionState> = {
  'SIN_HACER': 'PENDIENTE',
  'HACIENDO': 'EN_PROGRESO',
  'HECHO': 'COMPLETADO',
  'VERIFICAR': 'REVISAR',
  'REHACER': 'REHACER',
  'RETOCAR': 'REVISAR' // Mapear a revisar
};

export function CellFabricacion({ item, onFabricacionChange }: CellFabricacionProps) {
  const fabricationState = productionToFabricationMap[item.productionState];
  
  const handleValueChange = (value: string) => {
    const productionState = fabricationToProductionMap[value] || 'PENDIENTE';
    onFabricacionChange?.(item.id, productionState);
  };

  return (
    <Select value={fabricationState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getFabricationChipVisual(fabricationState, item.isPriority);
            return (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {getFabricationLabel(fabricationState, item.isPriority)}
              </span>
            );
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(productionToFabricationMap).map(([productionState, fabricationState]) => (
          <SelectItem 
            key={fabricationState} 
            value={fabricationState} 
            className={`text-xs`}
          >
            {(() => {
              const visual = getFabricationChipVisual(fabricationState);
              return (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {getFabricationLabel(fabricationState)}
                </span>
              );
            })()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
