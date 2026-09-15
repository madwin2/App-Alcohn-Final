import { Button } from '@/components/ui/button';
import type { PreparedImage } from '@/lib/vectorizacion/types';
import { Scissors, X } from 'lucide-react';
import { CardImageContextMenu } from '../shared/CardImageContextMenu';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { bitmapToDataUrl } from '@/lib/vectorizacion/bitmapPreview';

interface Props {
  image: PreparedImage;
  onCrop: () => void;
  onRemove: () => void;
}

export function LoteImageCard({ image, onCrop, onRemove }: Props) {
  const source = useVectorizacionStore((s) => s.sources[image.id]);
  const originalUrl = source ? bitmapToDataUrl(source) : image.previewDataUrl;

  return (
    <CardImageContextMenu imageUrl={originalUrl} fileName={image.name} onCrop={onCrop} localOnly>
      <div className="relative overflow-hidden rounded-lg border bg-card">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1 z-10 h-7 w-7"
          onClick={onRemove}
          aria-label="Quitar"
        >
          <X className="size-4" />
        </Button>
        <div className="flex aspect-square items-center justify-center bg-white p-2">
          <img
            src={image.previewDataUrl}
            alt={image.name}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <div className="flex items-center justify-between gap-2 p-2">
          <p className="truncate text-xs">{image.name}</p>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-emerald-600" onClick={onCrop}>
            <Scissors className="size-3" />
            {image.width}×{image.height}
          </button>
        </div>
        {image.empty ? <p className="px-2 pb-2 text-xs text-destructive">Sin contenido</p> : null}
      </div>
    </CardImageContextMenu>
  );
}
