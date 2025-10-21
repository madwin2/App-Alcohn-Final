import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Orden } from '@/lib/supabase/types';
import { getCarrierIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';

interface CellEnvioProps {
  order: Orden;
  onEnvioChange?: (orderId: string, newCarrier: string) => void;
}

const carrierOptions: { value: string; iconName: string; label: string }[] = [
  { value: 'Andreani', iconName: 'ANDREANI DOMICILIO', label: 'Andreani' },
  { value: 'Correo Argentino', iconName: 'CORREO ARGENTINO DOMICILIO', label: 'Correo Argentino' },
  { value: 'Via Cargo', iconName: 'VIA CARGO DOMICILIO', label: 'Vía Cargo' },
  { value: 'Retiro', iconName: 'ANDREANI DOMICILIO', label: 'Retiro' }
];

export function CellEnvio({ order, onEnvioChange }: CellEnvioProps) {
  const empresaEnvio = order.empresa_envio;
  
  const handleValueChange = (value: string) => {
    onEnvioChange?.(order.id, value);
  };

  return (
    <div className="flex justify-center items-center w-full">
      <Select value={empresaEnvio || ''} onValueChange={handleValueChange}>
        <SelectTrigger className="w-auto h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors flex justify-center items-center px-2">
          <SelectValue>
            <span className="flex items-center justify-center">
              <SvgIcon 
                name={getCarrierIcon(empresaEnvio || '')} 
                size={20}
                className="flex-shrink-0"
              />
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {carrierOptions.map((option) => (
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
    </div>
  );
}
