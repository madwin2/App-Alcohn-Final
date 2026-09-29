import { useState } from 'react';
import { Copy, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { buildReportText } from '@/lib/centro/helpers';

const REASONS = [
  { value: 'desactualizado', label: 'Está desactualizado' },
  { value: 'no_se_entiende', label: 'No se entiende' },
  { value: 'falta_info', label: 'Falta información' },
  { value: 'otro', label: 'Otro' },
];

interface CentroReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'article' | 'chat';
  title: string;
  href: string;
  question?: string;
}

export function CentroReportDialog({
  open,
  onOpenChange,
  kind,
  title,
  href,
  question,
}: CentroReportDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState('desactualizado');
  const [comment, setComment] = useState('');

  const handleCopy = async () => {
    const text = buildReportText({
      kind,
      title,
      href,
      reason: REASONS.find((r) => r.value === reason)?.label || reason,
      comment,
      question,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Reporte copiado',
        description: 'Pegalo donde corresponda. No se envió automáticamente.',
      });
      onOpenChange(false);
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Seleccioná el texto manualmente si hace falta.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Informar un problema
          </DialogTitle>
          <DialogDescription>
            Se copia un texto para que lo compartas. No se envía ni se guarda solo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="centro-report-comment">Comentario (opcional)</Label>
            <Textarea
              id="centro-report-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Qué esperabas encontrar o qué está mal…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
