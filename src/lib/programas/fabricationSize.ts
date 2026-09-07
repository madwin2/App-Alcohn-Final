import type { PlanchuelaSize } from '@/lib/types/index';
import { resolvePlanchuelaRef } from './material';

/**
 * Tope máximo real de fabricación (mm) por planchuela — NO es un margen a restar siempre, es un
 * límite que la medida real puede no alcanzar sin problema. Valores confirmados a mano — ver
 * ANALISIS_MEDIDA_REAL_SELLOS.md sección 3. 63 queda afuera a propósito: no hay un tope
 * confirmado todavía. Planchuela 25: tope 24mm (25×25 → 24×24; 40×25 → proporcional ×24).
 */
export const KNOWN_MAX_FABRICATION_MM: Partial<Record<PlanchuelaSize, number>> = {
  12: 11.5,
  19: 18,
  25: 24,
  38: 36.5,
};

export interface FabricationSizeResolution {
  widthMm: number;
  heightMm: number;
  tipoPlanchuela: PlanchuelaSize | null;
  maxUsableMm: number | null;
  /** true = la medida natural superaba el tope de la planchuela y hubo que recortarla — hace
   *  falta que alguien lo confirme en el popup. false = ya entraba bien, se guarda directo. */
  needsReview: boolean;
}

/**
 * Resuelve la medida de fabricación: si la medida "natural" (la medida real del SVG si se pudo
 * medir, si no la medida pedida) ya entra dentro del tope de la planchuela que le corresponde por
 * la medida pedida, se acepta tal cual (needsReview: false). Si lo supera, se recorta el lado
 * menor al tope y se recalcula el lado mayor con la proporción real del SVG para no deformar el
 * diseño (needsReview: true, hay que confirmarlo a mano).
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

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { widthMm: requestedWidthMm, heightMm: requestedHeightMm, tipoPlanchuela, maxUsableMm, needsReview: false };
  }

  const naturalMinor = Math.min(naturalWidth, naturalHeight);

  // Sin tope conocido, o la medida natural ya entra (con un margen chico de tolerancia por
  // redondeo de la medición, no de negocio): se acepta tal cual, sin popup.
  if (maxUsableMm == null || naturalMinor <= maxUsableMm + 0.05) {
    return { widthMm: naturalWidth, heightMm: naturalHeight, tipoPlanchuela, maxUsableMm, needsReview: false };
  }

  // Supera el tope: recortar el eje menor al máximo y recalcular el mayor con la proporción real.
  const ratio = naturalWidth / naturalHeight;
  const widthIsMinor = naturalWidth <= naturalHeight;
  if (widthIsMinor) {
    const widthMm = maxUsableMm;
    return { widthMm, heightMm: widthMm / ratio, tipoPlanchuela, maxUsableMm, needsReview: true };
  }
  const heightMm = maxUsableMm;
  return { widthMm: heightMm * ratio, heightMm, tipoPlanchuela, maxUsableMm, needsReview: true };
}

/** Recalcula el eje libre a partir del que el usuario tocó a mano en el popup, respetando la
 *  proporción dada (width/height). Se usa solo cuando el popup está abierto. */
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
