import React, { useState } from 'react';
import { ProductionItem } from '@/lib/types/index';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, AlertTriangle } from 'lucide-react';

interface CellDeadlineProps {
  item: ProductionItem;
  onDeadlineChange?: (itemId: string, deadline: Date | null) => void;
}

export function CellDeadline({ item, onDeadlineChange }: CellDeadlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Usar la fecha límite real del item, o null si no tiene
  const deadline = item.deadline ? new Date(item.deadline) : null;
  const today = new Date();
  const isOverdue = deadline ? isBefore(deadline, today) : false;
  const isNearDeadline = deadline ? isAfter(deadline, today) && isBefore(deadline, addDays(today, 3)) : false;

  const handleDeadlineChange = (newDeadline: Date | undefined) => {
    onDeadlineChange?.(item.id, newDeadline || null);
    setIsEditing(false);
    setIsOpen(false);
  };

  const getDeadlineText = () => {
    if (!deadline) return 'Sin fecha límite';
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

  const getDeadlineColor = () => {
    if (!deadline) return 'text-muted-foreground hover:bg-muted/50';
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 2) {
      // 2 días o menos: rojo
      return 'text-red-500 hover:bg-red-500/10';
    } else if (diffDays >= 3 && diffDays <= 7) {
      // 3 a 7 días: amarillo
      return 'text-yellow-500 hover:bg-yellow-500/10';
    } else {
      // Más de 7 días: gris
      return 'text-muted-foreground hover:bg-muted/50';
    }
  };

  if (!deadline) {
    return (
      <div className="flex items-center justify-start h-full">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:bg-muted/50 p-2 text-left"
            >
              Sin fecha límite
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 bg-card border-border">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Fecha límite</h4>
              </div>
              <div className="space-y-2">
                <DatePicker
                  date={undefined}
                  onDateChange={handleDeadlineChange}
                  placeholder="Seleccionar fecha límite"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-start h-full">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`text-xs p-2 text-left ${getDeadlineColor()}`}
          >
            {format(deadline, 'dd/MM/yy', { locale: es })} ({getDeadlineText()})
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
                    ⚠️ Item vencido
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
                      onDeadlineChange?.(item.id, null);
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
