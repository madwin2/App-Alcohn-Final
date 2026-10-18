/** Comparación geométrica orientativa; no calcula la selección CAM de Aspire. */
import { analyzeBlackRegion, buildBlackRegion, type PaintShape, type FresaZone } from './analyze';
import { groupZones, type CheckOutput } from './engine';
import { REPASO_DEPTH_STEP_MM, REPASO_MIN_GAIN_MM, REPASO_MIN_RELATIVE, cutRadiusAtDepth, primaryProfile, type FresaAnalysisOptions, type FresaProfile, type MachiningRecipe } from './config';
import { UM, bounds, components, difference, intersect, offset, opening, rect, regionArea, toPath64, union, type Paths64 } from './geometry';
import type { Pt } from './pathData';

export type PassOutcome = 'sin_repaso' | 'repaso_sugerido' | 'revisar_rango' | 'revisar_diseno' | 'revisar_principal' | 'sin_receta';
export interface RepasoCandidate {
  zoneId: string;
  bounds: FresaZone['bounds'];
  benefitAreaMm2: number;
  assessment: 'alcanza_referencia' | 'en_rango' | 'revisar';
}
/** Lugar donde la 0,2 saca lo que dejó la 0,6 (mm, coordenadas del análisis). */
export interface RepasoZone {
  id: string;
  rings: Pt[][];
  areaMm2: number;
  bounds: FresaZone['bounds'];
  center: { x: number; y: number };
  /** Piezas (vectores negros) que bordean la zona: son las que se repasan. */
  pieceIds: number[];
}
/** Pieza negra del diseño (un vector cerrado con sus agujeros). */
export interface RepasoPiece { id: number; bounds: FresaZone['bounds']; selected: boolean }
export interface PassesOutput {
  recipe: MachiningRecipe | null;
  primaryProfile: FresaProfile | null;
  primary: CheckOutput | null;
  fine: CheckOutput;
  preferredFine: CheckOutput | null;
  fineReference: { lowerMm: number; preferredMm: number };
  candidates: RepasoCandidate[];
  /** Selección automática del repaso: zonas y piezas que tocan. */
  repaso: { zones: RepasoZone[]; pieces: RepasoPiece[]; minGainMm: number };
  outcome: PassOutcome;
}

const serious = (z: FresaZone) => z.severity !== 'baja';
const region = (z: { rings: Pt[][] }): Paths64 => z.rings.map((r) => toPath64(r, 1));
const toMm = (paths: Paths64): Pt[][] => paths.map((p) => p.map((q) => ({ x: q.x / UM, y: q.y / UM })));
const boundsMm = (paths: Paths64) => {
  const b = bounds(paths)!;
  return { minX: b.minX / UM, minY: b.minY / UM, maxX: b.maxX / UM, maxY: b.maxY / UM };
};

function check(black: Paths64, profile: FresaProfile, options: FresaAnalysisOptions): CheckOutput {
  const start = performance.now();
  const result = analyzeBlackRegion(black, profile, options, true);
  return { ...result, groups: groupZones(result.zones), durationMs: Math.round(performance.now() - start) };
}

/**
 * Dónde la 0,2 talla al menos `minGainMm` más hondo que la 0,6: un punto entra
 * si la fina llega a la profundidad d y la primera no llega a d − minGainMm,
 * para alguna d hasta el final del repaso. No depende del tipo de zona
 * (ranura, ángulo, entre letras): solo de la diferencia real entre fresas.
 */
export function fineGainRegion(white: Paths64, primary: FresaProfile, fine: FresaProfile, minGainMm = REPASO_MIN_GAIN_MM): Paths64 {
  const reach = (p: FresaProfile, d: number) => opening(white, Math.round(cutRadiusAtDepth(p, d) * UM));
  let gain: Paths64 = [];
  for (let d = minGainMm + REPASO_DEPTH_STEP_MM; d <= fine.finalDepthMm + 1e-9; d += REPASO_DEPTH_STEP_MM) {
    gain = union(gain, difference(reach(fine, d), reach(primary, d - minGainMm)));
  }
  // Sin astillas de redondeo entre niveles.
  return opening(gain, Math.round(0.01 * UM));
}

