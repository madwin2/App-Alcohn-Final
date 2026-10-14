/**
 * Corrección automática local: abre los huecos marcados para que la fresa
 * llegue a la profundidad mínima, tocando solo el negro alrededor de cada zona.
 *
 * Idea (lo mismo que hace el operario con offsets a mano, pero solo donde hace
 * falta): por cada zona se toma su "alma" (la zona erosionada casi hasta el
 * centro) y se barre con un disco del radio de la fresa a la profundidad
 * mínima. Lo que ese barrido pisa de negro se saca. Así el hueco queda con el
 * ancho justo para la fresa, centrado donde estaba, y el resto del diseño no
 * cambia.
 */
import { FRESA_FINA, cutRadiusAtDepth, type FresaProfile } from './config';
import {
  UM,
  bounds,
  clipToBounds,
  components,
  difference,
  offset,
  rect,
  type Bounds,
  type Paths64,
} from './geometry';
import type { FresaZone } from './analyze';

export interface FixResult {
  /** Región negra corregida (µm). */
  black: Paths64;
  /** Lo que se sacó de negro (µm), para mostrarlo. */
  removed: Paths64;
  removedAreaMm2: number;
  /** Zonas corregidas. */
  fixedZoneIds: string[];
  /**
   * Zonas que no se tocaron porque corregirlas rompía el diseño (partía una
   * pieza negra, borraba un detalle o unía dos blancos): quedan para editar a mano.
   */
  skippedZoneIds: string[];
}

const toUm = (rings: FresaZone['rings']): Paths64 =>
  rings.map((r) => r.map((p) => ({ x: Math.round(p.x * UM), y: Math.round(p.y * UM) })));

/** Barrido que abre una zona al ancho de la fresa (µm), limitado a su vecindad. */
function zoneCut(zone: Paths64, R: number): { cut: Paths64; reach: number } | null {
  const zb = bounds(zone);
  if (!zb) return null;
  // Grosor de la zona (radio inscripto) por bisección: el alma se toma al 85 %.
  let lo = 0;
  let hi = Math.max(2, Math.min(zb.maxX - zb.minX, zb.maxY - zb.minY) / 2);
  for (let k = 0; k < 12 && hi - lo > 2; k++) {
    const m = (lo + hi) / 2;
    if (offset(zone, -m).length) lo = m;
    else hi = m;
  }
  const thickness = lo;
  let core = offset(zone, -Math.round(thickness * 0.85));
  if (!core.length) core = offset(zone, -Math.round(thickness * 0.5));
  if (!core.length) core = zone;
  // El barrido de un disco de radio R por el alma: donde pasa, entra la fresa a
  // la profundidad mínima. Como el alma está adentro de la zona, el corte nunca
  // se aleja más de R del hueco original.
  const cut = offset(core, R + 3);
  return cut.length ? { cut, reach: R + 3 } : null;
}

/** Cantidad de piezas negras y de blancos en una ventana (para comparar topología). */
function localTopology(black: Paths64, window: Bounds): { black: number; white: number } {
  const local = clipToBounds(black, window, 0);
  const blackCount = components(local).length;
  const whiteCount = components(difference([rect(window)], local)).length;
  return { black: blackCount, white: whiteCount };
}

export function fixZones(
  black: Paths64,
  zones: FresaZone[],
  profile: FresaProfile = FRESA_FINA,
): FixResult {
  const R = Math.round(cutRadiusAtDepth(profile, profile.minDepthMm) * UM);
  let current = black;
  const fixed: string[] = [];
  const skipped: string[] = [];

  for (const z of zones) {
    const zone = toUm(z.rings);
    const plan = zone.length ? zoneCut(zone, R) : null;
    const zb = bounds(zone);
    if (!plan || !zb) {
      skipped.push(z.id);
      continue;
    }
    const pad = plan.reach + R + 100;
    const window: Bounds = { minX: zb.minX - pad, minY: zb.minY - pad, maxX: zb.maxX + pad, maxY: zb.maxY + pad };
    const candidate = difference(current, plan.cut);
    // Corregir no puede cambiar la topología del diseño: misma cantidad de
    // piezas negras (no partir trazos finos ni borrar puntos) y de blancos (no
    // atravesar una pared negra uniendo dos huecos).
    const before = localTopology(current, window);
    const after = localTopology(candidate, window);
    if (before.black !== after.black || before.white !== after.white) {
      skipped.push(z.id);
      continue;
    }
    current = candidate;
    fixed.push(z.id);
  }

  const removed = difference(black, current);
  let removedArea = 0;
  for (const c of components(removed)) removedArea += c.areaUm2;
  return {
    black: current,
    removed,
    removedAreaMm2: removedArea / (UM * UM),
    fixedZoneIds: fixed,
    skippedZoneIds: skipped,
  };
}
