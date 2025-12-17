import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, ShippingCarrier, ShippingServiceDest, ShippingOption } from '@/lib/types/index';
import { getCarrierIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';

interface CellEnvioProps {
  order: Order;
  onEnvioChange?: (orderId: string, carrier: ShippingCarrier | null, service: ShippingServiceDest | null) => void;
}

// Opciones combinadas de empresa + servicio
const shippingOptions: { value: ShippingOption; carrier: ShippingCarrier | null; service: ShippingServiceDest | null; iconName: string; label: string }[] = [
  { value: 'ANDREANI_DOMICILIO', carrier: 'ANDREANI', service: 'DOMICILIO', iconName: 'ANDREANI DOMICILIO', label: 'Andreani Domicilio' },
  { value: 'ANDREANI_SUCURSAL', carrier: 'ANDREANI', service: 'SUCURSAL', iconName: 'ANDREANI SUCURSAL', label: 'Andreani Sucursal' },
  { value: 'CORREO_ARGENTINO_DOMICILIO', carrier: 'CORREO_ARGENTINO', service: 'DOMICILIO', iconName: 'CORREO ARGENTINO DOMICILIO', label: 'Correo Argentino Domicilio' },
  { value: 'CORREO_ARGENTINO_SUCURSAL', carrier: 'CORREO_ARGENTINO', service: 'SUCURSAL', iconName: 'CORREO ARGENTINO SUCURSAL', label: 'Correo Argentino Sucursal' },
  { value: 'VIA_CARGO_DOMICILIO', carrier: 'VIA_CARGO', service: 'DOMICILIO', iconName: 'VIA CARGO DOMICILIO', label: 'Vía Cargo Domicilio' },
  { value: 'VIA_CARGO_SUCURSAL', carrier: 'VIA_CARGO', service: 'SUCURSAL', iconName: 'VIA CARGO SUCURSAL', label: 'Vía Cargo Sucursal' },
  { value: 'OTRO', carrier: 'OTRO', service: null, iconName: 'ANDREANI DOMICILIO', label: 'Otro' },
  { value: 'NONE', carrier: null, service: null, iconName: 'ANDREANI DOMICILIO', label: '—' },
];

// Función para obtener el valor combinado actual
const getCurrentShippingOption = (carrier: ShippingCarrier | null | undefined, service: ShippingServiceDest | null | undefined): ShippingOption => {
  if (!carrier) {
    return 'NONE';
  }
  
  if (carrier === 'OTRO') {
    return 'OTRO';
  }
  
  const option = `${carrier}_${service || 'DOMICILIO'}` as ShippingOption;
  return shippingOptions.find(o => o.value === option)?.value || 'NONE';
};

// Función para obtener el icono según la opción
const getIconForOption = (option: ShippingOption): string => {
  const found = shippingOptions.find(o => o.value === option);
  return found?.iconName || 'ANDREANI DOMICILIO';
};

export function CellEnvio({ order, onEnvioChange }: CellEnvioProps) {
  const { shipping } = order;
  const currentOption = getCurrentShippingOption(shipping.carrier, shipping.service);
  
  const handleValueChange = (value: string) => {
    const selectedOption = shippingOptions.find(o => o.value === value);
    if (selectedOption && onEnvioChange) {
      onEnvioChange(order.id, selectedOption.carrier, selectedOption.service);
    }
  };

  return (
    <div className="flex justify-center items-center w-full">
      <Select value={currentOption} onValueChange={handleValueChange}>
        <SelectTrigger className="w-auto h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors flex justify-center items-center px-2">
          <SelectValue>
            <span className="flex items-center justify-center">
              <SvgIcon 
                name={getIconForOption(currentOption)} 
                size={20}
                className="flex-shrink-0"
              />
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {shippingOptions.map((option) => (
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
