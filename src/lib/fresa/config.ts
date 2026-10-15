/**
 * Perfil de la fresa más fina y criterio de "marca / no marca".
 *
 * Datos confirmados por el equipo (Q-CNC-008 y Q-VEC-011, 2026-10-14):
 * - Fresa cónica de punta 0,1 mm con 30° por lado (60° total).
 * - El detalle se hace con V-carve en Aspire: donde el blanco se angosta, la
 *   fresa sube sola y pasa más arriba. No "deja de pasar": pierde profundidad.
 * - Profundidad final 0,6 mm. Lo mínimo mínimo para que se separe bien: 0,3 mm.
 * - Sellos de alimento: necesitan más, 1 mm.
 * - Lo negro del vector es el relieve (positivo); lo blanco es lo que se saca.
 */
export interface FresaProfile {
  id: 'general' | 'alimento';
  label: string;
  /** Diámetro de la punta (mm). */
  tipDiameterMm: number;
  /** Ángulo de cada flanco respecto del eje (grados). 30 = cónica de 60° total. */
  halfAngleDeg: number;
  /** Profundidad final del mecanizado de detalle (mm). */
  finalDepthMm: number;
  /**
   * Profundidad mínima donde el diseño tiene que separarse sí o sí (entre
   * letras distintas y en los ojos de las letras). En rincones y ángulos alcanza
   * con que la punta marque.
   */
  minDepthMm: number;
}

export const FRESA_FINA: FresaProfile = {
  id: 'general',
  label: 'Fresa cónica 60° · punta 0,1 mm',
  tipDiameterMm: 0.1,
  halfAngleDeg: 30,
  finalDepthMm: 0.6,
  minDepthMm: 0.3,
};

/**
 * Sellos de alimento: misma fresa, pero lo mínimo es 1 mm (equipo, 2026-10-14).
 * ❓ La profundidad final del V-carve en alimento no está confirmada (Q-VEC-011);
 * no se usa en el cálculo.
 */
export const FRESA_ALIMENTO: FresaProfile = {
  ...FRESA_FINA,
  id: 'alimento',
  label: 'Alimento · fresa cónica 60° · punta 0,1 mm',
  finalDepthMm: 1,
  minDepthMm: 1,
};

export function fresaProfile(alimento?: boolean): FresaProfile {
  return alimento ? FRESA_ALIMENTO : FRESA_FINA;
}

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
  /**
   * Rincones y ángulos: con que la punta marque alcanza. Solo se avisan si la
   * fresa casi no entra (menos que esta profundidad) en una superficie mayor a
   * `notableCornerAreaMm2`: ahí el detalle directamente se pierde.
   */
  lostDetailDepthMm: number;
  notableCornerAreaMm2: number;
}

export const DEFAULT_ANALYSIS_OPTIONS: FresaAnalysisOptions = {
  flattenTolMm: 0.004,
  minZoneAreaMm2: 0.03,
  minChannelLengthMm: 0.25,
  lostDetailDepthMm: 0.05,
  notableCornerAreaMm2: 0.15,
};

/**
 * Grosor mínimo de un trazo negro (relieve) para que no se rompa ni deje de
 * marcar (confirmado por el equipo, 2026-10-14). La corrección nunca deja un
 * trazo más fino que esto; si el diseño ya lo tiene más fino, no lo afina más.
 */
export const MIN_BLACK_WIDTH_MM = 0.4;

/** Versión del algoritmo: cambia → se invalida la caché de resultados. */
export const FRESA_ANALYSIS_VERSION = 3;
