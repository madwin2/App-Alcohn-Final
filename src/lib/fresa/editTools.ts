/**
 * Cálculos de apoyo del editor manual: imán con guías inteligentes, alinear,
 * distribuir y espacios a las piezas vecinas. Todo con cajas (bounding box) en
 * unidades del dibujo; funciones puras, sin DOM.
 */
import type { Box } from './editDoc';

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export const shiftBox = (b: Box, dx: number, dy: number): Box => ({
  minX: b.minX + dx,
  minY: b.minY + dy,
  maxX: b.maxX + dx,
  maxY: b.maxY + dy,
});

const cx = (b: Box) => (b.minX + b.maxX) / 2;
const cy = (b: Box) => (b.minY + b.maxY) / 2;

/** Línea guía a dibujar: vertical (`x` fijo) u horizontal (`y` fijo), con su largo. */
export type Guide = { axis: 'x'; x: number; y1: number; y2: number } | { axis: 'y'; y: number; x1: number; x2: number };

export interface SnapTargets {
  /** Cajas de las otras piezas. */
  boxes: Box[];
  /** Líneas extra (por ejemplo, el centro del diseño). */
  xs?: number[];
  ys?: number[];
}

/**
 * Imán: corrige un desplazamiento (dx, dy) para que el borde o el centro de la
 * caja que se mueve coincida con el de alguna otra caja (o línea extra), si
 * queda a menos de `threshold`. Devuelve el desplazamiento corregido y las
 * guías que lo explican.
 */
export function snapMove(
  moving: Box,
  dx: number,
  dy: number,
  targets: SnapTargets,
  threshold: number,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): { dx: number; dy: number; guides: Guide[] } {
  const m = shiftBox(moving, dx, dy);
  const mxs = [m.minX, cx(m), m.maxX];
  const mys = [m.minY, cy(m), m.maxY];
  type Cand = { d: number; value: number; box: Box | null };
  let bestX: Cand | null = null;
  let bestY: Cand | null = null;
  const tryX = (value: number, box: Box | null) => {
    for (const v of mxs) {
      const d = value - v;
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, value, box };
    }
  };
  const tryY = (value: number, box: Box | null) => {
    for (const v of mys) {
      const d = value - v;
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, value, box };
    }
  };
  for (const b of targets.boxes) {
    if (axes.x) for (const v of [b.minX, cx(b), b.maxX]) tryX(v, b);
    if (axes.y) for (const v of [b.minY, cy(b), b.maxY]) tryY(v, b);
  }
  if (axes.x) for (const v of targets.xs ?? []) tryX(v, null);
  if (axes.y) for (const v of targets.ys ?? []) tryY(v, null);

  const outDx = dx + ((bestX as Cand | null)?.d ?? 0);
  const outDy = dy + ((bestY as Cand | null)?.d ?? 0);
  const final = shiftBox(moving, outDx, outDy);
  const guides: Guide[] = [];
  const bx = bestX as Cand | null;
  const by = bestY as Cand | null;
  if (bx) {
    const other = bx.box;
    guides.push({
      axis: 'x',
      x: bx.value,
      y1: Math.min(final.minY, other ? other.minY : final.minY),
      y2: Math.max(final.maxY, other ? other.maxY : final.maxY),
    });
  }
  if (by) {
    const other = by.box;
    guides.push({
      axis: 'y',
      y: by.value,
      x1: Math.min(final.minX, other ? other.minX : final.minX),
      x2: Math.max(final.maxX, other ? other.maxX : final.maxX),
    });
  }
  return { dx: outDx, dy: outDy, guides };
}

/** Imán para un punto (un nodo): a la x o la y de otros puntos. */
export function snapPoint(
  p: { x: number; y: number },
  xs: number[],
  ys: number[],
  threshold: number,
): { x: number; y: number; guides: Guide[]; span: { x?: number; y?: number } } {
  let bx: number | null = null;
  let by: number | null = null;
  for (const v of xs) if (Math.abs(v - p.x) <= threshold && (bx == null || Math.abs(v - p.x) < Math.abs(bx - p.x))) bx = v;
  for (const v of ys) if (Math.abs(v - p.y) <= threshold && (by == null || Math.abs(v - p.y) < Math.abs(by - p.y))) by = v;
  return { x: bx ?? p.x, y: by ?? p.y, guides: [], span: { x: bx ?? undefined, y: by ?? undefined } };
}

/** Restringe un arrastre a horizontal o vertical (el eje de mayor movimiento). */
export function constrainAxis(dx: number, dy: number): { dx: number; dy: number; axis: 'x' | 'y' } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0, axis: 'x' } : { dx: 0, dy, axis: 'y' };
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Corrimiento de cada caja para alinearlas entre sí (respecto de la caja que las contiene). */
export function alignShifts(boxes: Box[], mode: AlignMode): Array<{ dx: number; dy: number }> {
  const all = unionBox(boxes);
  if (!all) return [];
  return boxes.map((b) => {
    switch (mode) {
      case 'left':
        return { dx: all.minX - b.minX, dy: 0 };
      case 'right':
        return { dx: all.maxX - b.maxX, dy: 0 };
      case 'hcenter':
        return { dx: cx(all) - cx(b), dy: 0 };
      case 'top':
        return { dx: 0, dy: all.minY - b.minY };
      case 'bottom':
        return { dx: 0, dy: all.maxY - b.maxY };
      case 'vcenter':
        return { dx: 0, dy: cy(all) - cy(b) };
    }
  });
}

