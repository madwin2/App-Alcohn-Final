import React, { useState } from 'react';
import { Order } from '@/lib/types/index';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, AlertTriangle } from 'lucide-react';

interface CellDeadlineProps {
  order: Order;
  onDeadlineChange?: (orderId: string, deadline: Date | null) => void;
}

export function CellDeadline({ order, onDeadlineChange }: CellDeadlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const deadline = order.deadlineAt ? new Date(order.deadlineAt) : null;
  const today = new Date();
  const isOverdue = deadline && isBefore(deadline, today);
  const isNearDeadline = deadline && isAfter(deadline, today) && isBefore(deadline, addDays(today, 3));

  const getDeadlineColor = () => {
    if (isOverdue) return 'text-red-500';
    if (isNearDeadline) return 'text-yellow-500';
    return 'text-blue-500';
  };

  const getDeadlineIcon = () => {
    if (isOverdue || isNearDeadline) {
      return <AlertTriangle className="w-2 h-2" />;
    }
    return <Calendar className="w-2 h-2" />;
  };

  const handleDeadlineChange = (newDeadline: Date | undefined) => {
    onDeadlineChange?.(order.id, newDeadline || null);
    setIsEditing(false);
    setIsOpen(false);
  };

  const getDeadlineText = () => {
    if (!deadline) return 'Sin fecha';
    
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `${Math.abs(diffDays)} días vencido`;
    } else if (diffDays === 0) {
      return 'Hoy';
    } else if (diffDays === 1) {
      return 'Mañana';
    } else {
      return `En ${diffDays} días`;
    }
  };

  if (!deadline) {
    return (
      <div className="flex items-center justify-center h-full">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-white/10"
            >
              <Calendar className="w-2 h-2 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-card border-border">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Establecer fecha límite</h4>
              <div className="space-y-2">
                <DatePicker
                  date={undefined}
                  onDateChange={handleDeadlineChange}
                  placeholder="Seleccionar fecha"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-white/10 rounded-full"
          >
            <div className={`h-4 w-4 rounded-full flex items-center justify-center ${getDeadlineColor()}`}>
              {getDeadlineIcon()}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Fecha límite</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Cancelar' : 'Editar'}
              </Button>
            </div>
            
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium text-sm">
                    {format(deadline, 'dd/MM/yyyy', { locale: es })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {getDeadlineText()}
                </p>
                {isOverdue && (
                  <p className="text-xs text-red-500 mt-1 font-medium">
                    ⚠️ Pedido vencido
                  </p>
                )}
                {isNearDeadline && !isOverdue && (
                  <p className="text-xs text-yellow-500 mt-1 font-medium">
                    ⚠️ Próximo a vencer
                  </p>
                )}
              </div>
              
              {isEditing && (
                <div className="space-y-2">
                  <DatePicker
                    date={deadline}
                    onDateChange={handleDeadlineChange}
                    placeholder="Nueva fecha"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onDeadlineChange?.(order.id, null);
                      setIsEditing(false);
                      setIsOpen(false);
                    }}
                    className="w-full"
                  >
                    Eliminar fecha límite
                  </Button>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
