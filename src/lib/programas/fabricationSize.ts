import type { PlanchuelaSize } from '@/lib/types/index';
import { resolvePlanchuelaRef } from './material';

/**
 * Tope máximo real de fabricación (mm) por planchuela — NO es un margen a restar siempre, es un
 * límite que la medida real puede no alcanzar sin problema. 63 queda afuera a propósito.
 * Planchuela 25: tope 24mm.
 */
export const KNOWN_MAX_FABRICATION_MM: Partial<Record<PlanchuelaSize, number>> = {
  12: 11.5,
  19: 18,
  25: 24,
  38: 36.5,
};

/** Si el SVG se desvía ≥ este valor (mm) en cualquier eje respecto a lo pedido, hay que revisar. */
export const LARGE_SIZE_DIFF_MM = 6;

export type FabricationReviewReason = 'exceeds_tope' | 'large_diff';

export interface FabricationSizeResolution {
  widthMm: number;
  heightMm: number;
  tipoPlanchuela: PlanchuelaSize | null;
  maxUsableMm: number | null;
  /** true = hace falta confirmar en el popup. false = se guarda directo. */
  needsReview: boolean;
  reviewReason: FabricationReviewReason | null;
  measuredWidthMm: number | null;
  measuredHeightMm: number | null;
}

/** Sugiere la medida pedida; si el menor pedido supera el tope, lo recorta al tope manteniendo proporción. */
function suggestionFromRequested(
  requestedWidthMm: number,
  requestedHeightMm: number,
  maxUsableMm: number | null,
): { widthMm: number; heightMm: number } {
  let widthMm = requestedWidthMm;
  let heightMm = requestedHeightMm;
  if (maxUsableMm == null || widthMm <= 0 || heightMm <= 0) {
    return { widthMm, heightMm };
  }
  const requestedMinor = Math.min(widthMm, heightMm);
  if (requestedMinor <= maxUsableMm + 0.05) {
    return { widthMm, heightMm };
  }
  const ratio = widthMm / heightMm;
  if (widthMm <= heightMm) {
    widthMm = maxUsableMm;
    heightMm = widthMm / ratio;
  } else {
    heightMm = maxUsableMm;
    widthMm = heightMm * ratio;
  }
  return { widthMm, heightMm };
}

/**
 * Resuelve la medida de fabricación a partir de lo pedido y lo medido del SVG.
 * - Si el SVG ya entra en el tope y no se desvía ≥6mm de lo pedido → guarda lo medido, sin popup.
 * - Si supera el tope o hay diferencia grande → popup, sugerencia = medida pedida
 *   (recortada al tope solo si lo pedido también lo supera).
 */
export function resolveFabricationSize(
  requestedWidthMm: number,
  requestedHeightMm: number,
  measured: { widthMm: number; heightMm: number } | null,
): FabricationSizeResolution {
  const tipoPlanchuela = resolvePlanchuelaRef({
    anchoRealCm: requestedWidthMm / 10,
    largoRealCm: requestedHeightMm / 10,
  });
  const maxUsableMm = tipoPlanchuela != null ? KNOWN_MAX_FABRICATION_MM[tipoPlanchuela] ?? null : null;

  const naturalWidth = measured?.widthMm ?? requestedWidthMm;
  const naturalHeight = measured?.heightMm ?? requestedHeightMm;
  const measuredWidthMm = measured?.widthMm ?? null;
  const measuredHeightMm = measured?.heightMm ?? null;

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return {
      widthMm: requestedWidthMm,
      heightMm: requestedHeightMm,
      tipoPlanchuela,
      maxUsableMm,
      needsReview: false,
      reviewReason: null,
      measuredWidthMm,
      measuredHeightMm,
    };
  }

  const naturalMinor = Math.min(naturalWidth, naturalHeight);
  const exceedsTope = maxUsableMm != null && naturalMinor > maxUsableMm + 0.05;
  const largeDiff =
    measured != null &&
    (Math.abs(naturalWidth - requestedWidthMm) >= LARGE_SIZE_DIFF_MM ||
      Math.abs(naturalHeight - requestedHeightMm) >= LARGE_SIZE_DIFF_MM);

  if (!exceedsTope && !largeDiff) {
    return {
      widthMm: naturalWidth,
      heightMm: naturalHeight,
      tipoPlanchuela,
      maxUsableMm,
      needsReview: false,
      reviewReason: null,
      measuredWidthMm,
      measuredHeightMm,
    };
  }

  const suggested = suggestionFromRequested(requestedWidthMm, requestedHeightMm, maxUsableMm);
  return {
    widthMm: suggested.widthMm,
    heightMm: suggested.heightMm,
    tipoPlanchuela,
    maxUsableMm,
    needsReview: true,
    reviewReason: exceedsTope ? 'exceeds_tope' : 'large_diff',
    measuredWidthMm,
    measuredHeightMm,
  };
}

/** Recalcula el eje libre a partir del que el usuario tocó a mano en el popup. */
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
