import { useState } from 'react';
import { Order, ShippingCarrier, ShippingServiceDest } from '@/lib/types/index';
import { EditableInline } from './EditableInline';
import { TrackingCarrierMismatchDialog } from './TrackingCarrierMismatchDialog';
import {
  detectCarrierFromTracking,
  hasTrackingCarrierConflict,
} from '@/lib/utils/trackingValidation';

interface CellSeguimientoProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellSeguimiento({ order, editingRowId, onUpdate }: CellSeguimientoProps) {
  const trackingNumber = order.shipping.trackingNumber || order.items[0]?.trackingNumber;
  const isEditing = editingRowId === order.id;
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const detectedCarrier = pendingValue ? detectCarrierFromTracking(pendingValue) : null;

  const commitTracking = (
    value: string,
    carrierOverride?: ShippingCarrier | null,
  ) => {
    const nextCarrier = carrierOverride === undefined ? order.shipping.carrier : carrierOverride;
    const nextService: ShippingServiceDest | null | undefined =
      carrierOverride && carrierOverride !== 'OTRO' && carrierOverride !== 'RETIRO_EN_PERSONA'
        ? order.shipping.service || 'DOMICILIO'
        : carrierOverride === 'OTRO' || carrierOverride === 'RETIRO_EN_PERSONA'
          ? null
          : order.shipping.service;

    onUpdate?.(order.id, {
      shipping: {
        ...order.shipping,
        trackingNumber: value || null,
        ...(carrierOverride !== undefined
          ? { carrier: nextCarrier, service: nextService ?? null }
          : {}),
      },
    });
  };

  const handleCommit = (v: string) => {
    const value = v.trim();
    if (!value) {
      commitTracking('');
      return;
    }
    if (hasTrackingCarrierConflict(value, order.shipping.carrier)) {
      setPendingValue(value);
      setDialogOpen(true);
      return;
    }
    commitTracking(value);
  };

  return (
    <>
      {isEditing ? (
        <div className="text-sm">
          <EditableInline
            value={trackingNumber || ''}
            onCommit={handleCommit}
            className="font-mono text-xs"
          />
        </div>
      ) : (
        <div className="text-sm">
          {trackingNumber ? (
            <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
              {trackingNumber}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Sin asignar</span>
          )}
        </div>
      )}

      {pendingValue && detectedCarrier ? (
        <TrackingCarrierMismatchDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          trackingNumber={pendingValue}
          currentCarrier={order.shipping.carrier}
          detectedCarrier={detectedCarrier}
          onChangeCarrier={() => {
            commitTracking(pendingValue, detectedCarrier);
            setPendingValue(null);
          }}
          onContinueWithoutChange={() => {
            commitTracking(pendingValue);
            setPendingValue(null);
          }}
          onCancel={() => setPendingValue(null)}
        />
      ) : null}
    </>
  );
}
