import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus } from 'lucide-react';

interface AddTaskModalProps {
  itemId: string;
  onTaskCreate: (itemId: string, title: string, description?: string, dueDate?: Date) => void;
  trigger?: React.ReactNode;
}

export function AddTaskModal({ itemId, onTaskCreate, trigger }: AddTaskModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onTaskCreate(itemId, title.trim(), description.trim() || undefined, dueDate);
      setTitle('');
      setDescription('');
      setDueDate(undefined);
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setTitle('');
    setDescription('');
    setDueDate(undefined);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-white/10"
          >
            <Plus className="w-2 h-2" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar nueva tarea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Título de la tarea *</Label>
            <Input
              id="task-title"
              placeholder="Ej: Revisar diseño final"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Descripción (opcional)</Label>
            <Textarea
              id="task-description"
              placeholder="Detalles adicionales sobre la tarea..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due-date">Fecha límite (opcional)</Label>
            <DatePicker
              date={dueDate}
              onDateChange={setDueDate}
              placeholder="Seleccionar fecha límite"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!title.trim()}
            >
              Crear tarea
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}






