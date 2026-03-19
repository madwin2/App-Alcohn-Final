import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createDashboardTask } from '@/lib/supabase/services/dashboard-tasks.service';
import { useToast } from '@/components/ui/use-toast';
import { UserPlus } from 'lucide-react';

interface AddTaskToColleagueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colleagues: Array<{ id: string; name: string }>;
  currentUserId: string;
  onTaskCreated: () => void;
}

export function AddTaskToColleagueDialog({
  open,
  onOpenChange,
  colleagues,
  currentUserId,
  onTaskCreated,
}: AddTaskToColleagueDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !selectedUserId) {
      toast({
        title: 'Completá los datos',
        description: 'Elegí un compañero y escribí la tarea.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedUserId === currentUserId) {
      toast({
        title: 'No podés asignarte a vos mismo',
        description: 'Elegí otro compañero para asignarle la tarea.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createDashboardTask(selectedUserId, currentUserId, trimmed);
      toast({
        title: 'Tarea asignada',
        description: 'Tu compañero verá la tarea en su inicio.',
      });
      setText('');
      setSelectedUserId('');
      onTaskCreated();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo asignar la tarea. Intentá de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const colleaguesToShow = colleagues.filter((c) => c.id !== currentUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Asignar tarea a un compañero
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="colleague">Compañero</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="colleague">
                <SelectValue placeholder="Elegí a quién asignar..." />
              </SelectTrigger>
              <SelectContent>
                {colleaguesToShow.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No hay otros compañeros
                  </SelectItem>
                ) : (
                  colleaguesToShow.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-text">Tarea</Label>
            <Textarea
              id="task-text"
              placeholder="Escribí la tarea que querés asignar..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || colleaguesToShow.length === 0}>
            {isSubmitting ? 'Enviando...' : 'Asignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
