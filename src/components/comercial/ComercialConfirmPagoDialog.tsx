import { Loader2, CheckCircle2 } from 'lucide-react';
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
import type { OrdenSeguimientoRow } from '@/lib/comercial/types';
import { formatArs } from '@/lib/comercial/utils';

interface ComercialConfirmPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: OrdenSeguimientoRow | null;
  onConfirm: () => Promise<void>;
}

export function ComercialConfirmPagoDialog({
  open,
  onOpenChange,
  row,
  onConfirm,
}: ComercialConfirmPagoDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const needsComprobanteWarning =
    row?.metodoPago === 'Transferencia' && !row.comprobanteSubido;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar pago</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {row ? (
                <>
                  <p>
                    Vas a confirmar el pago de{' '}
                    <span className="font-medium text-foreground">{row.nombre}</span> y crear el
                    pedido en Producción.
                  </p>
                  <ul className="list-inside list-disc space-y-1">
                    <li>Método: {row.metodoPago ?? '—'}</li>
                    <li>Total estimado: {formatArs(row.valorTotal)}</li>
                    <li>Comprobante: {row.comprobanteSubido ? 'Subido' : 'No subido'}</li>
                  </ul>
                  {needsComprobanteWarning ? (
                    <p className="text-destructive">
                      No hay comprobante cargado. Confirmá solo si verificaste el pago por otro
                      medio.
                    </p>
                  ) : null}
                </>
              ) : (
                <p>Seleccioná un pedido para confirmar.</p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={loading || !row}>
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 size-4" />
            )}
            Confirmar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmPagoButton({
  onClick,
  disabled,
  loading,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-green-600 hover:text-green-700"
      onClick={onClick}
      disabled={disabled || loading}
      title="Confirmar pago y crear pedido"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CheckCircle2 className="size-4" />
      )}
    </Button>
  );
}
