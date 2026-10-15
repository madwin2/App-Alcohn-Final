/**
 * Aplica al SVG original las piezas que la corrección movió enteras.
 *
 * En un path compuesto (todo el texto en un solo <path>, como exporta
 * Illustrator) se mueven solo los sub-trayectos de esa pieza, con sus curvas
 * intactas. Las figuras simples (rect, circle, polygon…) se mueven con un
 * `transform`. Lo que no se movió queda igual.
 */
import type { PieceMove } from './fix';
import { UM, bounds, offset, pointInRegion, type Bounds, type Paths64 } from './geometry';
import { absoluteSubpaths, flattenPathData, segmentsToD, translateSegments, type Pt } from './pathData';
import { applyMatrix, rootDeltaToLocal, type ParsedSvg } from './svgShapes';

interface Target {
  probe: Paths64;
  b: Bounds;
  /** Desplazamiento en unidades del viewBox raíz. */
  d: Pt;
}

const fmt = (n: number) => {
  const s = n.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

/** Devuelve cuántas figuras o sub-trayectos se movieron. */
export function applyPieceMoves(parsed: ParsedSvg, mmPerUnit: number, moves: PieceMove[]): number {
  const f = mmPerUnit * UM;
  const targets: Target[] = [];
  for (const m of moves) {
    const b = bounds(m.region);
    if (!b) continue;
    targets.push({
      probe: offset(m.region, 8),
      b: { minX: b.minX - 10, minY: b.minY - 10, maxX: b.maxX + 10, maxY: b.maxY + 10 },
      d: { x: m.dx / f, y: m.dy / f },
    });
  }
  if (!targets.length) return 0;

  const find = (rootPts: Pt[]): Target | null => {
    if (!rootPts.length) return null;
    const pts = rootPts.map((p) => ({ x: Math.round(p.x * f), y: Math.round(p.y * f) }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const rb = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    return (
      targets.find(
        (t) =>
          t.b.minX <= rb.minX && t.b.minY <= rb.minY && t.b.maxX >= rb.maxX && t.b.maxY >= rb.maxY && pointInRegion(pts[0], t.probe),
      ) ?? null
    );
  };

  let count = 0;
  const tol = 0.01 / mmPerUnit;
  for (const s of parsed.shapes) {
    if (s.fill !== 'dark') continue;
    const el = parsed.elements[s.index];
    if (!el) continue;
    if (s.tag === 'path') {
      const subs = absoluteSubpaths(el.getAttribute('d') ?? '');
      let changed = false;
      const next = subs.map((segs) => {
        const flat = flattenPathData(segmentsToD([segs]), tol).flatMap((sp) => sp.points);
        const t = find(flat.map((p) => applyMatrix(s.matrix, p)));
        if (!t) return segs;
        changed = true;
        count++;
        const local = rootDeltaToLocal(s.matrix, t.d);
        return translateSegments(segs, local.x, local.y);
      });
      if (changed) el.setAttribute('d', segmentsToD(next));
      continue;
    }
    const perRing = s.rings.map((r) => find(r));
    const t = perRing[0];
    if (!t || perRing.some((x) => x !== t)) continue;
    const local = rootDeltaToLocal(s.parentMatrix, t.d);
    const prev = el.getAttribute('transform');
    el.setAttribute('transform', `translate(${fmt(local.x)} ${fmt(local.y)})${prev ? ` ${prev}` : ''}`);
    count++;
  }
  return count;
}
