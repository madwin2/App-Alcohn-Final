import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Orden } from '@/lib/supabase/types';
import { getShippingStateColor, getShippingChipVisual, getShippingLabel } from '@/lib/utils/format';

interface CellEnvioEstadoProps {
  order: Orden;
  onEnvioEstadoChange?: (orderId: string, newState: string) => void;
}

const shippingLabels: Record<string, string> = {
  'Sin envio': 'Sin Envío',
  'Hacer Etiqueta': 'Hacer Etiqueta',
  'Etiqueta Lista': 'Etiqueta Lista',
  'Despachado': 'Despachado',
  'Seguimiento Enviado': 'Seguimiento Enviado'
};

export function CellEnvioEstado({ order, onEnvioEstadoChange }: CellEnvioEstadoProps) {
  const shippingState = order.estado_envio;
  
  if (!shippingState) return null;

  const handleValueChange = (value: string) => {
    onEnvioEstadoChange?.(order.id, value);
  };

  return (
    <Select value={shippingState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getShippingChipVisual(shippingState);
            return (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}>
                {getShippingLabel(shippingState)}
              </span>
            );
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(shippingLabels).map(([value, label]) => (
          <SelectItem key={value} value={value} className="text-xs">
            {(() => {
              const visual = getShippingChipVisual(value);
              return (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}>
                  {getShippingLabel(value)}
                </span>
              );
            })()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
