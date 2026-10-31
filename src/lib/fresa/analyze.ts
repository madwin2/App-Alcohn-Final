/**
 * Motor del chequeo de fresa: simula el V-carve de Aspire y avisa solo donde
 * se pierde el diseño.
 *
 * Modelo (lo negro es relieve, lo blanco se saca):
 * - Con la punta a profundidad d, la fresa ocupa en la superficie un disco de
 *   radio r(d) = punta/2 + d·tan(flanco).
 * - En V-carve la fresa nunca deja de pasar: donde el blanco se angosta, sube.
 *   Cada punto blanco se talla a la profundidad del disco más grande que entra
 *   en el blanco y lo cubre (la "apertura" morfológica con radio r(d)). Eso da
 *   un mapa de profundidad (`depthBands`).
 * - Lo que queda afuera de la apertura con la profundidad mínima se talla
 *   menos hondo. Si eso importa depende de dónde está:
 *   - paso angosto: une dos piezas negras distintas (dos letras). En el sello
 *     se pegan → grave. Que el canal sea poco profundo en otro lado no importa:
 *     se avisa solo el "puente", el tramo donde el canal se corta.
 *   - hueco cerrado: un ojo de letra que entero queda poco profundo → grave.
 *   - rincón o ángulo dentro de una misma pieza: la punta lo marca igual → está
 *     bien, salvo que la fresa casi no entre en una superficie notable.
 *
 * Con límites de marca (`profile.markLimits`, medidos sellando la placa de
 * prueba) la gravedad sale de cómo marca, no solo de la profundidad:
 *   - espacio entre piezas: por el espacio más angosto. Desde `gapOkMm` no se
 *     avisa; entre `gapGraveMm` y `gapOkMm` «se nota» (media); más angosto,
 *     grave, salvo que se toquen en un tramo corto de una letra de buen tamaño
 *     (se lee igual: media).
 *   - ojo (hueco encerrado compacto): por el círculo más grande que entra.
 *     Desde `eyeOkMm` no se avisa; entre `eyeGraveMm` y `eyeOkMm` media; más
 *     chico, grave.
 *
 * Las esquinas (toda esquina interior del blanco queda redondeada por una
 * fresa cónica: es normal) no se informan.
 *
 * Funciones puras (sin DOM): se pueden correr en un Web Worker.
 */
import { FillRule, EndType, JoinType, inflatePaths } from 'clipper2-ts';
import {
  DEFAULT_ANALYSIS_OPTIONS,
  EYE_MAX_COMPACTNESS,
  FRESA_FINA,
  MARK_CONTACT_MAX_RATIO,
  MARK_MIN_LETTER_HEIGHT_MM,
  cutRadiusAtDepth,
  depthForRadius,
  minGapWidthMm,
  type FresaAnalysisOptions,
  type FresaProfile,
  type MarkLimits,
} from './config';
import {
  UM,
  bounds,
  boundsOverlap,
  clipToBounds,
  components,
  difference,
  interiorPoint,
  intersect,
  offset,
  opening,
  pointInRegion,
  rect,
  regionArea,
  toPath64,
  union,
  type Bounds,
  type Component,
  type Paths64,
} from './geometry';
import type { Pt } from './pathData';
import type { Paint } from './svgShapes';

/** Figura pintada, serializable (sin referencias al DOM). */
export interface PaintShape {
  rings: Pt[][];
  openFlags: boolean[];
  fill: Paint;
  fillRule: 'nonzero' | 'evenodd';
  stroke: Paint;
  strokeWidth: number;
}

/**
 * - hueco_cerrado: un blanco encerrado (el ojo de una "e") que entero queda poco profundo.
 * - paso_angosto: un puente poco profundo entre dos piezas negras distintas (letras
 *   que se pegan).
 * - rincon: un rincón o ranura angosta dentro de una misma pieza (unión de serifas,
 *   vértices agudos). La punta lo marca; solo importa si la fresa casi no entra.
 * - angulo: un blanco sin salida que se angosta hasta una punta (el interior de
 *   la M, la V, la unión de la A). La punta de la fresa igual le hace una pasada
 *   poco profunda y queda marcado: está bien así y no se corrige.
 */
