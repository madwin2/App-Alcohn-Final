import { useEffect } from 'react';
import { useFabricationSizeDialogStore } from '@/lib/state/fabricationSizeDialog.store';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { saveFabricationSize } from '@/lib/vectorizacion/saveVector';

/** Encola los modales de medida de fabricación (1 de N) tras confirmar vectores. */
export function VectorReviewHost() {
  const reviews = useVectorizacionStore((s) => s.fabricationReviews);
  const setReviews = useVectorizacionStore((s) => s.setFabricationReviews);
  const open = useFabricationSizeDialogStore((s) => s.open);
  const payload = useFabricationSizeDialogStore((s) => s.payload);

  useEffect(() => {
    const current = reviews[0];
    if (!current || payload) return;
    const total = reviews.length;
    open({
      fileName: total > 1 ? `${current.fileName} (1 de ${total})` : current.fileName,
      previewUrl: current.previewUrl,
      requestedWidthMm: current.requestedWidthMm,
      requestedHeightMm: current.requestedHeightMm,
      resolution: current.resolution,
      svgAspectRatio: current.svgAspectRatio,
      onConfirm: async ({ widthMm, heightMm }) => {
        await saveFabricationSize(current.selloId, widthMm, heightMm);
        setReviews(useVectorizacionStore.getState().fabricationReviews.slice(1));
      },
    });
  }, [open, payload, reviews, setReviews]);

  return null;
}
