/**
 * Perfil de la fresa más fina y criterio de "marca / no marca".
 *
 * Datos confirmados por el equipo (Q-CNC-008 y Q-VEC-011, 2026-10-14):
 * - Fresa real de punta 0,1 mm, configurada en Aspire como 0,2 mm para
 *   dejar juego favorable ante desgaste (Q-PROG-020). 30° por lado (60° total).
 * - El detalle se hace con V-carve en Aspire: donde el blanco se angosta, la
 *   fresa sube sola y pasa más arriba. No "deja de pasar": pierde profundidad.
 * - Profundidad final 0,6 mm. Lo mínimo mínimo para que se separe bien: 0,3 mm.
 * - Alimento: principal de 1 mm como referencia; repaso entre 0,4 y 0,5 mm,
 *   con tope 0,6 mm (Q-PROG-018 / Q-VEC-011, 2026-10-15).
 * - Lo negro del vector es el relieve (positivo); lo blanco es lo que se saca.
 */
export interface FresaProfile {
  id: 'general' | 'alimento' | 'principal';
  label: string;
  /** Diámetro de la punta configurado en CAM (mm), usado por el análisis. */
  tipDiameterMm: number;
  /** Punta física cuando difiere de la configuración deliberada de CAM. */
  physicalTipDiameterMm?: number;
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
  label: 'Fresa «0,1» · configurada 0,2 mm · 30° por lado',
  tipDiameterMm: 0.2,
  physicalTipDiameterMm: 0.1,
  halfAngleDeg: 30,
  finalDepthMm: 0.6,
  minDepthMm: 0.3,
};

/**
 * Referencia inferior del rango 0,4–0,5 mm confirmado para el repaso de
 * Alimento (POL-085). La comparación informa también el extremo de 0,5 mm;
 * estos valores no certifican trayectorias ni introducen bloqueos.
 */
export const FRESA_ALIMENTO: FresaProfile = {
  ...FRESA_FINA,
  id: 'alimento',
  label: 'Alimento · fresa «0,1» · configurada 0,2 mm',
  finalDepthMm: 0.6,
  minDepthMm: 0.4,
};

export type MachiningRecipe = 'CLASICO' | '3MM' | 'ALIMENTO';

export function machiningRecipe(tipo?: string | null, alimento = false): MachiningRecipe | null {
  if (alimento) return 'ALIMENTO';
  const normalized = (tipo ?? '').toUpperCase();
  return normalized === 'CLASICO' || normalized === '3MM' || normalized === 'ALIMENTO' ? normalized : null;
}

/** POL-083/084: usar la geometría configurada, no el nombre «0,5». */
export function primaryProfile(recipe: MachiningRecipe): FresaProfile {
  return {
    id: 'principal',
    label: 'Primera fresa «0,5» · configurada 0,6 mm · 15° por lado',
    tipDiameterMm: 0.6,
    halfAngleDeg: 15,
    finalDepthMm: recipe === 'CLASICO' ? 1.7 : 3,
    // Fuera de Alimento se compara contra la referencia general ya existente
    // de separación (0,3); no es un nuevo mínimo aprobado para la principal.
    minDepthMm: recipe === 'ALIMENTO' ? 1 : FRESA_FINA.minDepthMm,
  };
}

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

/**
 * Cuánto se puede agrandar el sello como último recurso, si es imprescindible
 * para que se separen letras u ojos (dueño, 2026-10-15: "se puede escalar un
 * poquito"). Lo confirma quien revisa; nunca pasa el tope de la planchuela.
 * PROVISORIO: 6 %.
 */
export const MAX_SCALE_UP = 1.06;

/** Versión del algoritmo: cambia → se invalida la caché de resultados. */
/**
 * Repaso fino: se selecciona donde la fresa de 0,2 talla al menos esto más
 * hondo que la primera (0,6), hasta la profundidad final del repaso (0,6 mm).
 * Mide la diferencia real entre herramientas: un vértice abierto o un borde
 * recto dan poca ganancia y no entran; una ranura o un ángulo cerrado, sí.
 * Probado con Magui Lucero: 0,10 y 0,15 eligen las mismas piezas (2026-10-17).
 */
export const REPASO_MIN_GAIN_MM = 0.1;
/** Paso entre profundidades al buscar la ganancia (mm). */
export const REPASO_DEPTH_STEP_MM = 0.05;

export const FRESA_ANALYSIS_VERSION = 6;