export type ZoneKind = 'hueco_cerrado' | 'paso_angosto' | 'rincon' | 'angulo';
export type ZoneSeverity = 'alta' | 'media' | 'baja';

export interface FresaZone {
  id: string;
  kind: ZoneKind;
  severity: ZoneSeverity;
  /** Área que queda menos honda que la profundidad mínima (mm²). */
  areaMm2: number;
  /** Caja de la zona (mm, mismas coordenadas que el SVG × mm por unidad). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Punto para el marcador (mm). */
  center: { x: number; y: number };
  /** Ancho aproximado del hueco en su parte más ancha dentro de la zona (mm). */
  gapWidthMm: number;
  /** Profundidad aproximada a la que llega la fresa ahí (mm). */
  reachDepthMm: number;
  /** Contorno de la zona (mm) para dibujarla. */
  rings: Pt[][];
  /**
   * Con límites de marca: espacio más angosto entre las dos piezas (paso
   * angosto) o ancho del ojo (hueco cerrado), en mm. Es lo que decide la gravedad.
   */
  markWidthMm?: number;
  /** Altura de la pieza más baja que toca la zona (mm), para «letra chica». */
  pieceHeightMm?: number;
}

/** Franja del mapa de profundidad: lo que se talla entre `fromMm` y `toMm` (mm). */
export interface DepthBand {
  fromMm: number;
  toMm: number;
  rings: Pt[][];
}

export interface FresaCoreResult {
  zones: FresaZone[];
  /**
   * Mapa de profundidad del blanco que no llega a la mínima (de menos a más
   * hondo; la primera franja, `toMm` 0, es lo que la fresa no saca). Solo se
   * calcula si se pide.
   */
  depthBands?: DepthBand[];
  /** Zonas descartadas por ser esquinas normales (demasiado chicas para importar). */
  ignoredCorners: number;
  /** Medida del diseño analizado (mm). */
  designWidthMm: number;
  designHeightMm: number;
  /** Ancho mínimo de hueco exigido (mm). */
  minGapMm: number;
  /** Superficie blanca total que no llega (mm², solo zonas informadas). */
  totalProblemAreaMm2: number;
}

/** Une las figuras en la región negra (relieve), respetando el orden de pintura. */
export function buildBlackRegion(shapes: PaintShape[], mmPerUnit: number): Paths64 {
  let black: Paths64 = [];
  let pendingDark: Paths64 = [];
  const flushDark = () => {
    if (pendingDark.length) {
      black = union(black, pendingDark);
      pendingDark = [];
    }
  };
  for (const s of shapes) {
    const closed = s.rings.map((r) => toPath64(r, mmPerUnit)).filter((p) => p.length >= 3);
    if (s.fill !== 'none' && closed.length) {
      const region = union(closed, null, s.fillRule === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero);
      if (s.fill === 'dark') pendingDark.push(...region);
      else {
        flushDark();
        black = difference(black, region);
      }
    }
    if (s.stroke !== 'none' && s.strokeWidth > 0) {
      const half = (s.strokeWidth * mmPerUnit * UM) / 2;
      const strokes: Paths64 = [];
      s.rings.forEach((r, k) => {
        const p = toPath64(r, mmPerUnit);
        if (p.length < 2) return;
        strokes.push(
          ...inflatePaths([p], half, JoinType.Miter, s.openFlags[k] ? EndType.Butt : EndType.Joined, 4, 2),
        );
      });
      if (strokes.length) {
        const region = union(strokes);
        if (s.stroke === 'dark') pendingDark.push(...region);
        else {
          flushDark();
          black = difference(black, region);
        }
      }
    }
  }
  flushDark();
  return union(black);
}

const toMmRings = (paths: Paths64): Pt[][] =>
  paths.map((p) => p.map((q) => ({ x: q.x / UM, y: q.y / UM })));

const boundsMm = (b: Bounds) => ({ minX: b.minX / UM, minY: b.minY / UM, maxX: b.maxX / UM, maxY: b.maxY / UM });

