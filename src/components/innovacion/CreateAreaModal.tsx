import { useEffect, useState } from 'react';
import { Shapes } from 'lucide-react';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InnovacionDialogContent } from '@/components/innovacion/InnovacionDialog';
import { InnovacionFieldLabel, InnovacionModalHeader } from '@/components/innovacion/InnovacionHints';
import { innovacionFieldSurface } from '@/components/innovacion/innovacion-ui';

interface CreateAreaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; description?: string; color: string }) => Promise<void>;
}

export function CreateAreaModal({ open, onOpenChange, onSubmit }: CreateAreaModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setColor('#3b82f6');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <InnovacionDialogContent className="sm:max-w-md">
        <InnovacionModalHeader
          icon={Shapes}
          title="Nueva área"
          description="Agrupá proyectos por equipo, producto o iniciativa. El color identifica la columna en el tablero."
        />
        <div className="space-y-4">
          <div className="space-y-2">
            <InnovacionFieldLabel
              htmlFor="area-name"
              label="Nombre"
              hint="Nombre corto y reconocible para la columna del tablero (ej. Producción, Marketing)."
            />
            <Input
              id="area-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej: Producción"
              className={innovacionFieldSurface}
            />
          </div>
          <div className="space-y-2">
            <InnovacionFieldLabel
              htmlFor="area-description"
              label="Descripción"
              hint="Opcional. Contexto para el equipo sobre qué tipo de proyectos van acá."
            />
            <Textarea
              id="area-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Opcional"
              className={innovacionFieldSurface}
            />
          </div>
          <div className="space-y-2">
            <InnovacionFieldLabel
              htmlFor="area-color"
              label="Color"
              hint="Se muestra en la barra superior de la columna para distinguir áreas de un vistazo."
            />
            <Input
              id="area-color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-20 cursor-pointer border-white/10 bg-zinc-900 p-1"
            />
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
            disabled={submitting || !name.trim()}
            className="bg-amber-600 text-white hover:bg-amber-500"
          >
            {submitting ? 'Guardando...' : 'Crear área'}
          </Button>
        </DialogFooter>
      </InnovacionDialogContent>
    </Dialog>
  );
}

