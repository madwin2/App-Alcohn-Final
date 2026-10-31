/**
 * Perfil de la fresa más fina y criterio de "marca / no marca".
 *
 * Datos confirmados por el equipo (Q-CNC-008 y Q-VEC-011, 2026-10-14):
 * - Fresa real de punta 0,1 mm, configurada en Aspire como 0,2 mm para
 *   dejar juego favorable ante desgaste (Q-PROG-020). 30° por lado (60° total).
 * - El detalle se hace con V-carve en Aspire: donde el blanco se angosta, la
 *   fresa sube sola y pasa más arriba. No "deja de pasar": pierde profundidad.
 * - Profundidad final 0,6 mm. El equipo dio 0,3 mm como mínimo para que se
 *   separe; la placa de prueba sellada (2026-10-31) mostró que se separa desde
 *   un espacio de 0,45 mm (≈ 0,22 mm) y que un ojo necesita 0,7 mm: ver
 *   `markLimits`.
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
  /**
   * Límites de marca medidos sellando (placa de prueba, 2026-10-31; ver
   * `docs/02-modules/vectorizacion/limites-de-marca.md`). Si están, mandan sobre
   * `minDepthMm` para decidir la gravedad. Alimento no los tiene: no se sella
   * en cuero ni madera y sigue con su referencia de profundidad (POL-085).
   */
  markLimits?: MarkLimits;
}

/** Anchos (mm, en el sello) donde cambia cómo marca un espacio o un ojo. */
export interface MarkLimits {
  /** Espacio entre piezas: desde acá se separan (OK). */
  gapOkMm: number;
  /** Por debajo de esto se tocan siempre. Entre los dos: «se nota» (rayita). */
  gapGraveMm: number;
  /** Ojo (círculo más grande que entra en el hueco): desde acá se ve bien. */
  eyeOkMm: number;
  /** Por debajo de esto se tapa. Entre los dos: se ve chico («se nota»). */
  eyeGraveMm: number;
}

/**
 * Letras que se tocan (espacio por debajo de `gapGraveMm`): siguen siendo «se
 * nota» si el tramo pegado es a lo sumo esta parte de la altura de la letra más
 * baja y esa letra mide al menos `MARK_MIN_LETTER_HEIGHT_MM`. En la placa,
 * «Rabeg8» de 2,5 y 3,2 mm (12–22 %) se lee perfecto y «Rabe» de 2,0 (27–44 %)
 * se lee bien; por encima de ~50 % la palabra se pierde.
 */
export const MARK_CONTACT_MAX_RATIO = 0.5;
/**
 * Altura mínima de la pieza (≈ alto de minúscula) para que letras pegadas o con
 * ojos chicos se sigan leyendo. Por debajo es «letra demasiado chica»: en la
 * placa, Times de 1,3 mm de mayúscula (minúscula ≈ 0,9 mm) ya no se lee.
 */
export const MARK_MIN_LETTER_HEIGHT_MM = 1.0;
/**
 * Un hueco encerrado cuenta como «ojo» si es compacto: área ≤ esto × ancho².
 * Los de letras dan 0,8–2 (redondo 0,79, la g 1,95); un canal en anillo o una
 * letra calada da 8 o más, y se juzga como espacio.
 */
export const EYE_MAX_COMPACTNESS = 4;

/** Profundidad a la que baja una fresa en un hueco de `widthMm` (V-carve). */
function depthAtWidth(tipDiameterMm: number, halfAngleDeg: number, widthMm: number): number {
  return Math.max(0, (widthMm / 2 - tipDiameterMm / 2) / Math.tan((halfAngleDeg * Math.PI) / 180));
}

/**
 * Con repaso (fresa fina), sellado en cuero y madera: espacios se separan
 * desde 0,45 mm (0,35–0,45 dejan una rayita; 0,30 ya se pega), ojos se ven bien desde 0,70 mm
 * (0,45–0,70 quedan como un puntito).
 */
const MARK_FINA: MarkLimits = { gapOkMm: 0.45, gapGraveMm: 0.35, eyeOkMm: 0.7, eyeGraveMm: 0.45 };
/**
 * Solo la primera fresa: espacio separado a 0,8 mm (0,55 pegado), ojo bien a
 * 1,0 mm (0,8 puntito, 0,6 tapado; 0,95 por el redondeo del dibujo). Los cortes de grave (0,65 y 0,75) siguen el
 * corrimiento de ~0,35 mm medido; entre celdas no hay dato.
 */
const MARK_PRINCIPAL: MarkLimits = { gapOkMm: 0.8, gapGraveMm: 0.65, eyeOkMm: 0.95, eyeGraveMm: 0.75 };

export const FRESA_FINA: FresaProfile = {
  id: 'general',
  label: 'Fresa «0,1» · configurada 0,2 mm · 30° por lado',
  tipDiameterMm: 0.2,
  physicalTipDiameterMm: 0.1,
  halfAngleDeg: 30,
  finalDepthMm: 0.6,
  // Profundidad a la que se separa un espacio de 0,45 mm (≈ 0,22). Antes 0,3
  // (Q-VEC-011); la placa mostró que 0,45–0,55 ya se separa al sellar.
  minDepthMm: depthAtWidth(0.2, 30, MARK_FINA.gapOkMm),
  markLimits: MARK_FINA,
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
  markLimits: undefined,
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
    // Fuera de Alimento, los límites de marca medidos con la placa solo con la
    // primera fresa; la mínima es la profundidad de un espacio de 0,8 mm.
    minDepthMm: recipe === 'ALIMENTO' ? 1 : depthAtWidth(0.6, 15, MARK_PRINCIPAL.gapOkMm),
    markLimits: recipe === 'ALIMENTO' ? undefined : MARK_PRINCIPAL,
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
/** Paso entre profundidades al buscar la ganancia (mm). 0,10 elige las mismas piezas que 0,05 en Magui Lucero a la mitad de costo. */
export const REPASO_DEPTH_STEP_MM = 0.1;
/**
 * Una zona de repaso cuenta solo si es al menos esta parte del tamaño de la
 * letra (pieza) que toca: el mismo rincón de 0,5 mm pesa en una letra de 3 mm
 * y no se nota en un número de 21 mm. Calibrado con el programa «15 OCT x15 C»
 * (2026-10-18): 4708 queda en 2–3,4 % (sin repaso), Matungo 8–12 %, Alcornoque
 * hasta 29 %, letras chicas por encima del 35 %.
 */
export const REPASO_MIN_RELATIVE = 0.08;

// Los límites de marca (2026-10-31) cambian la gravedad de los avisos pero no
// la selección del repaso: la versión queda en 6, porque el gadget y los
// programas guardados la usan para saber si `fine.pieces` sigue vigente.
export const FRESA_ANALYSIS_VERSION = 6;
