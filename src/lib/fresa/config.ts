/**
 * Perfil de la fresa más fina y criterio de "llega / no llega".
 *
 * Datos confirmados por el equipo (Q-CNC-008, 2026-10-14):
 * - Fresa cónica de punta 0,1 mm con 30° por lado (60° total).
 * - El mecanizado de detalle tiene profundidad final 0,6 mm.
 * - Alcanza con que llegue a 0,4 mm.
 * - Lo negro del vector es el relieve (positivo); lo blanco es lo que se saca.
 */
export interface FresaProfile {
  label: string;
  /** Diámetro de la punta (mm). */
  tipDiameterMm: number;
  /** Ángulo de cada flanco respecto del eje (grados). 30 = cónica de 60° total. */
  halfAngleDeg: number;
  /** Profundidad final del mecanizado de detalle (mm). */
  finalDepthMm: number;
  /** Profundidad mínima aceptable (mm). */
  minDepthMm: number;
}

export const FRESA_FINA: FresaProfile = {
  label: 'Fresa cónica 60° · punta 0,1 mm',
  tipDiameterMm: 0.1,
  halfAngleDeg: 30,
  finalDepthMm: 0.6,
  minDepthMm: 0.4,
};

/** Radio de la fresa, medido en la superficie, cuando la punta está a `depthMm`. */
export function cutRadiusAtDepth(p: FresaProfile, depthMm: number): number {
  return p.tipDiameterMm / 2 + depthMm * Math.tan((p.halfAngleDeg * Math.PI) / 180);
}

/** Profundidad a la que llega la punta en un hueco cuyo "radio libre" es `radiusMm`. */
export function depthForRadius(p: FresaProfile, radiusMm: number): number {
  const d = (radiusMm - p.tipDiameterMm / 2) / Math.tan((p.halfAngleDeg * Math.PI) / 180);
  return Math.max(0, d);
}

/** Ancho mínimo de un hueco blanco para que la fresa llegue a la profundidad mínima. */
export function minGapWidthMm(p: FresaProfile): number {
  return 2 * cutRadiusAtDepth(p, p.minDepthMm);
}

/**
 * Umbrales del análisis. Calibrados con vectores reales del 2026-10 (ver
 * `docs/02-modules/vectorizacion/chequeo-de-fresa.md`).
 */
export interface FresaAnalysisOptions {
  /** Tolerancia de aplanado de curvas (mm). */
  flattenTolMm: number;
  /**
   * Zonas más chicas que esto se ignoran (mm²). Filtra las esquinas: toda
   * esquina interior del blanco queda redondeada por la fresa, es inevitable
   * y no se corrige.
   */
  minZoneAreaMm2: number;
  /** Largo mínimo (área / ancho) para contar un paso angosto (mm). */
  minChannelLengthMm: number;
  /** Debajo de esta profundidad alcanzada el problema se marca como grave (mm). */
  severeDepthMm: number;
  /**
   * Un rincón dentro de una misma pieza con más superficie que esto (mm²) deja
   * de ser "rincón chico de serifa" y pasa a importar (ranuras de la E, la V de
   * la R, etc.).
   */
  notableCornerAreaMm2: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: FresaAnalysisOptions = {
  flattenTolMm: 0.004,
  minZoneAreaMm2: 0.03,
  minChannelLengthMm: 0.25,
  severeDepthMm: 0.2,
  notableCornerAreaMm2: 0.15,
};

/** Versión del algoritmo: cambia → se invalida la caché de resultados. */
export const FRESA_ANALYSIS_VERSION = 1;
