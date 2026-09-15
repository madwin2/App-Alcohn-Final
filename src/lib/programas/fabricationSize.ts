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

/** Escala un rectángulo para que el lado menor no pase el tope, sin deformar. */
export function clampToTopePreservingAspect(
  widthMm: number,
  heightMm: number,
  maxUsableMm: number | null,
): { widthMm: number; heightMm: number } {
  let w = widthMm;
  let h = heightMm;
  if (maxUsableMm == null || w <= 0 || h <= 0) return { widthMm: w, heightMm: h };
  if (Math.min(w, h) <= maxUsableMm + 0.05) return { widthMm: w, heightMm: h };
  const ratio = w / h;
  if (w <= h) {
    w = maxUsableMm;
    h = w / ratio;
  } else {
    h = maxUsableMm;
    w = h * ratio;
  }
  return { widthMm: w, heightMm: h };
}

/** Encaja la proporción `aspect` (ancho/alto) dentro de una caja, sin deformar. */
export function fitAspectInBox(
  aspectRatio: number,
  boxWidthMm: number,
  boxHeightMm: number,
): { widthMm: number; heightMm: number } {
  if (!(aspectRatio > 0) || boxWidthMm <= 0 || boxHeightMm <= 0) {
    return { widthMm: boxWidthMm, heightMm: boxHeightMm };
  }
  let widthMm = boxWidthMm;
  let heightMm = boxWidthMm / aspectRatio;
  if (heightMm > boxHeightMm) {
    heightMm = boxHeightMm;
    widthMm = heightMm * aspectRatio;
  }
  return { widthMm, heightMm };
}

/**
 * Resuelve la medida de fabricación a partir de lo pedido y lo medido del SVG.
 * - Si el SVG ya entra en el tope y no se desvía ≥6mm de lo pedido → guarda lo medido, sin popup.
 * - Si supera el tope o hay diferencia grande → popup; la sugerencia conserva la proporción del
 *   vector (lo medido, recortado al tope si hace falta). Nunca deforma al forzar lo pedido.
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

  const suggested = clampToTopePreservingAspect(naturalWidth, naturalHeight, maxUsableMm);
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
