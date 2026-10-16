/** Comparación geométrica orientativa; no calcula la selección CAM de Aspire. */
import { analyzeBlackRegion, buildBlackRegion, type PaintShape, type FresaZone } from './analyze';
import { groupZones, type CheckOutput } from './engine';
import { cutRadiusAtDepth, primaryProfile, type FresaAnalysisOptions, type FresaProfile, type MachiningRecipe } from './config';
import { UM, bounds, difference, intersect, opening, rect, regionArea, toPath64, union, type Paths64 } from './geometry';

export type PassOutcome = 'sin_repaso' | 'repaso_sugerido' | 'revisar_rango' | 'revisar_diseno' | 'revisar_principal' | 'sin_receta';
export interface RepasoCandidate {
  zoneId: string;
  bounds: FresaZone['bounds'];
  benefitAreaMm2: number;
  assessment: 'alcanza_referencia' | 'en_rango' | 'revisar';
}
export interface PassesOutput {
  recipe: MachiningRecipe | null;
  primaryProfile: FresaProfile | null;
  primary: CheckOutput | null;
  fine: CheckOutput;
  preferredFine: CheckOutput | null;
  fineReference: { lowerMm: number; preferredMm: number };
  candidates: RepasoCandidate[];
  outcome: PassOutcome;
}

const serious = (z: FresaZone) => z.severity !== 'baja';
const region = (z: FresaZone): Paths64 => z.rings.map((r) => toPath64(r, 1));

function check(black: Paths64, profile: FresaProfile, options: FresaAnalysisOptions): CheckOutput {
  const start = performance.now();
  const result = analyzeBlackRegion(black, profile, options, true);
  return { ...result, groups: groupZones(result.zones), durationMs: Math.round(performance.now() - start) };
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
    candidates: [], outcome: 'sin_receta',
  };
  if (!result.primaryProfile) return result;
  const primary = check(black, result.primaryProfile, options);
  result.primary = primary;
  const needed = primary.zones.filter(serious);
  if (!needed.length) return { ...result, outcome: 'sin_repaso' };
  // La referencia de 0,5 mm solo importa si hace falta el repaso (ahorra un análisis entero).
  const preferredFine = recipe === 'ALIMENTO' ? check(black, preferredProfile, options) : null;
  result.preferredFine = preferredFine;
  const b = bounds(black);
  if (!b) return result;
  const margin = 10 * UM;
  const white = difference([rect({ minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin })], black);
  // Comparar ambas herramientas a LA MISMA profundidad del repaso. Una zona
  // que no llega a 1 mm con la primera no implica que la fina (tope 0,6) ayude.
  const depth = preferredProfile.minDepthMm;
  const primaryCoverage = depth <= result.primaryProfile.finalDepthMm
    ? opening(white, Math.round(cutRadiusAtDepth(result.primaryProfile, depth) * UM)) : [];
  const fineCoverage = opening(white, Math.round(cutRadiusAtDepth(profile, depth) * UM));
  const improvement = difference(fineCoverage, primaryCoverage);
  const fineMiss = union(fine.zones.filter(serious).flatMap(region));
  const preferredMiss = union((preferredFine ?? fine).zones.filter(serious).flatMap(region));
  const meaningful = options.minZoneAreaMm2 * UM * UM;
  for (const zone of needed) {
    const area = region(zone);
    const benefit = regionArea(intersect(area, improvement));
    if (benefit < meaningful) continue;
    result.candidates.push({
      zoneId: zone.id, bounds: zone.bounds, benefitAreaMm2: benefit / (UM * UM),
      assessment: regionArea(intersect(area, fineMiss)) >= meaningful ? 'revisar'
        : regionArea(intersect(area, preferredMiss)) >= meaningful ? 'en_rango' : 'alcanza_referencia',
    });
  }
  const unresolved = regionArea(intersect(union(needed.flatMap(region)), fineMiss)) >= meaningful;
  result.outcome = unresolved || result.candidates.some((c) => c.assessment === 'revisar') ? 'revisar_diseno'
    : result.candidates.length < needed.length ? 'revisar_principal'
      : result.candidates.some((c) => c.assessment === 'en_rango') ? 'revisar_rango'
        : 'repaso_sugerido';
  return result;
}

export const PASS_OUTCOME_LABEL: Record<PassOutcome, string> = {
  sin_repaso: 'Sin repaso sugerido', repaso_sugerido: 'Repaso sugerido', revisar_rango: 'Revisar rango de repaso',
  revisar_diseno: 'Revisar diseño', revisar_principal: 'Revisar primera pasada', sin_receta: 'Falta receta para comparar',
};
