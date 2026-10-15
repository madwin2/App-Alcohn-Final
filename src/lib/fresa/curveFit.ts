/**
 * Ajuste de curvas Bézier cúbicas a una polilínea (algoritmo de Philip J.
 * Schneider, "An Algorithm for Automatically Fitting Digitized Curves",
 * Graphics Gems, 1990). Es el mismo método que usan `simplify` de Paper.js y
 * de VectorCraft (`pathops`): mínimos cuadrados con re-parametrización de
 * Newton y división en el punto de mayor error.
 *
 * Se usa para simplificar nodos sin cambiar la forma (error máximo acotado) y
 * para devolver curvas suaves después de un offset (que Clipper da en polígonos).
 */
import type { Pt } from './pathData';

/** Una curva cúbica: inicio, dos controles, fin. */
export type Cubic = [Pt, Pt, Pt, Pt];

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const norm = (a: Pt): Pt => {
  const l = len(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

export function bezierPoint(b: Cubic, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const c = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return { x: a * b[0].x + c * b[1].x + d * b[2].x + e * b[3].x, y: a * b[0].y + c * b[1].y + d * b[2].y + e * b[3].y };
}

function bezierD1(b: Cubic, t: number): Pt {
  const mt = 1 - t;
  return add(add(mul(sub(b[1], b[0]), 3 * mt * mt), mul(sub(b[2], b[1]), 6 * mt * t)), mul(sub(b[3], b[2]), 3 * t * t));
}

function bezierD2(b: Cubic, t: number): Pt {
  return add(mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)), mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t));
}

function chordParams(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + dist(pts[i], pts[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function generateBezier(pts: Pt[], u: number[], t1: Pt, t2: Pt): Cubic {
  const first = pts[0];
  const last = pts[pts.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i];
    const mt = 1 - t;
    const b1 = 3 * t * mt * mt;
    const b2 = 3 * t * t * mt;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const b0 = mt * mt * mt;
    const b3 = t * t * t;
    const tmp = sub(pts[i], add(mul(first, b0 + b1), mul(last, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  const segLen = dist(first, last);
  const eps = 1e-6 * segLen;
  let alpha1 = 0;
  let alpha2 = 0;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  }
  // Alfas inválidos (negativos o casi cero): heurística de Wu/Barsky.
  if (alpha1 < eps || alpha2 < eps) {
    const d = segLen / 3;
    return [first, add(first, mul(t1, d)), add(last, mul(t2, d)), last];
  }
  return [first, add(first, mul(t1, alpha1)), add(last, mul(t2, alpha2)), last];
}

function maxError(pts: Pt[], b: Cubic, u: number[]): { err: number; index: number } {
  let err = 0;
  let index = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bezierPoint(b, u[i]), pts[i]);
    if (d > err) {
      err = d;
      index = i;
    }
  }
  return { err, index };
}

function reparameterize(b: Cubic, pts: Pt[], u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bezierPoint(b, t), pts[i]);
    const d1 = bezierD1(b, t);
    const d2 = bezierD2(b, t);
    const num = dot(d, d1);
    const den = dot(d1, d1) + dot(d, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.min(1, Math.max(0, t - num / den));
  });
}

function fitRange(pts: Pt[], t1: Pt, t2: Pt, error: number, out: Cubic[], depth: number): void {
  if (pts.length === 2) {
    const d = dist(pts[0], pts[1]) / 3;
    out.push([pts[0], add(pts[0], mul(t1, d)), add(pts[1], mul(t2, d)), pts[1]]);
    return;
  }
  let u = chordParams(pts);
  let bez = generateBezier(pts, u, t1, t2);
  let { err, index } = maxError(pts, bez, u);
  if (err <= error) {
    out.push(bez);
    return;
  }
  // Re-parametrizar (Newton) casi siempre ayuda; si el error es enorme, igual
  // hay que partir, así que no vale la pena insistir.
  if (err <= error * 50) {
    for (let k = 0; k < 20; k++) {
      const u2 = reparameterize(bez, pts, u);
      const b2 = generateBezier(pts, u2, t1, t2);
      const e2 = maxError(pts, b2, u2);
      u = u2;
      bez = b2;
      err = e2.err;
      index = e2.index;
      if (err <= error) {
        out.push(bez);
        return;
      }
    }
  }
  if (depth > 40 || index <= 0 || index >= pts.length - 1) {
    out.push(bez);
    return;
  }
  // Partir en el punto de mayor error, con tangente común en el corte.
  let center = norm(sub(pts[index - 1], pts[index + 1]));
  if (len(center) === 0) center = norm(sub(pts[index - 1], pts[index]));
  fitRange(pts.slice(0, index + 1), t1, center, error, out, depth + 1);
  fitRange(pts.slice(index), mul(center, -1), t2, error, out, depth + 1);
}

/**
 * Ajusta curvas a una polilínea abierta (de un extremo al otro, que se
 * conservan). `error`: distancia máxima admitida, en las mismas unidades.
 */
export function fitCubics(points: Pt[], error: number): Cubic[] {
  const pts = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 1e-9);
  if (pts.length < 2) return [];
  const t1 = norm(sub(pts[1], pts[0]));
  const t2 = norm(sub(pts[pts.length - 2], pts[pts.length - 1]));
  const out: Cubic[] = [];
  fitRange(pts, t1, t2, error, out, 0);
  return out;
}

/** ¿Una cúbica es (casi) una recta? Sus controles están a menos de `tol` de la cuerda. */
export function isNearlyStraight(b: Cubic, tol: number): boolean {
  const d = sub(b[3], b[0]);
  const l = len(d);
  if (l < 1e-12) return dist(b[1], b[0]) <= tol && dist(b[2], b[0]) <= tol;
  const off = (p: Pt) => Math.abs((p.x - b[0].x) * d.y - (p.y - b[0].y) * d.x) / l;
  const along = (p: Pt) => dot(sub(p, b[0]), d) / (l * l);
  const inside = (p: Pt) => along(p) >= -0.01 && along(p) <= 1.01;
  return off(b[1]) <= tol && off(b[2]) <= tol && inside(b[1]) && inside(b[2]);
}

/**
 * Esquinas de una polilínea cerrada o abierta: puntos donde la dirección gira
 * más que `angleDeg`. Se miran tramos de `window` puntos a cada lado para no
 * confundir el ruido de una curva bien muestreada con una esquina.
 */
export function cornerIndices(pts: Pt[], closed: boolean, angleDeg = 35): number[] {
  const n = pts.length;
  const out: number[] = [];
  const cosLim = Math.cos((angleDeg * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const a = norm(sub(pts[i], prev));
    const b = norm(sub(next, pts[i]));
    if (len(a) === 0 || len(b) === 0) continue;
    if (dot(a, b) < cosLim) out.push(i);
  }
  return out;
}
