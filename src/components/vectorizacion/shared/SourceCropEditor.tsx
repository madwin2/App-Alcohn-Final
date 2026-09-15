import { CropEditor } from './CropEditor';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { bitmapToDataUrl } from '@/lib/vectorizacion/bitmapPreview';
import { buildPrep } from '@/lib/vectorizacion/buildPrep';
import { cropFromPixels } from '@/lib/vectorizacion/cropGeometry';

export function SourceCropEditor({ sourceId, onClose }: { sourceId: string | null; onClose: () => void }) {
  const store = useVectorizacionStore();
  const source = sourceId ? store.sources[sourceId] : null;
  const prepared = sourceId ? store.prepared[sourceId] : null;
  if (!source || !prepared) return null;

  return (
    <CropEditor
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      imageUrl={bitmapToDataUrl(source)}
      naturalWidth={source.naturalWidth}
      naturalHeight={source.naturalHeight}
      crop={store.crops[source.id] ?? cropFromPixels(prepared.cropPx, prepared.sourceSize)}
      onAuto={() => {
        const next = buildPrep(source, {
          cropPaddingPct: store.cropPaddingPct,
          cleanLevels: store.cleanLevels,
        });
        return cropFromPixels(next.cropPx, next.sourceSize);
      }}
      onConfirm={(crop) => {
        store.setCrop(source.id, crop);
        store.putPrepared(
          buildPrep(source, {
            cropPaddingPct: store.cropPaddingPct,
            cleanLevels: store.cleanLevels,
            crop,
          }),
        );
      }}
    />
  );
}
