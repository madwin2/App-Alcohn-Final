import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, FabricationState } from '@/lib/types/index';
import { getFabricationStateColor, getFabricationChipVisual, getFabricationLabel } from '@/lib/utils/format';

interface CellFabricacionProps {
  order: Order;
  onFabricacionChange?: (orderId: string, newState: FabricationState) => void;
}

const fabricationLabels: Record<FabricationState, string> = {
  'SIN_HACER': 'Sin Hacer',
  'HACIENDO': 'Haciendo',
  'VERIFICAR': 'Verificar',
  'HECHO': 'Hecho',
  'REHACER': 'Rehacer',
  'RETOCAR': 'Retocar'
};

export function CellFabricacion({ order, onFabricacionChange }: CellFabricacionProps) {
  const item = order.items[0];
  
  if (!item) return null;

  const fabricationState = item.fabricationState as FabricationState;
  
  const handleValueChange = (value: string) => {
    onFabricacionChange?.(order.id, value as FabricationState);
  };

  return (
    <Select value={item.fabricationState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-14 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getFabricationChipVisual(item.fabricationState, item.isPriority);
            return (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {getFabricationLabel(item.fabricationState, item.isPriority)}
              </span>
            );
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(fabricationLabels).map(([value, label]) => (
          <SelectItem 
            key={value} 
            value={value} 
            className={`text-xs`}
          >
            {(() => {
              const visual = getFabricationChipVisual(value);
              return (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {getFabricationLabel(value)}
                </span>
              );
            })()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
