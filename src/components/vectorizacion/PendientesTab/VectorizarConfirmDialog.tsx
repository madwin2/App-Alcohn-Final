import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { VectorizeMode } from '@/lib/vectorizacion/vectorizerPreset';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellos: number;
  hojas: number;
  credits: number | null;
  mode: VectorizeMode;
  onConfirm: () => void;
}

export function VectorizarConfirmDialog({
  open,
  onOpenChange,
  sellos,
  hojas,
  credits,
  mode,
  onConfirm,
}: Props) {
  const cost = mode === 'production' ? hojas : 0;
  const insufficient = mode === 'production' && credits != null && credits < cost;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vectorizar {sellos} sellos</DialogTitle>
          <DialogDescription>
            {sellos} sellos → {hojas} {hojas === 1 ? 'hoja' : 'hojas'} →{' '}
            {mode === 'test' ? '0 créditos (modo prueba, con marca de agua)' : `${cost} créditos`}.
            {credits != null ? ` Quedan ${credits} en la cuenta.` : ''}
            {mode === 'production' && credits != null ? ` Después quedarían ${credits - cost}.` : ''}
          </DialogDescription>
        </DialogHeader>
        {insufficient ? (
          <p className="text-sm text-destructive">No hay créditos suficientes para esta tanda.</p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-white/15 bg-white/[0.04]"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={insufficient}
            className="border border-emerald-400/40 bg-emerald-500/20 text-foreground hover:bg-emerald-500/30"
            onClick={onConfirm}
          >
            {mode === 'test' ? 'Probar preset (gratis)' : `Vectorizar (${cost} créditos)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
