import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Orden } from '@/lib/supabase/types';
import { getStampTypeIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';

interface CellTipoProps {
  order: Orden;
  onTipoChange?: (orderId: string, newTipo: string) => void;
}

const tipoOptions: { value: string; iconName: string; label: string }[] = [
  { value: '3mm', iconName: '3mm', label: '3MM' },
  { value: 'Alimento', iconName: 'Hamburguesa', label: 'Alimento' },
  { value: 'Clasico', iconName: 'CLASICO', label: 'Clásico' },
  { value: 'ABC', iconName: 'ABC', label: 'ABC' },
  { value: 'Lacre', iconName: 'LACRE', label: 'Lacre' }
];

export function CellTipo({ order, onTipoChange }: CellTipoProps) {
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
    onTipoChange?.(order.id, value);
  };

  return (
    <Select value={sello.tipo} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors">
          <SelectValue>
            <span className="flex items-center justify-center">
              <SvgIcon 
                name={getStampTypeIcon(sello.tipo)} 
                size={20}
                className="flex-shrink-0"
              />
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
