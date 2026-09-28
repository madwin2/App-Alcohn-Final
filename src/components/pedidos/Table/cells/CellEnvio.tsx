import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, ShippingCarrier, ShippingServiceDest, ShippingOption } from '@/lib/types/index';
import { SvgIcon } from '@/components/ui/SvgIcon';
import { Copy, Link2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';

interface CellEnvioProps {
  order: Order;
  onEnvioChange?: (orderId: string, carrier: ShippingCarrier | null, service: ShippingServiceDest | null) => void;
}

function formatDhlAddress(addr: Record<string, string>): string {
  return [
    addr.nombreCompleto,
    addr.direccion1,
    addr.distrito,
    addr.ciudad,
    addr.region,
    addr.codigoPostal,
    addr.telefono,
  ]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

// Opciones combinadas de empresa + servicio
const shippingOptions: { value: ShippingOption; carrier: ShippingCarrier | null; service: ShippingServiceDest | null; iconName: string; label: string }[] = [
  { value: 'ANDREANI_DOMICILIO', carrier: 'ANDREANI', service: 'DOMICILIO', iconName: 'ANDREANI DOMICILIO', label: 'Andreani Domicilio' },
  { value: 'ANDREANI_SUCURSAL', carrier: 'ANDREANI', service: 'SUCURSAL', iconName: 'ANDREANI SUCURSAL', label: 'Andreani Sucursal' },
  { value: 'CORREO_ARGENTINO_DOMICILIO', carrier: 'CORREO_ARGENTINO', service: 'DOMICILIO', iconName: 'CORREO ARGENTINO DOMICILIO', label: 'Correo Argentino Domicilio' },
  { value: 'CORREO_ARGENTINO_SUCURSAL', carrier: 'CORREO_ARGENTINO', service: 'SUCURSAL', iconName: 'CORREO ARGENTINO SUCURSAL', label: 'Correo Argentino Sucursal' },
  { value: 'VIA_CARGO_DOMICILIO', carrier: 'VIA_CARGO', service: 'DOMICILIO', iconName: 'VIA CARGO DOMICILIO', label: 'Vía Cargo Domicilio' },
  { value: 'VIA_CARGO_SUCURSAL', carrier: 'VIA_CARGO', service: 'SUCURSAL', iconName: 'VIA CARGO SUCURSAL', label: 'Vía Cargo Sucursal' },
  { value: 'DHL', carrier: 'DHL', service: null, iconName: '', label: 'DHL Internacional' },
  { value: 'RETIRO_EN_PERSONA', carrier: 'RETIRO_EN_PERSONA', service: null, iconName: '', label: 'Retiro en Persona' },
  { value: 'OTRO', carrier: 'OTRO', service: null, iconName: 'ANDREANI DOMICILIO', label: 'Otro' },
  { value: 'NONE', carrier: null, service: null, iconName: '', label: '—' },
];

// Función para obtener el valor combinado actual
const getCurrentShippingOption = (carrier: ShippingCarrier | null | undefined, service: ShippingServiceDest | null | undefined): ShippingOption => {
  if (!carrier) {
    return 'NONE';
  }
  
  if (carrier === 'OTRO') {
    return 'OTRO';
  }

  if (carrier === 'RETIRO_EN_PERSONA') {
    return 'RETIRO_EN_PERSONA';
  }

  if (carrier === 'DHL') {
    return 'DHL';
  }
  
  const option = `${carrier}_${service || 'DOMICILIO'}` as ShippingOption;
  return shippingOptions.find(o => o.value === option)?.value || 'NONE';
};

// Función para obtener el icono según la opción
const getIconForOption = (option: ShippingOption): string | null => {
  const found = shippingOptions.find(o => o.value === option);
  return found?.iconName || null;
};

export function CellEnvio({ order, onEnvioChange }: CellEnvioProps) {
  const { shipping } = order;
  const { toast } = useToast();
  const currentOption = getCurrentShippingOption(shipping.carrier, shipping.service);
  const hasAndreaniLink = Boolean(order.andreaniLinkUrl);
  const isDhl = shipping.carrier === 'DHL';
  const dhlAddress = order.internationalAddress ? formatDhlAddress(order.internationalAddress) : '';
  
  const handleValueChange = (value: string) => {
    const selectedOption = shippingOptions.find(o => o.value === value);
    if (selectedOption && onEnvioChange) {
      onEnvioChange(order.id, selectedOption.carrier, selectedOption.service);
    }
  };

  const handleCopyDhlAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dhlAddress) return;
    try {
      await navigator.clipboard.writeText(dhlAddress);
      toast({ title: 'Dirección copiada', description: 'Listo para pegar en DHL.' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  return (
    <div className="flex justify-center items-center gap-1 w-full">
      <Select value={currentOption} onValueChange={handleValueChange}>
        <SelectTrigger className="w-auto h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors flex justify-center items-center px-2">
          <SelectValue>
            <span className="flex items-center justify-center">
              {isDhl ? (
                <span
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                  title={dhlAddress || 'DHL Internacional'}
                >
                  DHL
                </span>
              ) : getIconForOption(currentOption) ? (
                <SvgIcon 
                  name={getIconForOption(currentOption)!} 
                  size={20}
                  className="flex-shrink-0"
                />
              ) : currentOption === 'RETIRO_EN_PERSONA' ? (
                <span className="text-xs font-medium">Retiro</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {shippingOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              <span className="flex items-center gap-2">
                {option.iconName ? (
                  <SvgIcon 
                    name={option.iconName} 
                    size={16}
                    className="flex-shrink-0"
                  />
                ) : null}
                <span>{option.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isDhl && dhlAddress ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-0.5 text-amber-700 hover:text-amber-800"
                onClick={handleCopyDhlAddress}
                aria-label="Copiar dirección DHL"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Copiar dirección
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      {hasAndreaniLink ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-0.5 text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  void navigator.clipboard.writeText(order.andreaniLinkUrl!);
                }}
                aria-label="Copiar link Andreani"
              >
                <Link2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Link Andreani asignado — click para copiar
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}
