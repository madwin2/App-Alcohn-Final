import { VectorSizeConfirmDialog } from '@/components/shared/VectorSizeConfirmDialog';
import { useFabricationSizeDialogStore } from '@/lib/state/fabricationSizeDialog.store';

/** Host único del popup de medida de fabricación (Pedidos + Producción). */
export function FabricationSizeDialogHost() {
  const payload = useFabricationSizeDialogStore((s) => s.payload);
  const close = useFabricationSizeDialogStore((s) => s.close);

  return (
    <VectorSizeConfirmDialog
      open={payload != null}
      onOpenChange={(next) => {
        if (next) return;
        // Después de confirmar el payload ya se limpió: esto es un cierre sin confirmar.
        const current = useFabricationSizeDialogStore.getState().payload;
        if (!current) return;
        close();
        current.onCancel?.();
      }}
      cancelLabel={payload?.cancelLabel}
      fileName={payload?.fileName ?? ''}
      previewUrl={payload?.previewUrl}
      requestedWidthMm={payload?.requestedWidthMm ?? 0}
      requestedHeightMm={payload?.requestedHeightMm ?? 0}
      resolution={
        payload?.resolution ?? {
          widthMm: 0,
          heightMm: 0,
          tipoPlanchuela: null,
          maxUsableMm: null,
          needsReview: true,
          reviewReason: 'exceeds_tope',
          measuredWidthMm: null,
          measuredHeightMm: null,
        }
      }
      svgAspectRatio={payload?.svgAspectRatio ?? null}
      onConfirm={async (result) => {
        if (!payload) return;
        await payload.onConfirm(result);
        if (useFabricationSizeDialogStore.getState().payload === payload) close();
      }}
    />
  );
}
