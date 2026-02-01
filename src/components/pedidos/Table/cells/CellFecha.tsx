import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatDate, isDeadlineNear, getDaysUntilDeadline, parseOrderDateLocal } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { DatePicker } from '@/components/ui/date-picker';

interface CellFechaProps {
  order: Order;
  onDateChange?: (orderId: string, newDate: Date) => void;
}

export function CellFecha({ order, onDateChange }: CellFechaProps) {
  const initialDate = useMemo(() => {
    const d = parseOrderDateLocal(order.orderDate);
    return !isNaN(d.getTime()) ? d : undefined;
  }, [order.orderDate]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  useEffect(() => {
    const d = parseOrderDateLocal(order.orderDate);
    setSelectedDate(!isNaN(d.getTime()) ? d : undefined);
  }, [order.orderDate]);
  const isNearDeadline = isDeadlineNear(order.deadlineAt);
  const daysUntilDeadline = getDaysUntilDeadline(order.deadlineAt);

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
        placeholder={formatDate(order.orderDate)}
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
