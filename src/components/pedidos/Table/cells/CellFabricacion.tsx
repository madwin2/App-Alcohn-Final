import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, FabricationState } from '@/lib/types/index';
import { getFabricationStateColor, getFabricationChipVisual, getFabricationLabel, calculateOrderFabricationState } from '@/lib/utils/format';

interface CellFabricacionProps {
  order: Order;
  onFabricacionChange?: (orderId: string, newState: FabricationState, itemId?: string) => void;
}

const fabricationLabels: Record<FabricationState, string> = {
  'SIN_HACER': 'Sin Hacer',
  'HACIENDO': 'Haciendo',
  'VERIFICAR': 'Verificar',
  'HECHO': 'Hecho',
  'REHACER': 'Rehacer',
  'RETOCAR': 'Retocar',
  'PROGRAMADO': 'Programado'
};

export function CellFabricacion({ order, onFabricacionChange }: CellFabricacionProps) {
  if (order.items.length === 0) return null;

  // Si solo hay un item, estamos en una fila expandida (sello individual)
  // Si hay múltiples items, estamos en la fila resumen del pedido
  const isSingleItem = order.items.length === 1;
  const singleItemId = isSingleItem ? order.items[0].id : undefined;

  // Calcular el estado basado en todos los sellos del pedido
  // Si es un solo item, mostrar su estado directamente
  const fabricationState = isSingleItem 
    ? order.items[0].fabricationState 
    : calculateOrderFabricationState(order.items);
  
  // Verificar si hay prioridad en algún item
  const hasPriority = order.items.some(item => item.isPriority);
  
  // Si el estado es Programado y tiene un valor en programa, mostrar el nombre del programa
  // Si no tiene valor en programa, mostrar "Programado"
  const displayLabel = (() => {
    if (fabricationState === 'PROGRAMADO') {
      const item = isSingleItem ? order.items[0] : order.items.find(i => i.fabricationState === 'PROGRAMADO') || order.items[0];
      const programName = item?.program || '';
      return programName ? programName : 'Programado';
    }
    return getFabricationLabel(fabricationState, hasPriority);
  })();
  
  const handleValueChange = (value: string) => {
    // Si es un solo item (fila expandida), pasar el itemId para actualizar solo ese sello
    // Si son múltiples items (fila resumen), no pasar itemId para actualizar todos
    onFabricacionChange?.(order.id, value as FabricationState, singleItemId);
  };

  return (
    <Select value={fabricationState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-14 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getFabricationChipVisual(fabricationState, hasPriority);
            return (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {displayLabel}
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
