/**
 * Operaciones de geometría sobre regiones (Clipper2). Todo en micrones enteros
 * (1 unidad = 1 µm) para que las booleanas sean exactas.
 */
import {
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PolyTree64,
  area as clipArea,
  booleanOp,
  booleanOpWithPolyTree,
  getBoundsPaths,
  inflatePaths,
  pointInPolygon,
  rectClip,
  PointInPolygonResult,
  simplifyPaths,
  type Path64,
  type Paths64,
  type PolyPath64,
} from 'clipper2-ts';
import type { Pt } from './pathData';

export type { Path64, Paths64 };

/** Micrones por mm. */
export const UM = 1000;

/** Tolerancia de arco de los offsets (µm): error máximo de los redondeos. */
const ARC_TOL = 2;

export function toPath64(points: Pt[], mmPerUnit: number): Path64 {
  const f = mmPerUnit * UM;
  const out: Path64 = [];
  let lx = NaN;
  let ly = NaN;
  for (const p of points) {
    const x = Math.round(p.x * f);
    const y = Math.round(p.y * f);
    if (x === lx && y === ly) continue;
    out.push({ x, y });
    lx = x;
    ly = y;
  }
  return out;
}

export function union(a: Paths64, b: Paths64 | null = null, rule = FillRule.NonZero): Paths64 {
  return booleanOp(ClipType.Union, a, b, rule);
}

export function difference(a: Paths64, b: Paths64): Paths64 {
  if (!a.length) return [];
  if (!b.length) return a;
  return booleanOp(ClipType.Difference, a, b, FillRule.NonZero);
}

export function intersect(a: Paths64, b: Paths64): Paths64 {
  if (!a.length || !b.length) return [];
  return booleanOp(ClipType.Intersection, a, b, FillRule.NonZero);
}

/** Offset de una región (delta > 0 agranda, < 0 achica). Juntas redondas: es una fresa. */
export function offset(paths: Paths64, deltaUm: number): Paths64 {
  if (!paths.length) return [];
  if (deltaUm === 0) return paths;
  return inflatePaths(paths, deltaUm, JoinType.Round, EndType.Polygon, 2, ARC_TOL);
}

export function translate(paths: Paths64, dx: number, dy: number): Paths64 {
  if (!dx && !dy) return paths;
  return paths.map((p) => p.map((q) => ({ x: q.x + dx, y: q.y + dy })));
}

/** Escala `f` y traslada (`tx`, `ty`): p' = p·f + t (µm). */
export function affine(paths: Paths64, f: number, tx: number, ty: number): Paths64 {
  if (f === 1 && !tx && !ty) return paths;
  return paths.map((p) => p.map((q) => ({ x: Math.round(q.x * f + tx), y: Math.round(q.y * f + ty) })));
}

/** Apertura morfológica: lo que puede barrer un disco de radio r sin salirse de la región. */
export function opening(paths: Paths64, rUm: number): Paths64 {
  return offset(offset(paths, -rUm), rUm);
}

/** Área total de una región (µm²), con signo de orientación ya resuelto (siempre ≥ 0). */
export function regionArea(paths: Paths64): number {
  let a = 0;
  for (const p of paths) a += clipArea(p);
  return Math.abs(a);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(paths: Paths64): Bounds | null {
  if (!paths.length) return null;
  const r = getBoundsPaths(paths);
  if (r.left > r.right || r.top > r.bottom) return null;
  return { minX: r.left, minY: r.top, maxX: r.right, maxY: r.bottom };
}

export function boundsOverlap(a: Bounds, b: Bounds, pad = 0): boolean {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
}

export function rect(b: Bounds): Path64 {
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
}

/** Recorta una región a una caja (rápido; para no operar con regiones enteras). */
export function clipToBounds(paths: Paths64, b: Bounds, pad = 2): Paths64 {
  if (!paths.length) return [];
  return rectClip(
    { left: b.minX - pad, top: b.minY - pad, right: b.maxX + pad, bottom: b.maxY + pad },
    paths,
  );
}

/** Una región conexa: contorno exterior + agujeros. */
export interface Component {
  paths: Paths64;
  areaUm2: number;
  bounds: Bounds;
}

/** Separa una región en componentes conexas (cada exterior con sus agujeros). */
export function components(paths: Paths64): Component[] {
  if (!paths.length) return [];
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, paths, null, tree, FillRule.NonZero);
  const out: Component[] = [];
  const visitOuter = (node: PolyPath64) => {
    const outer = node.poly;
    if (!outer) return;
    const paths: Paths64 = [outer];
    for (let i = 0; i < node.count; i++) {
      const hole = node.child(i);
      if (hole.poly) paths.push(hole.poly);
      // Islas dentro del agujero: componentes nuevas.
      for (let j = 0; j < hole.count; j++) visitOuter(hole.child(j));
    }
    const b = bounds(paths);
    if (b) out.push({ paths, areaUm2: regionArea(paths), bounds: b });
  };
  for (let i = 0; i < tree.count; i++) visitOuter(tree.child(i));
  return out;
}

/** ¿El punto cae dentro de la región (regla nonzero sobre todos sus anillos)? */
export function pointInRegion(pt: { x: number; y: number }, paths: Paths64): boolean {
  let winding = 0;
  for (const p of paths) {
    const r = pointInPolygon(pt, p);
    if (r === PointInPolygonResult.IsOn) return true;
    if (r === PointInPolygonResult.IsInside) winding += clipArea(p) >= 0 ? 1 : -1;
  }
  return winding !== 0;
}

/** Un punto interior "representativo": el centro de lo que queda al erosionar al máximo. */
export function interiorPoint(comp: Component): { x: number; y: number; radiusUm: number } {
  const maxR = Math.min(comp.bounds.maxX - comp.bounds.minX, comp.bounds.maxY - comp.bounds.minY) / 2;
  let lo = 0;
  let hi = Math.max(1, maxR);
  let best: Paths64 = comp.paths;
  for (let k = 0; k < 14 && hi - lo > 1; k++) {
    const midR = (lo + hi) / 2;
    const eroded = offset(comp.paths, -midR);
    if (eroded.length) {
      lo = midR;
      best = eroded;
    } else {
      hi = midR;
    }
  }
  const b = bounds(best) ?? comp.bounds;
  let pt = { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
  if (!pointInRegion(pt, comp.paths)) {
    // Región con forma rara: usar un vértice del remanente.
    const v = best[0]?.[0] ?? comp.paths[0][0];
    pt = { x: v.x, y: v.y };
  }
  return { ...pt, radiusUm: lo };
}

/** Simplifica (Ramer-Douglas-Peucker de Clipper) para exportar archivos livianos. */
export function simplify(paths: Paths64, epsUm: number): Paths64 {
  return simplifyPaths(paths, epsUm, true).filter((p) => p.length >= 3);
}
