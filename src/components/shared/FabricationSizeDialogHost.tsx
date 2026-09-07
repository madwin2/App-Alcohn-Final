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
        if (!next) close();
      }}
      fileName={payload?.fileName ?? ''}
      previewUrl={payload?.previewUrl}
      requestedWidthMm={payload?.requestedWidthMm ?? 0}
      requestedHeightMm={payload?.requestedHeightMm ?? 0}
      suggestion={
        payload?.suggestion ?? {
          widthMm: 0,
          heightMm: 0,
          tipoPlanchuela: null,
          marginAppliedMm: null,
        }
      }
      svgAspectRatio={payload?.svgAspectRatio ?? null}
      onConfirm={async (result) => {
        if (!payload) return;
        await payload.onConfirm(result);
      }}
    />
  );
}
