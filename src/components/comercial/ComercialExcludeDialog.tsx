import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ComercialEntityType } from '@/lib/comercial/exclusions';

const ENTITY_LABELS: Record<ComercialEntityType, string> = {
  mockup: 'esta muestra',
  orden: 'este pedido web',
  cliente: 'este contacto',
};

interface ComercialExcludeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ComercialEntityType | null;
  entityLabel?: string;
  onConfirm: (motivo?: string) => Promise<void>;
}

export function ComercialExcludeDialog({
  open,
  onOpenChange,
  entityType,
  entityLabel,
  onConfirm,
}: ComercialExcludeDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm('Prueba / dato interno');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = entityType ? ENTITY_LABELS[entityType] : 'este registro';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir de Comercial Web</DialogTitle>
          <DialogDescription>
            {entityLabel ? (
              <>
                <span className="font-medium text-foreground">{entityLabel}</span>
                {' — '}
              </>
            ) : null}
            Se ocultará {typeLabel} del panel y dejará de contar en KPIs, embudo y exportaciones.
            El registro sigue en Supabase por si lo necesitás en otro módulo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExcludeButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-destructive"
      onClick={onClick}
      disabled={disabled}
      title="Excluir de estadísticas"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
