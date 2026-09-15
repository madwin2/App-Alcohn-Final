import { DEFAULT_PREP_OPTIONS, type PreparedImage, type SourceImage } from '@/lib/vectorizacion/types';
import { cropToPixels, type CropRect } from '@/lib/vectorizacion/cropGeometry';
import { prepareImage } from '@/lib/vectorizacion/prepareImage';

export function buildPrep(
  source: SourceImage,
  opts: { cropPaddingPct: number; cleanLevels: boolean; crop?: CropRect },
): PreparedImage {
  return prepareImage(source, {
    ...DEFAULT_PREP_OPTIONS,
    cropPaddingPct: opts.cropPaddingPct,
    cleanLevels: opts.cleanLevels,
    manualCrop: opts.crop ? cropToPixels(opts.crop, { w: source.naturalWidth, h: source.naturalHeight }) : undefined,
  });
}
