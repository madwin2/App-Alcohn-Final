import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { InnovacionDialogContent } from '@/components/innovacion/InnovacionDialog';
import { InnovacionFieldLabel, InnovacionModalHeader } from '@/components/innovacion/InnovacionHints';
import { innovacionFieldSurface } from '@/components/innovacion/innovacion-ui';

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
      <InnovacionDialogContent className="sm:max-w-lg">
        <InnovacionModalHeader
          icon={Lightbulb}
          title="Nueva idea"
          description="Registrá una mejora o iniciativa como proyecto en el área que corresponda. Podés ajustar estado y prioridad después."
        />
        <div className="space-y-4">
          <div className="space-y-2">
            <InnovacionFieldLabel
              htmlFor="idea-title"
              label="Título"
              hint="Nombre claro de la idea o proyecto. Aparece en la tarjeta del tablero."
            />
            <Input
              id="idea-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ej: Optimización de tiempos CNC"
              className={innovacionFieldSurface}
            />
          </div>
          <div className="space-y-2">
            <InnovacionFieldLabel
              htmlFor="idea-area"
              label="Área"
              hint="Columna del tablero donde se listará este proyecto."
            />
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger id="idea-area" className={innovacionFieldSurface}>
                <SelectValue placeholder="Seleccionar área" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <InnovacionFieldLabel
              htmlFor="idea-description"
              label="Descripción"
              hint="Contexto, alcance o criterios de éxito. Opcional pero recomendado."
            />
            <Textarea
              id="idea-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Opcional"
              className={innovacionFieldSurface}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <InnovacionFieldLabel label="Responsable" hint="Dueño del proyecto. Podés dejarlo sin asignar." />
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className={innovacionFieldSurface}>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
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
              <InnovacionFieldLabel label="Prioridad" hint="Urgencia relativa frente a otras iniciativas del área." />
              <Select value={priority} onValueChange={(next) => setPriority(next as InnovationPriority)}>
                <SelectTrigger className={innovacionFieldSurface}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  {INNOVATION_PRIORITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <InnovacionFieldLabel label="Estado" hint="Etapa actual del proyecto en el flujo interno." />
              <Select value={status} onValueChange={(next) => setStatus(next as InnovationStatus)}>
                <SelectTrigger className={innovacionFieldSurface}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
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
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-white/15 text-zinc-200 hover:bg-white/10"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !areaId || submitting}
            className="bg-amber-600 text-white hover:bg-amber-500"
          >
            {submitting ? 'Guardando...' : 'Guardar idea'}
          </Button>
        </DialogFooter>
      </InnovacionDialogContent>
    </Dialog>
  );
}


