import type { PlanchuelaSize } from '@/lib/types/index';
import { resolvePlanchuelaRef } from './material';

/**
 * Margen conocido (mm) que se recorta al eje que queda contra el ancho fijo de la planchuela.
 * Valores confirmados a mano — ver ANALISIS_MEDIDA_REAL_SELLOS.md sección 3.
 * 63 queda afuera a propósito: no hay un margen fijo confirmado, se decide caso a caso.
 * Planchuela 25: 1.0mm (25×25 → 24×24; 40×25 → proporcional con el menor en 24).
 */
export const KNOWN_FABRICATION_MARGIN_MM: Partial<Record<PlanchuelaSize, number>> = {
  12: 0.5,
  19: 2.0,
  25: 1.0,
  38: 3.5,
};

export interface FabricationSizeSuggestion {
  widthMm: number;
  heightMm: number;
  tipoPlanchuela: PlanchuelaSize | null;
  marginAppliedMm: number | null; // null = no hay margen conocido, se sugiere la medida pedida tal cual
}

/**
 * Sugiere ancho/largo de fabricación a partir de la medida pedida y, si se pudo medir el SVG, su
 * proporción real. El eje menor (el que queda contra el ancho fijo de la planchuela) se recorta
 * por el margen conocido; el otro eje se deriva de la proporción del SVG para no deformar el
 * diseño. Sin margen conocido para esa planchuela, se sugiere la medida pedida sin tocar.
 */
export function suggestFabricationSize(
  requestedWidthMm: number,
  requestedHeightMm: number,
  svgAspectRatio: number | null,
): FabricationSizeSuggestion {
  const tipoPlanchuela = resolvePlanchuelaRef({
    anchoRealCm: requestedWidthMm / 10,
    largoRealCm: requestedHeightMm / 10,
  });

  const margin = tipoPlanchuela != null ? KNOWN_FABRICATION_MARGIN_MM[tipoPlanchuela] ?? null : null;

  if (margin == null || requestedWidthMm <= 0 || requestedHeightMm <= 0) {
    return { widthMm: requestedWidthMm, heightMm: requestedHeightMm, tipoPlanchuela, marginAppliedMm: null };
  }

  const ratio = svgAspectRatio && svgAspectRatio > 0 ? svgAspectRatio : requestedWidthMm / requestedHeightMm;
  const widthIsMinor = requestedWidthMm <= requestedHeightMm;

  if (widthIsMinor) {
    const widthMm = Math.max(requestedWidthMm - margin, 1);
    return { widthMm, heightMm: widthMm / ratio, tipoPlanchuela, marginAppliedMm: margin };
  }
  const heightMm = Math.max(requestedHeightMm - margin, 1);
  return { widthMm: heightMm * ratio, heightMm, tipoPlanchuela, marginAppliedMm: margin };
}

/** Recalcula el eje libre a partir del que el usuario tocó, respetando la proporción dada (width/height). */
export function applyAspectRatioLock(
  changedAxis: 'width' | 'height',
  newValue: number,
  aspectRatio: number,
): { widthMm: number; heightMm: number } {
  if (!Number.isFinite(newValue) || newValue <= 0) {
    return changedAxis === 'width' ? { widthMm: newValue, heightMm: 0 } : { widthMm: 0, heightMm: newValue };
  }
  if (changedAxis === 'width') {
    return { widthMm: newValue, heightMm: aspectRatio > 0 ? newValue / aspectRatio : newValue };
  }
  return { widthMm: aspectRatio > 0 ? newValue * aspectRatio : newValue, heightMm: newValue };
}
