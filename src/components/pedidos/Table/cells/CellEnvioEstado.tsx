import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, ShippingState } from '@/lib/types/index';
import { getShippingStateColor, getShippingChipVisual, getShippingLabel } from '@/lib/utils/format';
import { useSound } from '@/lib/hooks/useSound';

interface CellEnvioEstadoProps {
  order: Order;
  onEnvioEstadoChange?: (orderId: string, newState: ShippingState) => void;
}

const shippingLabels: Record<ShippingState, string> = {
  'SIN_ENVIO': 'Sin Envío',
  'HACER_ETIQUETA': 'Hacer Etiqueta',
  'ETIQUETA_LISTA': 'Etiqueta Lista',
  'DESPACHADO': 'D',
  'SEGUIMIENTO_ENVIADO': 'Seguimiento Enviado'
};

export function CellEnvioEstado({ order, onEnvioEstadoChange }: CellEnvioEstadoProps) {
  const { playSound } = useSound();
  const item = order.items[0];
  
  if (!item) return null;

  const shippingState = item.shippingState as ShippingState;
  
  const handleValueChange = (value: string) => {
    const newState = value as ShippingState;
    
    // Reproducir sonido cuando se marca como "Despachado"
    if (newState === 'DESPACHADO') {
      playSound('notification');
    }
    
    onEnvioEstadoChange?.(order.id, newState);
  };

  return (
    <Select value={item.shippingState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-14 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getShippingChipVisual(item.shippingState);
            return (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}>
                {getShippingLabel(item.shippingState)}
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
