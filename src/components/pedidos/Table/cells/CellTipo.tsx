import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, StampType } from '@/lib/types/index';
import { getStampTypeIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';

interface CellTipoProps {
  order: Order;
  onTipoChange?: (orderId: string, newTipo: StampType) => void;
}

const tipoOptions: { value: StampType; iconName: string; label: string }[] = [
  { value: '3MM', iconName: '3mm', label: '3MM' },
  { value: 'ALIMENTO', iconName: 'Hamburguesa', label: 'Alimento' },
  { value: 'CLASICO', iconName: 'CLASICO', label: 'Clásico' },
  { value: 'ABC', iconName: 'ABC', label: 'ABC' },
  { value: 'LACRE', iconName: 'LACRE', label: 'Lacre' }
];

export function CellTipo({ order, onTipoChange }: CellTipoProps) {
  const item = order.items[0];
  
  if (!item) return null;

  const handleValueChange = (value: string) => {
    // Pasar el ID del item si existe (para items individuales en filas expandidas)
    const itemId = item.id;
    onTipoChange?.(order.id, value as StampType);
  };

  return (
    <Select value={item.stampType} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors">
          <SelectValue>
            <span className="flex items-center justify-center">
              {item.stampType !== 'CLASICO' && (
                <SvgIcon 
                  name={getStampTypeIcon(item.stampType)} 
                  size={20}
                  className="flex-shrink-0"
                />
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
      <SelectContent>
        {tipoOptions.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            <span className="flex items-center gap-2">
              <SvgIcon 
                name={option.iconName} 
                size={16}
                className="flex-shrink-0"
              />
              <span>{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
