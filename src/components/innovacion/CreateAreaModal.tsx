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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva área</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="area-name">Nombre</Label>
            <Input
              id="area-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej: Producción"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="area-description">Descripción</Label>
            <Textarea
              id="area-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="area-color">Color</Label>
            <Input
              id="area-color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-10 w-20 p-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? 'Guardando...' : 'Crear área'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