/** Zonas de repaso y las piezas negras que las bordean (las que se seleccionan). */
export function repasoSelection(black: Paths64, white: Paths64, primary: FresaProfile, fine: FresaProfile,
  options: FresaAnalysisOptions, minGainMm = REPASO_MIN_GAIN_MM): PassesOutput['repaso'] {
  const pieces = components(black);
  const selected = new Set<number>();
  const zones: RepasoZone[] = [];
  const meaningful = options.minZoneAreaMm2 * UM * UM;
  for (const comp of components(fineGainRegion(white, primary, fine, minGainMm))) {
    const area = regionArea(comp.paths);
    // Lo más chico es el redondeo normal de cualquier esquina: no justifica repasar.
    if (area < meaningful) continue;
    // La zona toca la pared que talla: alcanza con un margen chico para encontrarla.
    const probe = offset(comp.paths, Math.round(0.15 * UM));
    const pieceIds = pieces.flatMap((p, i) => intersect(p.paths, probe).length ? [i] : []);
    const b = boundsMm(comp.paths);
    // Chica para el tamaño de la letra que toca (la más chica, si son varias): no se nota.
    const size = Math.min(...pieceIds.map((i) => { const pb = boundsMm(pieces[i].paths); return Math.max(pb.maxX - pb.minX, pb.maxY - pb.minY); }));
    if (Math.max(b.maxX - b.minX, b.maxY - b.minY) < REPASO_MIN_RELATIVE * size) continue;
    pieceIds.forEach((i) => selected.add(i));
    zones.push({ id: `r${zones.length + 1}`, rings: toMm(comp.paths), areaMm2: area / (UM * UM), bounds: b,
      center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, pieceIds });
  }
  return { zones, minGainMm, pieces: pieces.map((p, i) => ({ id: i, bounds: boundsMm(p.paths), selected: selected.has(i) })) };
}

export function runPasses(
  shapes: PaintShape[], mmPerUnit: number, profile: FresaProfile,
  recipe: MachiningRecipe | null, options: FresaAnalysisOptions,
): PassesOutput {
  const black = buildBlackRegion(shapes, mmPerUnit);
  const fine = check(black, profile, options);
  const preferredProfile = recipe === 'ALIMENTO' ? { ...profile, minDepthMm: 0.5 } : profile;
  const result: PassesOutput = {
    recipe, primaryProfile: recipe ? primaryProfile(recipe) : null, primary: null, fine, preferredFine: null,
    fineReference: { lowerMm: profile.minDepthMm, preferredMm: preferredProfile.minDepthMm },
    candidates: [], repaso: { zones: [], pieces: [], minGainMm: REPASO_MIN_GAIN_MM }, outcome: 'sin_receta',
  };
  if (!result.primaryProfile) return result;
  const primary = check(black, result.primaryProfile, options);
  result.primary = primary;
  const b = bounds(black);
  if (!b) return result;
  const margin = 10 * UM;
  const white = difference([rect({ minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin })], black);
  // Selección: donde la 0,2 saca lo que la 0,6 no pudo, hasta el final del repaso.
  result.repaso = repasoSelection(black, white, result.primaryProfile, profile, options);
  const needed = primary.zones.filter(serious);
  if (!result.repaso.zones.length && !needed.length) return { ...result, outcome: 'sin_repaso' };
  // La referencia de 0,5 mm solo importa si hace falta el repaso (ahorra un análisis entero).
  const preferredFine = recipe === 'ALIMENTO' ? check(black, preferredProfile, options) : null;
  result.preferredFine = preferredFine;
  const fineMiss = union(fine.zones.filter(serious).flatMap(region));
  const preferredMiss = union((preferredFine ?? fine).zones.filter(serious).flatMap(region));
  const meaningful = options.minZoneAreaMm2 * UM * UM;
  for (const zone of result.repaso.zones) {
    const area = region(zone);
    result.candidates.push({
      zoneId: zone.id, bounds: zone.bounds, benefitAreaMm2: zone.areaMm2,
      assessment: regionArea(intersect(area, fineMiss)) >= meaningful ? 'revisar'
        : regionArea(intersect(area, preferredMiss)) >= meaningful ? 'en_rango' : 'alcanza_referencia',
    });
  }
  // Lo que ni la 0,2 separa es un problema del diseño, con o sin repaso.
  const unresolved = regionArea(intersect(union(needed.flatMap(region)), fineMiss)) >= meaningful;
  result.outcome = unresolved || result.candidates.some((c) => c.assessment === 'revisar') ? 'revisar_diseno'
    : !result.repaso.zones.length ? 'revisar_principal'
      : result.candidates.some((c) => c.assessment === 'en_rango') ? 'revisar_rango'
        : 'repaso_sugerido';
  return result;
}

export const PASS_OUTCOME_LABEL: Record<PassOutcome, string> = {
  sin_repaso: 'Sin repaso sugerido', repaso_sugerido: 'Repaso sugerido', revisar_rango: 'Revisar rango de repaso',
  revisar_diseno: 'Revisar diseño', revisar_principal: 'Revisar primera pasada', sin_receta: 'Falta receta para comparar',
};
