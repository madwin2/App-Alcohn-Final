import { generateFilePath, uploadFile } from '@/lib/supabase/services/storage.service';
import { measureSvgString } from '@/lib/utils/svgBoundingBox';
import { resolveFabricationSize, type FabricationSizeResolution } from '@/lib/programas/fabricationSize';
import { slugify } from './helpers';
import { applyPhysicalSize, declaredSizeMm, parseViewBoxAspect } from './svgSize';
import { setSelloVectorState } from './vectorizacion.service';
import type { VectorizeMode } from './vectorizerPreset';

export interface SavedVector {
  url: string;
  fileName: string;
  resolution: FabricationSizeResolution;
  svgAspectRatio: number | null;
  needsReview: boolean;
}

export async function saveSelloVector(params: {
  selloId: string;
  orderId: string;
  designName: string;
  svgText: string;
  requestedWidthMm: number;
  requestedHeightMm: number;
  mode: VectorizeMode;
  /**
   * Medida de fabricación decidida a mano (por ejemplo, al agrandar el sello
   * desde el chequeo de fresa). Si viene, se guarda tal cual y no hay popup.
   */
  fabricationOverrideMm?: { widthMm: number; heightMm: number };
}): Promise<SavedVector> {
  if (params.mode !== 'production') {
    throw new Error('No se puede guardar un vector generado en modo test/preview.');
  }

  const override = params.fabricationOverrideMm;
  // Con medida elegida a mano, el archivo queda a esa medida (si no, a lo pedido).
  const sized = override
    ? applyPhysicalSize(params.svgText, override.widthMm, override.heightMm)
    : applyPhysicalSize(params.svgText, params.requestedWidthMm, params.requestedHeightMm);
  const fileName = `${slugify(params.designName || 'vector')}.svg`;
  const path = generateFilePath(params.orderId, 'vector', fileName, params.selloId);
  const file = new File([sized], fileName, { type: 'image/svg+xml' });
  const url = await uploadFile('vector', file, path);

  // El lienzo ya quedó ajustado al dibujo: su medida es la del dibujo. Medir
  // el bbox en el navegador queda de respaldo (SVG que no se pudo leer).
  const declared = declaredSizeMm(sized);
  const fallback = declared ? null : measureSvgString(sized);
  const measurement = declared
    ? { ...declared, aspectRatio: declared.widthMm / declared.heightMm }
    : fallback;
  const measured = resolveFabricationSize(
    params.requestedWidthMm,
    params.requestedHeightMm,
    measurement ? { widthMm: measurement.widthMm, heightMm: measurement.heightMm } : null,
  );
  const resolution = override
    ? { ...measured, widthMm: override.widthMm, heightMm: override.heightMm, needsReview: false, reviewReason: null }
    : measured;

  await setSelloVectorState(params.selloId, 'VECTORIZADO', {
    vectorUrl: url,
    error: null,
    widthMm: resolution.needsReview ? null : resolution.widthMm,
    heightMm: resolution.needsReview ? null : resolution.heightMm,
  });

  return {
    url,
    fileName,
    resolution,
    svgAspectRatio: measurement?.aspectRatio ?? parseViewBoxAspect(sized),
    needsReview: resolution.needsReview,
  };
}

export async function saveFabricationSize(
  selloId: string,
  widthMm: number,
  heightMm: number,
): Promise<void> {
  await setSelloVectorState(selloId, 'VECTORIZADO', { widthMm, heightMm });
}
