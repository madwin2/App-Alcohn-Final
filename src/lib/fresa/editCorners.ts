/**
 * Redondear vértices (como las esquinas vivas de Illustrator) y copiar/pegar
 * piezas dentro del editor de vectores. Todo puro sobre `EditDoc`.
 */
import { cloneDoc, flattenSub, pointInPolygon, type Box, type EditDoc, type EditPiece, type ENode, type EPath, type ESub, type NodeRef, type SubRef } from './editDoc';
import type { Pt } from './pathData';

interface Cubic { a: Pt; c1: Pt; c2: Pt; b: Pt }

const sub = (u: Pt, v: Pt): Pt => ({ x: u.x - v.x, y: u.y - v.y });
const add = (u: Pt, v: Pt): Pt => ({ x: u.x + v.x, y: u.y + v.y });
const mul = (u: Pt, s: number): Pt => ({ x: u.x * s, y: u.y * s });
const len = (u: Pt) => Math.hypot(u.x, u.y);
const lerp = (u: Pt, v: Pt, t: number): Pt => ({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
const last = (a: number[]) => a[a.length - 1];
const unit = (u: Pt): Pt | null => { const l = len(u); return l > 1e-12 ? { x: u.x / l, y: u.y / l } : null; };

/** Tramo del nodo k al siguiente (las manijas que faltan coinciden con el nodo: recta). */
function segment(s: ESub, k: number): Cubic {
  const n0 = s.nodes[k], n1 = s.nodes[(k + 1) % s.nodes.length];
  return { a: n0.p, c1: n0.o ?? n0.p, c2: n1.i ?? n1.p, b: n1.p };
}
const isLine = (c: Cubic, eps: number) => len(sub(c.c1, c.a)) < eps && len(sub(c.c2, c.b)) < eps;

function point(c: Cubic, t: number): Pt {
  const ab = lerp(c.a, c.c1, t), bc = lerp(c.c1, c.c2, t), cd = lerp(c.c2, c.b, t);
  return lerp(lerp(ab, bc, t), lerp(bc, cd, t), t);
}
/** De Casteljau: el tramo partido en t. */
function split(c: Cubic, t: number): [Cubic, Cubic] {
  const ab = lerp(c.a, c.c1, t), bc = lerp(c.c1, c.c2, t), cd = lerp(c.c2, c.b, t);
  const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), m = lerp(abc, bcd, t);
  return [{ a: c.a, c1: ab, c2: abc, b: m }, { a: m, c1: bcd, c2: cd, b: c.b }];
}
/** Largo acumulado del tramo, muestreado. */
function lengths(c: Cubic, n = 48): number[] {
  const out = [0];
  let prev = c.a;
  for (let i = 1; i <= n; i++) { const q = point(c, i / n); out.push(out[i - 1] + len(sub(q, prev))); prev = q; }
  return out;
}
/** Parámetro t donde el largo desde el inicio vale `l` (bisección sobre el largo real). */
function paramAt(c: Cubic, l: number): number {
  const total = last(lengths(c));
  if (l <= 0) return 0;
  if (l >= total) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (last(lengths(split(c, mid)[0], 32)) < l) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/** Dirección con la que el tramo llega a su final y con la que sale de su inicio. */
const endDir = (c: Cubic) => unit(sub(c.b, c.c2)) ?? unit(sub(c.b, c.c1)) ?? unit(sub(c.b, c.a));
const startDir = (c: Cubic) => unit(sub(c.c1, c.a)) ?? unit(sub(c.c2, c.a)) ?? unit(sub(c.b, c.a));

export interface CornerInfo {
  ref: NodeRef;
  /** Ángulo del vértice (grados): 180 = recto sin quiebre, chico = punta aguda. */
  angleDeg: number;
  /** Dirección de la bisectriz hacia adentro de la punta. */
  bisector: Pt;
  /** El radio más grande que entra sin pasarse de la mitad de los tramos vecinos (unidades). */
  maxRadius: number;
}

/** Datos del vértice para redondearlo (null si es un extremo abierto o no quiebra). */
export function cornerInfo(doc: EditDoc, ref: NodeRef, minTurnDeg = 2): CornerInfo | null {
  const s = doc.paths[ref.path]?.subs[ref.sub];
  // Un ojo en forma de hoja puede tener solo 2 nodos (dos curvas): también vale.
  if (!s || s.nodes.length < 2 || (s.nodes.length === 2 && !s.closed)) return null;
  const n = s.nodes.length, k = ref.node;
  if (!s.closed && (k === 0 || k === n - 1)) return null;
  const prev = segment(s, (k - 1 + n) % n), next = segment(s, k);
  const uIn = endDir(prev), uOut = startDir(next);
  if (!uIn || !uOut) return null;
  const turn = Math.acos(Math.max(-1, Math.min(1, uIn.x * uOut.x + uIn.y * uOut.y)));
  if (turn < (minTurnDeg * Math.PI) / 180) return null;
  const bis = unit(sub(uOut, uIn));
  if (!bis) return null;
  const lPrev = last(lengths(prev)), lNext = last(lengths(next));
  const maxL = 0.49 * Math.min(lPrev, lNext);
  return { ref, angleDeg: 180 - (turn * 180) / Math.PI, bisector: bis, maxRadius: maxL / Math.tan(turn / 2) };
}

/**
 * Redondea un vértice con un arco de radio `radius` (unidades del dibujo):
 * corta los dos tramos vecinos (rectos o curvos) donde el arco los toca y une
 * esos puntos con una curva tangente a ambos. Si el radio no entra, usa el
 * mayor posible. Devuelve el documento y el radio usado.
 */
export function roundCorner(doc: EditDoc, ref: NodeRef, radius: number): { doc: EditDoc; radius: number } | null {
  const info = cornerInfo(doc, ref);
  if (!info || !(radius > 0)) return null;
  const s = doc.paths[ref.path].subs[ref.sub];
  const n = s.nodes.length, k = ref.node, kp = (k - 1 + n) % n, kn = (k + 1) % n;
  const prev = segment(s, kp), next = segment(s, k);
  const uIn = endDir(prev)!, uOut = startDir(next)!;
  const turn = Math.acos(Math.max(-1, Math.min(1, uIn.x * uOut.x + uIn.y * uOut.y)));
  const r = Math.min(radius, info.maxRadius);
  if (!(r > 0)) return null;
  const L = r * Math.tan(turn / 2);
  const eps = 1e-9 * Math.max(1, len(prev.a));
  // Rectas: el punto exacto y siguen rectas. Curvas: se parten donde el largo vale L.
  const prevLine = isLine(prev, eps), nextLine = isLine(next, eps);
  const keepPrev: Cubic = prevLine ? { a: prev.a, c1: prev.a, c2: prev.b, b: sub(prev.b, mul(uIn, L)) }
    : split(prev, paramAt(prev, last(lengths(prev)) - L))[0];
  const keepNext: Cubic = nextLine ? { a: add(next.a, mul(uOut, L)), c1: next.b, c2: next.b, b: next.b }
    : split(next, paramAt(next, L))[1];
  if (prevLine) keepPrev.c2 = keepPrev.b;
  if (nextLine) keepNext.c1 = keepNext.a;
  // Manija de un arco circular de giro `turn` hecho con una cúbica.
  const h = (4 / 3) * Math.tan(turn / 4) * r;
  const A: ENode = { p: keepPrev.b, o: add(keepPrev.b, mul(uIn, h)) };
  const B: ENode = { p: keepNext.a, i: sub(keepNext.a, mul(uOut, h)) };
  if (!prevLine) A.i = keepPrev.c2;
  if (!nextLine) B.o = keepNext.c1;
  const nextDoc = cloneDoc(doc);
  const nodes = nextDoc.paths[ref.path].subs[ref.sub].nodes;
  // El vecino de atrás conserva su parte del tramo partido (o queda recto).
  if (!prevLine) nodes[kp].o = keepPrev.c1; else delete nodes[kp].o;
  if (!nextLine) nodes[kn].i = keepNext.c2; else delete nodes[kn].i;
  nodes.splice(k, 1, A, B);
  return { doc: nextDoc, radius: r };
}

/** Redondea varios vértices de una vez (de atrás para adelante: los índices no se corren). */
export function roundCorners(doc: EditDoc, refs: NodeRef[], radius: number): { doc: EditDoc; done: number } {
  const sorted = [...refs].sort((a, b) => a.path - b.path || a.sub - b.sub || b.node - a.node);
  let next = doc, done = 0;
  for (const ref of sorted) {
    const r = roundCorner(next, ref, radius);
    if (r) { next = r.doc; done++; }
  }
  return { doc: next, done };
}

/**
 * Vértices internos de las piezas: los que tienen la punta aguda del lado
 * blanco (la fresa no entra). Se mira un punto apenas adentro de la punta,
 * sobre la bisectriz; si cae fuera de lo negro, es interno.
 */
export function internalCorners(doc: EditDoc, pieces: EditPiece[], tol: number, maxAngleDeg = 150): CornerInfo[] {
  const out: CornerInfo[] = [];
  for (const piece of pieces) {
    const rings = piece.refs.map((r) => flattenSub(doc.paths[r.path].subs[r.sub], tol));
    const inBlack = (q: Pt) => rings.reduce((acc, ring) => acc + (pointInPolygon(q, ring) ? 1 : 0), 0) % 2 === 1;
    for (const r of piece.refs) {
      const s = doc.paths[r.path].subs[r.sub];
      s.nodes.forEach((_, node) => {
        const info = cornerInfo(doc, { ...r, node }, 20);
        if (!info || info.angleDeg > maxAngleDeg) return;
        const span = Math.min(info.maxRadius, tol * 40);
        const probe = add(s.nodes[node].p, mul(info.bisector, Math.max(span * 0.25, tol * 4)));
        if (!inBlack(probe)) out.push(info);
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ copiar y pegar

/** Lo copiado: los contornos con su relleno, en mm (para pegar en otro dibujo a otra escala). */
export interface VectorClip { paths: EPath[]; mmPerUnit: number; box: Box }

/** Copia los contornos elegidos (agrupados por el trazado de origen, que conserva el relleno). */
export function copyRefs(doc: EditDoc, refs: SubRef[], box: Box, mmPerUnit: number): VectorClip {
  const byPath = new Map<number, number[]>();
  for (const r of refs) byPath.set(r.path, [...(byPath.get(r.path) ?? []), r.sub]);
  const paths = [...byPath.entries()].sort((a, b) => a[0] - b[0]).map(([pi, subs]) => ({
    fillRule: doc.paths[pi].fillRule,
    subs: [...new Set(subs)].sort((a, b) => a - b).map((si) => JSON.parse(JSON.stringify(doc.paths[pi].subs[si])) as ESub),
  }));
  return { paths, mmPerUnit, box };
}

/**
 * Pega lo copiado al final del dibujo (queda arriba de todo), escalado a las
 * unidades de este dibujo y corrido `offsetMm` en x e y. Devuelve el índice
 * del primer trazado nuevo para elegir lo pegado.
 */
export function pasteClip(doc: EditDoc, clip: VectorClip, mmPerUnit: number, offsetMm: number, at?: Pt): { doc: EditDoc; firstNewPath: number } {
  const f = clip.mmPerUnit / mmPerUnit;
  const cx = (clip.box.minX + clip.box.maxX) / 2, cy = (clip.box.minY + clip.box.maxY) / 2;
  // Por defecto queda en el mismo lugar (convertido a este dibujo) más el corrimiento.
  const to = at ?? { x: cx * f, y: cy * f };
  const d = offsetMm / mmPerUnit;
  const map = (q: Pt): Pt => ({ x: (q.x - cx) * f + to.x + d, y: (q.y - cy) * f + to.y + d });
  const mapNode = (nd: ENode): ENode => ({ p: map(nd.p), ...(nd.i ? { i: map(nd.i) } : {}), ...(nd.o ? { o: map(nd.o) } : {}) });
  const next = cloneDoc(doc);
  const firstNewPath = next.paths.length;
  for (const p of clip.paths) next.paths.push({ fillRule: p.fillRule, subs: p.subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map(mapNode) })) });
  return { doc: next, firstNewPath };
}

// ------------------------------------------------------------------ girar y espejar

/** Aplica una transformación a los nodos y manijas de los contornos elegidos. */
export function mapRefs(doc: EditDoc, refs: SubRef[], f: (q: Pt) => Pt): EditDoc {
  const next = cloneDoc(doc);
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.path}:${r.sub}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = next.paths[r.path]?.subs[r.sub];
    if (!s) continue;
    s.nodes = s.nodes.map((n) => ({ p: f(n.p), ...(n.i ? { i: f(n.i) } : {}), ...(n.o ? { o: f(n.o) } : {}) }));
  }
  return next;
}

/** Gira lo elegido `deg` grados (positivo = horario en pantalla) alrededor del centro de su caja. */
export function rotateRefs(doc: EditDoc, refs: SubRef[], box: Box, deg: number): EditDoc {
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Redondeo fino para que 4 giros de 90° vuelvan exacto al original.
  const r6 = (v: number) => Math.round(v * 1e9) / 1e9 + 0; // + 0: sin «-0»
  return mapRefs(doc, refs, (q) => ({ x: r6(cx + (q.x - cx) * c - (q.y - cy) * s), y: r6(cy + (q.x - cx) * s + (q.y - cy) * c) }));
}

/** Espeja lo elegido sobre el centro de su caja: `x` = izquierda↔derecha, `y` = arriba↔abajo. */
export function mirrorRefs(doc: EditDoc, refs: SubRef[], box: Box, axis: 'x' | 'y'): EditDoc {
  const cx = box.minX + box.maxX, cy = box.minY + box.maxY;
  return mapRefs(doc, refs, (q) => (axis === 'x' ? { x: cx - q.x, y: q.y } : { x: q.x, y: cy - q.y }));
}
