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

export type FabricationReviewReason = 'exceeds_tope' | 'large_diff' | 'tope_long_side_diff';

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

/**
 * Escala el rectángulo (sin deformar) para que su lado MENOR quede exactamente en el tope.
 * Puede agrandar o achicar. Se usa cuando lo pedido ya supera el tope de la planchuela.
 */
export function scaleMinorSideToTope(
  widthMm: number,
  heightMm: number,
  maxUsableMm: number | null,
): { widthMm: number; heightMm: number } {
  const minor = Math.min(widthMm, heightMm);
  if (maxUsableMm == null || !(minor > 0)) return { widthMm, heightMm };
  const k = maxUsableMm / minor;
  return { widthMm: widthMm * k, heightMm: heightMm * k };
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
 * - Pedido "al tope" (lado menor pedido > tope, ej. 40×40 → 36.5): el lado chico del vector
 *   va al tope y el otro por proporción; se guarda sin popup salvo que el lado largo se
 *   desvíe ≥6mm de lo pedido (decisión 2026-10-01).
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

  // Pedido "al tope" (ej. 40×40 en planchuela 38): el lado chico del vector va al tope y el
  // otro sale por proporción. Solo se pide revisión si el lado largo se desvía ≥6mm de lo pedido.
  const requestedMinor = Math.min(requestedWidthMm, requestedHeightMm);
  const requestedExceedsTope = maxUsableMm != null && requestedMinor > maxUsableMm + 0.05;
  if (requestedExceedsTope && measured != null) {
    const target = scaleMinorSideToTope(naturalWidth, naturalHeight, maxUsableMm);
    const requestedMajor = Math.max(requestedWidthMm, requestedHeightMm);
    const targetMajor = Math.max(target.widthMm, target.heightMm);
    const longSideOff = Math.abs(targetMajor - requestedMajor) >= LARGE_SIZE_DIFF_MM;
    return {
      widthMm: target.widthMm,
      heightMm: target.heightMm,
      tipoPlanchuela,
      maxUsableMm,
      needsReview: longSideOff,
      reviewReason: longSideOff ? 'tope_long_side_diff' : null,
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
