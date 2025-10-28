import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Order, SaleState } from '@/lib/types/index';
import { getSaleStateColor, getSaleChipVisual, getSaleLabel } from '@/lib/utils/format';

interface CellVentaProps {
  order: Order;
  onVentaChange?: (orderId: string, newState: SaleState) => void;
}

const saleLabels: Record<SaleState | 'MULTIPLE', string> = {
  'SEÑADO': 'Señado',
  'FOTO_ENVIADA': 'Foto Enviada',
  'TRANSFERIDO': 'Transferido',
  'DEUDOR': 'Deudor',
  'MULTIPLE': 'Múltiple'
};

export function CellVenta({ order, onVentaChange }: CellVentaProps) {
  const item = order.items[0];
  
  if (!item) return null;

  const saleState = item.saleState as SaleState;
  
  const handleValueChange = (value: string) => {
    onVentaChange?.(order.id, value as SaleState);
  };

  return (
    <Select value={item.saleState} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getSaleChipVisual(item.saleState);
            return (
              <span 
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {getSaleLabel(item.saleState)}
              </span>
            );
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(saleLabels).map(([value, label]) => (
          <SelectItem key={value} value={value} className="text-xs">
            {(() => {
              const visual = getSaleChipVisual(value);
              return (
                <span 
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                  style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
                >
                  {getSaleLabel(value)}
                </span>
              );
            })()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
