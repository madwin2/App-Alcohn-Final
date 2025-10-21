import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Orden } from '@/lib/supabase/types';
import { getSaleStateColor, getSaleChipVisual, getSaleLabel } from '@/lib/utils/format';

interface CellVentaProps {
  order: Orden;
  onVentaChange?: (orderId: string, newState: string) => void;
}

const saleLabels: Record<string, string> = {
  'Señado': 'Señado',
  'Foto': 'Foto',
  'Transferido': 'Transferido'
};

export function CellVenta({ order, onVentaChange }: CellVentaProps) {
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
    onVentaChange?.(order.id, value);
  };

  return (
    <Select value={sello.estado_venta} onValueChange={handleValueChange}>
      <SelectTrigger className="w-full h-12 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent">
        <SelectValue>
          {(() => {
            const visual = getSaleChipVisual(sello.estado_venta);
            return (
              <span 
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
                style={{ backgroundImage: visual.backgroundImage, backgroundColor: visual.backgroundColor, boxShadow: visual.boxShadow, borderColor: visual.borderColor, backdropFilter: 'saturate(140%) blur(3px)', color: visual.textColor, width: visual.width }}
              >
                {getSaleLabel(sello.estado_venta)}
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
