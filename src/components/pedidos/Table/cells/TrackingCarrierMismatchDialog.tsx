import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ShippingCarrier } from '@/lib/types/index';
import { carrierDisplayLabel, trackingPrefixHint } from '@/lib/utils/trackingValidation';

interface TrackingCarrierMismatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackingNumber: string;
  currentCarrier: ShippingCarrier | null | undefined;
  detectedCarrier: ShippingCarrier;
  onChangeCarrier: () => void;
  onContinueWithoutChange: () => void;
  onCancel: () => void;
}

export function TrackingCarrierMismatchDialog({
  open,
  onOpenChange,
  trackingNumber,
  currentCarrier,
  detectedCarrier,
  onChangeCarrier,
  onContinueWithoutChange,
  onCancel,
}: TrackingCarrierMismatchDialogProps) {
  const prefix = trackingPrefixHint(trackingNumber);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[480px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Seguimiento y empresa no coinciden</DialogTitle>
          <DialogDescription>
            El número cargado empieza con <strong>{prefix}</strong>, que corresponde a{' '}
            <strong>{carrierDisplayLabel(detectedCarrier)}</strong>, pero el pedido tiene{' '}
            <strong>{carrierDisplayLabel(currentCarrier)}</strong> seleccionada.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
          {trackingNumber}
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={() => {
              onOpenChange(false);
              onChangeCarrier();
            }}
          >
            Cambiar empresa a {carrierDisplayLabel(detectedCarrier)}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onContinueWithoutChange();
            }}
          >
            Continuar sin cambiar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onCancel();
            }}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
