import React, { useState } from 'react';
import { ProductionItem, ProductionTask } from '@/lib/types/index';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle, Circle, Clock, Trash2, Plus, Calendar } from 'lucide-react';
import { AddTaskModal } from './AddTaskModal';

interface CellTareaProps {
  item: ProductionItem;
  onTaskCreate?: (itemId: string, title: string, description?: string, dueDate?: Date) => void;
  onTaskUpdate?: (taskId: string, updates: any) => void;
  onTaskDelete?: (taskId: string) => void;
}

export function CellTarea({ item, onTaskCreate, onTaskUpdate, onTaskDelete }: CellTareaProps) {
  const [isOpen, setIsOpen] = useState(false);

  const tasks = item.tasks || [];
  const pendingTasks = tasks.filter(task => task.status !== 'COMPLETADO');

  const handleTaskStatusChange = (taskId: string, newStatus: ProductionTask['status']) => {
    onTaskUpdate?.(taskId, { 
      status: newStatus,
      completedAt: newStatus === 'COMPLETADO' ? new Date().toISOString() : undefined
    });
  };

  const getStatusIcon = (status: ProductionTask['status']) => {
    switch (status) {
      case 'COMPLETADO':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'EN_PROGRESO':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ProductionTask['status']) => {
    switch (status) {
      case 'COMPLETADO':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'EN_PROGRESO':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getStatusLabel = (status: ProductionTask['status']) => {
    switch (status) {
      case 'COMPLETADO':
        return 'Completada';
      case 'EN_PROGRESO':
        return 'En progreso';
      case 'REVISAR':
        return 'Revisar';
      case 'REHACER':
        return 'Rehacer';
      default:
        return 'Pendiente';
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <AddTaskModal
          itemId={item.id}
          onTaskCreate={onTaskCreate || (() => {})}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-white/10 rounded-full"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {pendingTasks.length > 0 && (
              <Badge
                variant="secondary"
                className="h-4 w-4 rounded-full p-0 flex items-center justify-center text-xs font-medium bg-primary text-primary-foreground"
              >
                {pendingTasks.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Tareas de producción</h4>
              <AddTaskModal
                itemId={item.id}
                onTaskCreate={onTaskCreate || (() => {})}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                }
              />
            </div>
            
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <button
                  onClick={() => {
                    const newStatus = task.status === 'COMPLETADO' ? 'PENDIENTE' : 
                                    task.status === 'PENDIENTE' ? 'EN_PROGRESO' : 'COMPLETADO';
                    handleTaskStatusChange(task.id, newStatus);
                  }}
                  className="flex-shrink-0 mt-0.5"
                >
                  {getStatusIcon(task.status)}
                </button>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Select
                      value={task.status}
                      onValueChange={(value: ProductionTask['status']) => handleTaskStatusChange(task.id, value)}
                    >
                      <SelectTrigger className={`h-6 text-xs w-auto min-w-[120px] border rounded-md px-2 py-1 ${getStatusColor(task.status)}`}>
                        <SelectValue placeholder={getStatusLabel(task.status)} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                        <SelectItem value="EN_PROGRESO">En progreso</SelectItem>
                        <SelectItem value="REVISAR">Revisar</SelectItem>
                        <SelectItem value="REHACER">Rehacer</SelectItem>
                        <SelectItem value="COMPLETADO">Completada</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(task.createdAt), 'dd/MM/yy', { locale: es })}
                    </span>
                    {task.dueDate && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(task.dueDate), 'dd/MM/yy', { locale: es })}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => onTaskDelete?.(task.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
