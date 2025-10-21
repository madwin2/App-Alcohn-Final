import { ProductionItem } from '@/lib/types/index';
import { formatDate } from '@/lib/utils/format';

interface CellFechaProps {
  item: ProductionItem;
  onDateChange?: (itemId: string, newDate: Date) => void;
}

export function CellFecha({ item, onDateChange }: CellFechaProps) {
  // Para producción, usamos la fecha de creación del item
  const orderDate = new Date().toISOString().split('T')[0]; // Mock date
  
  return (
    <div className="text-xs text-left">
      {formatDate(orderDate)}
    </div>
  );
}
