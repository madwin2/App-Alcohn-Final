import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  INNOVATION_PRIORITIES,
  INNOVATION_STATUSES,
  type InnovationPriority,
  type InnovationStatus,
} from '@/lib/supabase/services/innovation.service';

interface CreateIdeaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  onSubmit: (input: {
    title: string;
    areaId: string;
    description?: string;
    ownerId?: string;
    priority: InnovationPriority;
    status: InnovationStatus;
  }) => Promise<void>;
}

export function CreateIdeaModal({ open, onOpenChange, areas, users, onSubmit }: CreateIdeaModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [areaId, setAreaId] = useState('');
  const [ownerId, setOwnerId] = useState('none');
  const [priority, setPriority] = useState<InnovationPriority>('Media');
  const [status, setStatus] = useState<InnovationStatus>('Pendiente');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setAreaId(areas[0]?.id ?? '');
      setOwnerId('none');
      setPriority('Media');
      setStatus('Pendiente');
      setSubmitting(false);
      return;
    }
    if (!areaId && areas[0]) {
      setAreaId(areas[0].id);
    }
  }, [open, areas, areaId]);

  const handleSubmit = async () => {
    if (!title.trim() || !areaId) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        areaId,
        ownerId: ownerId === 'none' ? undefined : ownerId,
        priority,
        status,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva idea</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="idea-title">Título</Label>
            <Input
              id="idea-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej: Optimización de tiempos CNC"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idea-area">Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger id="idea-area">
                <SelectValue placeholder="Seleccionar área" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="idea-description">Descripción</Label>
            <Textarea
              id="idea-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Opcional"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={(next) => setPriority(next as InnovationPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INNOVATION_PRIORITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(next) => setStatus(next as InnovationStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INNOVATION_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !areaId || submitting}>
            {submitting ? 'Guardando...' : 'Guardar idea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
