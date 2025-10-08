import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, ShippingCarrier } from '@/lib/types/index';
import { getCarrierIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';

interface CellEnvioProps {
  order: Order;
  onEnvioChange?: (orderId: string, newCarrier: ShippingCarrier) => void;
}

const carrierOptions: { value: ShippingCarrier; iconName: string; label: string }[] = [
  { value: 'ANDREANI', iconName: 'ANDREANI DOMICILIO', label: 'Andreani' },
  { value: 'CORREO_ARGENTINO', iconName: 'CORREO ARGENTINO DOMICILIO', label: 'Correo Argentino' },
  { value: 'VIA_CARGO', iconName: 'VIA CARGO DOMICILIO', label: 'Vía Cargo' },
  { value: 'OTRO', iconName: 'ANDREANI DOMICILIO', label: 'Otro' }
];

export function CellEnvio({ order, onEnvioChange }: CellEnvioProps) {
  const { shipping } = order;
  
  const handleValueChange = (value: string) => {
    onEnvioChange?.(order.id, value as ShippingCarrier);
  };

  return (
    <div className="flex justify-center items-center w-full">
      <Select value={shipping.carrier} onValueChange={handleValueChange}>
        <SelectTrigger className="w-auto h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors flex justify-center items-center px-2">
          <SelectValue>
            <span className="flex items-center justify-center">
              <SvgIcon 
                name={getCarrierIcon(shipping.carrier)} 
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
