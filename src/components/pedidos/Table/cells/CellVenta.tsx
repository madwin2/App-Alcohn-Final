import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Order, SaleState } from '@/lib/types/index';
import { getSaleStateColor, getSaleChipVisual, getSaleLabel } from '@/lib/utils/format';
import { useSound } from '@/lib/hooks/useSound';

interface CellVentaProps {
  order: Order;
  onVentaChange?: (orderId: string, newState: SaleState, itemId?: string) => void;
  isSubitem?: boolean;
}

const saleLabels: Record<SaleState, string> = {
  'SEÑADO': 'Señado',
  'FOTO_ENVIADA': 'Foto Enviada',
  'TRANSFERIDO': 'Transferido',
  'DEUDOR': 'Deudor'
};

export function CellVenta({ order, onVentaChange, isSubitem = false }: CellVentaProps) {
  const { playSound } = useSound();
  const item = order.items[0];
  
  if (!item) return null;

  const saleState = item.saleState as SaleState;
  const isEnabled = item.fabricationState === 'HECHO';
  
  const handleValueChange = (value: string) => {
    if (!isEnabled) return; // No permitir cambios si está deshabilitado
    
    const newState = value as SaleState;
    
    // Reproducir sonido satisfactorio cuando se marca como "Transferido"
    if (newState === 'TRANSFERIDO') {
      playSound('transfer');
    }
    
    // Si es subitem (fila expandida), pasar el itemId para actualizar solo ese sello
    // Si NO es subitem (fila resumen), pasar undefined para actualizar todos los sellos del pedido
    const itemId = isSubitem ? item.id : undefined;
    onVentaChange?.(order.id, newState, itemId);
  };

  // Para subitems, solo mostrar opciones limitadas
  const availableOptions = isSubitem 
    ? { 'SEÑADO': 'Señado', 'FOTO_ENVIADA': 'Foto Enviada' }
    : saleLabels;

  const visual = getSaleChipVisual(item.saleState);
  const disabledStyle = !isEnabled ? {
    backgroundColor: '#111827', // gris más oscuro
    color: '#6b7280', // gris medio para texto
    borderColor: '#1f2937',
    cursor: 'not-allowed',
  } : {};

  return (
    <Select value={item.saleState} onValueChange={handleValueChange} disabled={!isEnabled}>
      <SelectTrigger className={`w-full h-14 text-xs [&>svg]:hidden border-none bg-transparent rounded-lg p-3 overflow-visible flex items-center [&:hover]:bg-transparent ${!isEnabled ? 'cursor-not-allowed' : ''}`}>
        <SelectValue>
          <span 
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs border ${visual.textClass}`}
            style={!isEnabled ? disabledStyle : { 
              backgroundImage: visual.backgroundImage,
              backgroundColor: visual.backgroundColor,
              boxShadow: visual.boxShadow,
              borderColor: visual.borderColor,
              backdropFilter: 'saturate(140%) blur(3px)',
              color: visual.textColor,
              width: visual.width 
            }}
          >
            {getSaleLabel(item.saleState)}
          </span>
        </SelectValue>
      </SelectTrigger>
      {isEnabled && (
        <SelectContent>
          {Object.entries(availableOptions).map(([value, label]) => (
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
      )}
    </Select>
  );
}
