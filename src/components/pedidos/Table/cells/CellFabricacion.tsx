import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Orden } from '@/lib/supabase/types';
import { getFabricationStateColor, getFabricationChipVisual, getFabricationLabel } from '@/lib/utils/format';

interface CellFabricacionProps {
  order: Orden;
  onFabricacionChange?: (orderId: string, newState: string) => void;
}

const fabricationLabels: Record<string, string> = {
  'Sin Hacer': 'Sin Hacer',
  'Haciendo': 'Haciendo',
  'Verificar': 'Verificar',
  'Hecho': 'Hecho',
  'Rehacer': 'Rehacer',
  'Prioridad': 'Prioridad',
  'Retocar': 'Retocar'
};

export function CellFabricacion({ order, onFabricacionChange }: CellFabricacionProps) {
  // Obtener el primer sello de la orden
  const sellos = (order as any).sellos;
  const sello = sellos && sellos.length > 0 ? sellos[0] : null;
  
  if (!sello) {
    return (
      <div className="text-xs text-gray-400">
        Sin sello
      </div>
    );
  }

  const handleValueChange = (value: string) => {
    onFabricacionChange?.(order.id, value);
  };

  return (
    <Select value={sello.estado_fabricacion} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getFabricationChipVisual(item.fabricationState);
            return (
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {getFabricationLabel(item.fabricationState)}
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