/**
 * Repartir con el mismo espacio entre cajas (en horizontal o vertical). Las de
 * los extremos quedan donde están; las del medio se corren para que todos los
 * espacios sean iguales. Hace falta al menos 3.
 */
export function distributeShifts(boxes: Box[], axis: 'x' | 'y'): Array<{ dx: number; dy: number }> {
  const out = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return out;
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  const order = boxes.map((_, i) => i).sort((a, z) => lo(boxes[a]) + hi(boxes[a]) - (lo(boxes[z]) + hi(boxes[z])));
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const sizes = order.reduce((acc, i) => acc + (hi(boxes[i]) - lo(boxes[i])), 0);
  const gap = (hi(last) - lo(first) - sizes) / (order.length - 1);
  let pos = lo(first);
  for (const i of order) {
    const b = boxes[i];
    const d = pos - lo(b);
    out[i] = axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    pos += hi(b) - lo(b) + gap;
  }
  return out;
}

export type SpreadAnchor = 'start' | 'center' | 'end';

/**
 * Grupos que se mueven juntos al distanciar, en orden sobre el eje. Lo que se
 * pisa sobre el eje va junto (el punto de la «i», un acento). Con `byWords`,
 * además, las letras de una palabra: se corta solo donde el espacio es
 * claramente más grande que el de entre letras (más del doble del espacio
 * típico y al menos `minWordGap` más).
 */
export function spreadGroups(boxes: Box[], axis: 'x' | 'y', byWords = false, minWordGap = 0): number[][] {
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  const order = boxes.map((_, i) => i).sort((a, z) => lo(boxes[a]) - lo(boxes[z]));
  const groups: { ids: number[]; lo: number; hi: number }[] = [];
  for (const i of order) {
    const g = groups[groups.length - 1];
    if (g && lo(boxes[i]) < g.hi) {
      g.ids.push(i);
      g.hi = Math.max(g.hi, hi(boxes[i]));
    } else groups.push({ ids: [i], lo: lo(boxes[i]), hi: hi(boxes[i]) });
  }
  if (!byWords || groups.length < 3) return groups.map((g) => g.ids);
  const gaps = groups.slice(1).map((g, i) => g.lo - groups[i].hi);
  const typical = [...gaps].sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)];
  const words: number[][] = [[...groups[0].ids]];
  gaps.forEach((gap, i) => {
    if (gap > 2 * typical && gap - typical >= minWordGap) words.push([...groups[i + 1].ids]);
    else words[words.length - 1].push(...groups[i + 1].ids);
  });
  return words;
}

/**
 * Distanciar: suma `amount` a cada espacio entre grupos consecutivos (negativo
 * junta). `start` deja fijo el primero (izquierda / arriba), `end` el último y
 * `center` reparte hacia los dos lados.
 */
export function spreadShifts(boxes: Box[], groups: number[][], axis: 'x' | 'y', amount: number, anchor: SpreadAnchor): Array<{ dx: number; dy: number }> {
  const out = boxes.map(() => ({ dx: 0, dy: 0 }));
  const n = groups.length;
  groups.forEach((ids, j) => {
    const steps = anchor === 'start' ? j : anchor === 'end' ? j - (n - 1) : j - (n - 1) / 2;
    const d = steps * amount;
    for (const i of ids) out[i] = axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
  });
  return out;
}

/** Eje en que están puestas las piezas (el de más recorrido entre sus centros). */
export function spreadAxis(boxes: Box[]): 'x' | 'y' {
  const cx = boxes.map((b) => (b.minX + b.maxX) / 2);
  const cy = boxes.map((b) => (b.minY + b.maxY) / 2);
  return Math.max(...cx) - Math.min(...cx) >= Math.max(...cy) - Math.min(...cy) ? 'x' : 'y';
}

/** Espacio (entre cajas) a la pieza más cercana a cada lado, si hay alguna enfrente. */
export function neighborGaps(sel: Box, others: Box[]): { left?: number; right?: number; up?: number; down?: number } {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  const h = sel.maxY - sel.minY;
  const w = sel.maxX - sel.minX;
  const out: { left?: number; right?: number; up?: number; down?: number } = {};
  for (const o of others) {
    if (overlap(sel.minY, sel.maxY, o.minY, o.maxY) >= 0.3 * Math.min(h, o.maxY - o.minY)) {
      if (o.maxX <= sel.minX + 1e-9) out.left = Math.min(out.left ?? Infinity, sel.minX - o.maxX);
      if (o.minX >= sel.maxX - 1e-9) out.right = Math.min(out.right ?? Infinity, o.minX - sel.maxX);
    }
    if (overlap(sel.minX, sel.maxX, o.minX, o.maxX) >= 0.3 * Math.min(w, o.maxX - o.minX)) {
      if (o.maxY <= sel.minY + 1e-9) out.up = Math.min(out.up ?? Infinity, sel.minY - o.maxY);
      if (o.minY >= sel.maxY - 1e-9) out.down = Math.min(out.down ?? Infinity, o.minY - sel.maxY);
    }
  }
  return out;
}

/** ¿Las cajas se tocan? (para el rectángulo de selección). */
export function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}