/** Niveles de profundidad (mm), por debajo de la mínima, para estimar a qué profundidad llega la fresa en cada zona. */
function depthLevels(profile: FresaProfile): number[] {
  const step = profile.minDepthMm > 0.5 ? 0.1 : 0.05;
  const out: number[] = [];
  for (let d = step; d < profile.minDepthMm - 1e-6; d += step) out.push(Math.round(d * 100) / 100);
  return out;
}

/** Por dónde la zona se abre a blanco que la fresa sí alcanza (sus "bocas"). */
function zoneMouths(comp: Component, reached: Paths64): Paths64[] {
  const ring = offset(comp.paths, 12);
  const contact = intersect(clipToBounds(reached, comp.bounds, 40), ring);
  return components(contact)
    .filter((c) => c.areaUm2 >= 400)
    .map((c) => c.paths);
}

/**
 * ¿La zona se angosta hasta una punta lejos de su boca? Se compara el grosor
 * de la mitad más alejada con el de toda la zona: en un ángulo cae a menos de
 * la mitad; en una ranura de paredes paralelas se mantiene.
 */
function isTapered(comp: Component, mouth: Paths64, thicknessUm: number): boolean {
  let lo = 0;
  let hi = Math.hypot(comp.bounds.maxX - comp.bounds.minX, comp.bounds.maxY - comp.bounds.minY) + 20;
  for (let k = 0; k < 10 && hi - lo > 8; k++) {
    const m = (lo + hi) / 2;
    if (regionArea(difference(comp.paths, offset(mouth, m))) < 100) hi = m;
    else lo = m;
  }
  const far = difference(comp.paths, offset(mouth, hi * 0.5));
  if (regionArea(far) < 100) return true;
  let farThickness = 0;
  for (const c of components(far)) farThickness = Math.max(farThickness, interiorPoint(c).radiusUm);
  return farThickness < 0.6 * thicknessUm;
}

/**
 * Espacio más angosto entre dos piezas cerca de una zona y largo del tramo
 * donde quedan a menos de `graveUm` (µm). Se trabaja recortado a `win`.
 */
function pairContact(a: Paths64, b: Paths64, win: Bounds, okUm: number, graveUm: number): { gapUm: number; contactUm: number } {
  const A = clipToBounds(a, win, 0);
  const B = clipToBounds(b, win, 0);
  const touch = (h: number) => intersect(offset(A, h), offset(B, h)).length > 0;
  let lo = 0;
  let hi = Math.round(okUm / 2) + 20;
  if (!touch(hi)) return { gapUm: 2 * hi, contactUm: 0 };
  for (let k = 0; k < 12 && hi - lo > 1; k++) {
    const m = (lo + hi) / 2;
    if (touch(m)) hi = m;
    else lo = m;
  }
  const lens = bounds(intersect(offset(A, graveUm / 2), offset(B, graveUm / 2)));
  const contactUm = lens ? Math.max(lens.maxX - lens.minX, lens.maxY - lens.minY) : 0;
  return { gapUm: 2 * hi, contactUm };
}

const heightMm = (c: Component) => (c.bounds.maxY - c.bounds.minY) / UM;

/** Gravedad de un espacio entre dos piezas según cómo marca al sellar (null = no se avisa). */
function gapSeverity(ml: MarkLimits, gapMm: number, contactMm: number, pieceHeight: number): ZoneSeverity | null {
  if (gapMm >= ml.gapOkMm) return null;
  if (gapMm >= ml.gapGraveMm) return 'media';
  const shortContact = contactMm <= MARK_CONTACT_MAX_RATIO * pieceHeight;
  return shortContact && pieceHeight >= MARK_MIN_LETTER_HEIGHT_MM ? 'media' : 'alta';
}

