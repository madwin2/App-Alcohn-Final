import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatDate, isDeadlineNear, getDaysUntilDeadline } from '@/lib/utils/format';
import type { Orden } from '@/lib/supabase/types';
import { DatePicker } from '@/components/ui/date-picker';

interface CellFechaProps {
  order: Orden;
  onDateChange?: (orderId: string, newDate: Date) => void;
}

export function CellFecha({ order, onDateChange }: CellFechaProps) {
  // Convertir la fecha de string a Date de manera segura
  const orderDate = order.fecha ? new Date(order.fecha) : new Date();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(orderDate);
  
  // Verificar si la fecha es válida
  const isValidDate = orderDate && !isNaN(orderDate.getTime());
  
  if (!isValidDate) {
    return (
      <div className="text-xs text-gray-400">
        Fecha inválida
      </div>
    );
  }

  const isNearDeadline = false; // Por ahora no tenemos deadline en la estructura actual
  const daysUntilDeadline = 0;

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      onDateChange?.(order.id, date);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DatePicker
        date={selectedDate}
        onDateChange={handleDateChange}
        placeholder={formatDate(orderDate)}
        className="h-6 text-xs text-gray-400 border-none bg-transparent hover:bg-gray-200/10 rounded px-2 py-1"
      />
      {isNearDeadline && (
        <div className="flex items-center gap-1 text-amber-600" title={`Vence en ${daysUntilDeadline} días`}>
          <AlertTriangle className="h-3 w-3" />
          <span className="text-xs font-medium">
            {daysUntilDeadline}d
          </span>
        </div>
      )}
    </div>
  );
}