export function analyzeBlackRegion(
  black: Paths64,
  profile: FresaProfile = FRESA_FINA,
  options: FresaAnalysisOptions = DEFAULT_ANALYSIS_OPTIONS,
  withDepthMap = false,
): FresaCoreResult {
  const minGapMm = minGapWidthMm(profile);
  const b = bounds(black);
  if (!b) {
    return {
      zones: [],
      ignoredCorners: 0,
      designWidthMm: 0,
      designHeightMm: 0,
      minGapMm,
      totalProblemAreaMm2: 0,
    };
  }
  const R = Math.round(cutRadiusAtDepth(profile, profile.minDepthMm) * UM);
  // Dominio: el diseño con un margen holgado. El blanco de afuera del diseño es
  // amplio (lo desbasta la fresa grande), así que nunca genera falsos avisos.
  const margin = 2 * R + UM;
  const domain = rect({ minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin });
  const white = difference([domain], black);

  const reached = opening(white, R);
  // Lo que no alcanza. El "opening" chiquito final borra astillas numéricas del
  // offset (bordes de 1–2 µm que no significan nada).
  const missRaw = difference(white, reached);
  const miss = opening(missRaw, 4);
  const missComps = components(miss);

  // Blancos encerrados (para detectar "hueco cerrado"): componentes del blanco
  // que no tocan el borde del dominio.
  const dMinX = b.minX - margin + 2;
  const dMinY = b.minY - margin + 2;
  const dMaxX = b.maxX + margin - 2;
  const dMaxY = b.maxY + margin - 2;
  const whiteComps = components(white).filter(
    (c) => c.bounds.minX > dMinX && c.bounds.minY > dMinY && c.bounds.maxX < dMaxX && c.bounds.maxY < dMaxY,
  );

  // Piezas negras: un paso angosto separa dos piezas distintas; un rincón queda
  // dentro de una sola.
  const blackComps = components(black);
  const ml = profile.markLimits;
  const minArea = options.minZoneAreaMm2 * UM * UM;

  // Ojos (con límites de marca): huecos encerrados compactos, juzgados por el
  // círculo más grande que entra. Los no compactos (un anillo, una letra
  // calada) siguen como espacio, por la profundidad mínima.
  const eyeHoles = new Set<Component>();
  const eyeZones: Array<{ wc: Component; diamMm: number; center: { x: number; y: number } }> = [];
  if (ml) {
    for (const wc of whiteComps) {
      const minSide = Math.min(wc.bounds.maxX - wc.bounds.minX, wc.bounds.maxY - wc.bounds.minY) / UM;
      if (minSide >= 1.3 * ml.eyeOkMm) continue;
      const ip = interiorPoint(wc);
      const diamUm = 2 * ip.radiusUm;
      if (wc.areaUm2 > EYE_MAX_COMPACTNESS * diamUm * diamUm) continue;
      eyeHoles.add(wc);
      if (diamUm / UM < ml.eyeOkMm && wc.areaUm2 >= minArea) {
        eyeZones.push({ wc, diamMm: diamUm / UM, center: { x: ip.x, y: ip.y } });
      }
    }
  }
  /** Altura de la pieza más chica que encierra un hueco (la letra de ese ojo). */
  const ownerHeight = (wc: Component): number | undefined => {
    let best: Component | null = null;
    for (const bc of blackComps) {
      const bb = bc.bounds;
      if (bb.minX > wc.bounds.minX || bb.minY > wc.bounds.minY || bb.maxX < wc.bounds.maxX || bb.maxY < wc.bounds.maxY) continue;
      if (!best || bc.areaUm2 < best.areaUm2) best = bc;
    }
    return best ? heightMm(best) : undefined;
  };

  /** Piezas negras distintas que toca una zona (hasta 2). */
  const touchingPieces = (comp: Component): Component[] => {
    const probe = offset(comp.paths, 8);
    const probeBounds = bounds(probe) ?? comp.bounds;
    const out: Component[] = [];
    for (const bc of blackComps) {
      if (!boundsOverlap(bc.bounds, probeBounds)) continue;
      if (intersect(clipToBounds(bc.paths, probeBounds), probe).length) {
        out.push(bc);
        if (out.length >= 2) break;
      }
    }
    return out;
  };

  const candidates: Array<{
    comp: Component;
    thicknessUm: number;
    center: { x: number; y: number };
    /** Piezas que toca, si ya se calcularon. */
    touching?: Component[];
    mark?: { gapMm: number; contactMm: number; pieceHeight: number };
  }> = [];
  let ignoredCorners = 0;
  for (const comp of missComps) {
    // Las esquinas del dominio (afuera del diseño) no son parte del sello.
    if (!boundsOverlap(comp.bounds, b)) continue;
    let touching: Component[] | undefined;
    if (comp.areaUm2 < minArea) {
      // Con límites de marca, un puente chico entre dos piezas (el pie de la R
      // contra la a) no es una esquina: ahí se tocan.
      touching = ml ? touchingPieces(comp) : undefined;
      if (!touching || touching.length < 2) {
        ignoredCorners++;
        continue;
      }
    }
    const ip = interiorPoint(comp);
    candidates.push({ comp, thicknessUm: Math.max(ip.radiusUm, 1), center: { x: ip.x, y: ip.y }, touching });
  }

  // Erosiones del blanco a cada nivel de profundidad (se calculan una vez).
  const levels = depthLevels(profile).map((d) => {
    const r = Math.round(cutRadiusAtDepth(profile, d) * UM);
    const eroded = offset(white, -r);
    return { depth: d, radius: r, eroded, bounds: bounds(eroded) };
  });

  const zones: FresaZone[] = [];
  let totalArea = 0;
  let idx = 0;
  for (const cand of candidates) {
    const { comp } = cand;

    // ¿Es un blanco encerrado que entero no llega?
    let kind: ZoneKind | null = null;
    let eyeHandled = false;
    for (const wc of whiteComps) {
      if (!boundsOverlap(wc.bounds, comp.bounds)) continue;
      if (comp.areaUm2 >= 0.85 * wc.areaUm2 && pointInRegion(cand.center, wc.paths)) {
        kind = 'hueco_cerrado';
        eyeHandled = eyeHoles.has(wc);
        break;
      }
    }
    // Los ojos se informan aparte, por su ancho (más abajo).
    if (eyeHandled) continue;

    if (!kind) {
      // Esquinas: zonas cortas (área / ancho chica). Un canal real es largo.
      const lengthMm = comp.areaUm2 / (2 * cand.thicknessUm) / UM;
      if (lengthMm < options.minChannelLengthMm) {
        if (ml) cand.touching ??= touchingPieces(comp);
        if (!cand.touching || cand.touching.length < 2) {
          ignoredCorners++;
          continue;
        }
      }
      const mouths = cand.touching ? [] : zoneMouths(comp, reached);
      if (mouths.length === 1 && isTapered(comp, mouths[0], cand.thicknessUm)) kind = 'angulo';
    }

    if (!kind) {
      // ¿Cuántas piezas negras distintas toca la zona?
      const touching = (cand.touching ??= touchingPieces(comp));
      kind = touching.length >= 2 ? 'paso_angosto' : 'rincon';
      if (kind === 'paso_angosto' && ml) {
        const pad = Math.round(ml.gapOkMm * UM) + 100;
        const win = { minX: comp.bounds.minX - pad, minY: comp.bounds.minY - pad, maxX: comp.bounds.maxX + pad, maxY: comp.bounds.maxY + pad };
        const okUm = ml.gapOkMm * UM;
        const c = pairContact(touching[0].paths, touching[1].paths, win, okUm, ml.gapGraveMm * UM);
        cand.mark = {
          gapMm: c.gapUm / UM,
          contactMm: c.contactUm / UM,
          pieceHeight: Math.min(heightMm(touching[0]), heightMm(touching[1])),
        };
        // Las dos piezas no quedan cerca: es un canal angosto, no un puente.
        if (c.gapUm >= okUm) kind = 'rincon';
      }
    }

    // Profundidad alcanzada: el nivel más hondo cuya erosión todavía toca la zona.
    let reachDepth = 0;
    let reachRadius = profile.tipDiameterMm / 2;
    for (const lv of levels) {
      if (!lv.bounds || !lv.eroded.length || !boundsOverlap(lv.bounds, comp.bounds)) break;
      if (!intersect(clipToBounds(lv.eroded, comp.bounds), comp.paths).length) break;
      reachDepth = lv.depth;
      reachRadius = lv.radius / UM;
    }
    if (reachDepth === 0) {
      // Ni a 0,05 mm: el hueco es casi de la punta. Usamos el grosor propio de la zona.
      reachRadius = Math.min(reachRadius, cand.thicknessUm / UM);
      reachDepth = depthForRadius(profile, reachRadius);
    }

    const areaMm2 = regionArea(comp.paths) / (UM * UM);
    // Con límites de marca, un espacio entre piezas se juzga por cómo marca.
    const markSeverity =
      kind === 'paso_angosto' && ml && cand.mark
        ? gapSeverity(ml, cand.mark.gapMm, cand.mark.contactMm, cand.mark.pieceHeight)
        : undefined;
    if (markSeverity === null) continue;
    totalArea += areaMm2;
    // Lo que separa piezas u ojos tiene que llegar sí o sí. En rincones y
    // ángulos alcanza con que la punta marque.
    const severity: ZoneSeverity =
      markSeverity ??
      (kind === 'hueco_cerrado' || kind === 'paso_angosto'
        ? 'alta'
        : reachDepth < options.lostDetailDepthMm && areaMm2 >= options.notableCornerAreaMm2
          ? 'media'
          : 'baja');
    zones.push({
      id: `z${++idx}`,
      kind,
      severity,
      areaMm2,
      bounds: boundsMm(comp.bounds),
      center: { x: cand.center.x / UM, y: cand.center.y / UM },
      gapWidthMm: Math.max(2 * reachRadius, 2 * (cand.thicknessUm / UM)),
      reachDepthMm: Math.min(reachDepth, profile.minDepthMm),
      rings: toMmRings(comp.paths),
      ...(cand.mark ? { markWidthMm: cand.mark.gapMm, pieceHeightMm: cand.mark.pieceHeight } : {}),
    });
  }

  for (const e of eyeZones) {
    const areaMm2 = e.wc.areaUm2 / (UM * UM);
    totalArea += areaMm2;
    zones.push({
      id: `z${++idx}`,
      kind: 'hueco_cerrado',
      severity: e.diamMm < ml!.eyeGraveMm ? 'alta' : 'media',
      areaMm2,
      bounds: boundsMm(e.wc.bounds),
      center: { x: e.center.x / UM, y: e.center.y / UM },
      gapWidthMm: e.diamMm,
      reachDepthMm: depthForRadius(profile, e.diamMm / 2),
      rings: toMmRings(e.wc.paths),
      markWidthMm: e.diamMm,
      pieceHeightMm: ownerHeight(e.wc),
    });
  }

  // Orden de lectura: graves primero, después de arriba a abajo, izquierda a derecha.
  const rank: Record<ZoneSeverity, number> = { alta: 0, media: 1, baja: 2 };
  zones.sort((a, z) =>
    a.severity !== z.severity
      ? rank[a.severity] - rank[z.severity]
      : Math.abs(a.center.y - z.center.y) > 1
        ? a.center.y - z.center.y
        : a.center.x - z.center.x,
  );
  zones.forEach((z, k) => (z.id = `z${k + 1}`));

  return {
    zones,
    depthBands: withDepthMap ? depthMap(white, reached, profile, b) : undefined,
    ignoredCorners,
    designWidthMm: (b.maxX - b.minX) / UM,
    designHeightMm: (b.maxY - b.minY) / UM,
    minGapMm,
    totalProblemAreaMm2: totalArea,
  };
}

/**
 * Mapa de profundidad de lo que no llega a la mínima, en franjas: lo que la
 * fresa no saca (ni la punta entra) y tres tramos hasta la mínima.
 */
function depthMap(white: Paths64, reached: Paths64, profile: FresaProfile, design: Bounds): DepthBand[] {
  const min = profile.minDepthMm;
  const edges = [0, min / 3, (2 * min) / 3];
  const openings = edges.map((d) => opening(white, Math.round(cutRadiusAtDepth(profile, d) * UM)));
  const bands: DepthBand[] = [];
  const push = (fromMm: number, toMm: number, region: Paths64) => {
    // Solo dentro del diseño: las esquinas del dominio no se tallan.
    const clean = opening(intersect(region, [rect(design)]), 3);
    if (clean.length) bands.push({ fromMm, toMm, rings: toMmRings(clean) });
  };
  push(0, 0, difference(white, openings[0]));
  for (let k = 0; k < edges.length; k++) {
    const deeper = k + 1 < openings.length ? openings[k + 1] : reached;
    push(edges[k], k + 1 < edges.length ? edges[k + 1] : min, difference(openings[k], deeper));
  }
  return bands;
}
