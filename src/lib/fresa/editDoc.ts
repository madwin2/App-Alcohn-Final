/**
 * Vector editable para las operaciones manuales del chequeo de fresa.
 *
 * El SVG se pasa a un modelo de **nodos con manijas** (como Illustrator):
 * cada sub-trayecto es una lista de nodos; cada nodo tiene su punto y, si la
 * curva lo pide, una manija de entrada (`i`) y una de salida (`o`). Sin
 * manijas, el tramo es recto. Todo en unidades del viewBox raíz, con las
 * transformaciones ya aplicadas.
 *
 * Las "piezas" son lo que el usuario ve como un vector suelto: un contorno de
 * afuera con sus agujeros (una letra con su ojo). Sobre ellas se hacen las
 * operaciones: mover, escalar, offset, borrar, mover y borrar nodos,
 * simplificar.
 *
 * Solo para SVG de "pintura simple" (rellenos oscuros, sin blancos ni trazos),
 * que es lo que sale de Vectorizer.AI e Illustrator.
 */
import { FillRule } from 'clipper2-ts';
import { bezierPoint, fitCubics, isNearlyStraight, type Cubic } from './curveFit';
import { UM, intersect, offset as offsetRegion, toPath64, union, type Paths64 } from './geometry';
import { absoluteSubpaths, flattenPathData, parsePointList, type AbsSegment, type Pt } from './pathData';
import { applyMatrix, multiply, parseSvgShapes, parseTransform, type Matrix } from './svgShapes';

export interface ENode {
  p: Pt;
  /** Manija de entrada (desde el nodo anterior). */
  i?: Pt;
  /** Manija de salida (hacia el nodo siguiente). */
  o?: Pt;
}

export interface ESub {
  closed: boolean;
  nodes: ENode[];
}

export interface EPath {
  fillRule: 'nonzero' | 'evenodd';
  subs: ESub[];
}

export interface EditDoc {
  width: string | null;
  height: string | null;
  viewBox: string | null;
  paths: EPath[];
}

export interface SubRef {
  path: number;
  sub: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface EditPiece {
  id: number;
  /** Contorno de afuera primero; después sus agujeros (y lo que haya adentro). */
  refs: SubRef[];
  bounds: Box;
  /** Contorno de afuera aplanado (para tocar con el mouse). */
  outer: Pt[];
  /** Área aproximada (unidades²): afuera menos agujeros. */
  area: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: Pt, b: Pt, eps: number) => dist(a, b) <= eps;

// ---------------------------------------------------------------- arcos → cúbicas

function arcToCubics(p0: Pt, rxIn: number, ryIn: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt): Cubic[] {
  if (p0.x === p1.x && p0.y === p1.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [[p0, p0, p1, p1]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
  const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  else if (sweep && dth < 0) dth += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
  const d = dth / segs;
  const k = (4 / 3) * Math.tan(d / 4);
  const onEllipse = (t: number): Pt => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const deriv = (t: number): Pt => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });
  const out: Cubic[] = [];
  for (let s = 0; s < segs; s++) {
    const a = th1 + s * d;
    const b = a + d;
    const pa = s === 0 ? p0 : onEllipse(a);
    const pb = s === segs - 1 ? p1 : onEllipse(b);
    const da = deriv(a);
    const db = deriv(b);
    out.push([pa, { x: pa.x + k * da.x, y: pa.y + k * da.y }, { x: pb.x - k * db.x, y: pb.y - k * db.y }, pb]);
  }
  return out;
}

// ---------------------------------------------------------------- SVG → modelo

function subsFromAbs(abs: AbsSegment[][]): ESub[] {
  const out: ESub[] = [];
  for (const segs of abs) {
    const nodes: ENode[] = [];
    let closed = false;
    for (const s of segs) {
      const last = nodes[nodes.length - 1];
      switch (s.c) {
        case 'M':
          nodes.push({ p: { x: s.v[0], y: s.v[1] } });
          break;
        case 'L':
          nodes.push({ p: { x: s.v[0], y: s.v[1] } });
          break;
        case 'C':
          if (last) last.o = { x: s.v[0], y: s.v[1] };
          nodes.push({ p: { x: s.v[4], y: s.v[5] }, i: { x: s.v[2], y: s.v[3] } });
          break;
        case 'Q': {
          if (!last) break;
          const q = { x: s.v[0], y: s.v[1] };
          const p = { x: s.v[2], y: s.v[3] };
          last.o = { x: last.p.x + (2 / 3) * (q.x - last.p.x), y: last.p.y + (2 / 3) * (q.y - last.p.y) };
          nodes.push({ p, i: { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) } });
          break;
        }
        case 'A': {
          if (!last) break;
          const cubics = arcToCubics(last.p, s.v[0], s.v[1], s.v[2], s.v[3] === 1, s.v[4] === 1, { x: s.v[5], y: s.v[6] });
          for (const c of cubics) {
            nodes[nodes.length - 1].o = c[1];
            nodes.push({ p: c[3], i: c[2] });
          }
          break;
        }
        case 'Z':
          closed = true;
          break;
      }
    }
    if (nodes.length < 2) continue;
    if (closed && nodes.length > 2 && near(nodes[0].p, nodes[nodes.length - 1].p, 1e-9)) {
      const lastNode = nodes.pop()!;
      nodes[0].i = lastNode.i;
    }
    for (const n of nodes) {
      if (n.i && near(n.i, n.p, 1e-12)) delete n.i;
      if (n.o && near(n.o, n.p, 1e-12)) delete n.o;
    }
    out.push({ closed, nodes });
  }
  return out;
}

function elementSubs(el: Element): ESub[] {
  const num = (name: string, fallback = 0) => {
    const v = parseFloat(el.getAttribute(name) ?? '');
    return Number.isFinite(v) ? v : fallback;
  };
  const tag = el.localName.toLowerCase();
  switch (tag) {
    case 'path':
      return subsFromAbs(absoluteSubpaths(el.getAttribute('d') ?? ''));
    case 'polygon':
    case 'polyline': {
      const pts = parsePointList(el.getAttribute('points') ?? '');
      return pts.length >= 2 ? [{ closed: true, nodes: pts.map((p) => ({ p })) }] : [];
    }
    case 'rect': {
      const x = num('x');
      const y = num('y');
      const w = num('width');
      const h = num('height');
      let rx = Math.max(0, num('rx'));
      let ry = Math.max(0, num('ry'));
      if (rx === 0 && ry > 0) rx = ry;
      if (ry === 0 && rx > 0) ry = rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!(w > 0 && h > 0)) return [];
      if (!rx || !ry) {
        return [{ closed: true, nodes: [{ p: { x, y } }, { p: { x: x + w, y } }, { p: { x: x + w, y: y + h } }, { p: { x, y: y + h } }] }];
      }
      const d = `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
      return subsFromAbs(absoluteSubpaths(d));
    }
    case 'circle':
    case 'ellipse': {
      const cx = num('cx');
      const cy = num('cy');
      const rx = tag === 'circle' ? num('r') : num('rx');
      const ry = tag === 'circle' ? num('r') : num('ry');
      if (!(rx > 0 && ry > 0)) return [];
      const d = `M${cx + rx},${cy}A${rx},${ry} 0 1 1 ${cx - rx},${cy}A${rx},${ry} 0 1 1 ${cx + rx},${cy}Z`;
      return subsFromAbs(absoluteSubpaths(d));
    }
    default:
      return [];
  }
}

function transformSub(sub: ESub, m: Matrix): ESub {
  const t = (p?: Pt) => (p ? applyMatrix(m, p) : undefined);
  return {
    closed: sub.closed,
    nodes: sub.nodes.map((n) => {
      const out: ENode = { p: applyMatrix(m, n.p) };
      if (n.i) out.i = t(n.i);
      if (n.o) out.o = t(n.o);
      return out;
    }),
  };
}

function ctmOf(el: Element, root: Element): Matrix {
  const chain: Element[] = [];
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) chain.push(e);
  let m = IDENTITY;
  for (let k = chain.length - 1; k >= 0; k--) m = multiply(m, parseTransform(chain[k].getAttribute('transform')));
  return m;
}

export type BuildResult = { ok: true; doc: EditDoc; warnings: string[] } | { ok: false; error: string };

/** Lee un SVG para editarlo. */
export function buildEditDoc(svgText: string): BuildResult {
  let parsed;
  try {
    parsed = parseSvgShapes(svgText);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer el SVG.' };
  }
  if (parsed.shapes.some((s) => s.fill === 'light' || s.stroke !== 'none')) {
    return {
      ok: false,
      error:
        'Este SVG tiene rellenos blancos o trazos (stroke): la edición manual solo funciona con rellenos negros. Se puede corregir en Illustrator.',
    };
  }
  const root = parsed.doc.documentElement;
  const paths: EPath[] = [];
  for (const shape of parsed.shapes) {
    if (shape.fill !== 'dark') continue;
    const el = parsed.elements[shape.index];
    if (!el) continue;
    const m = ctmOf(el, root);
    const subs = elementSubs(el).map((s) => transformSub(s, m));
    if (subs.length) paths.push({ fillRule: shape.fillRule, subs });
  }
  if (!paths.length) return { ok: false, error: 'El SVG no tiene figuras para editar.' };
  return {
    ok: true,
    doc: {
      width: root.getAttribute('width'),
      height: root.getAttribute('height'),
      viewBox: root.getAttribute('viewBox'),
      paths,
    },
    warnings: parsed.warnings,
  };
}

// ---------------------------------------------------------------- modelo → SVG

const fmt = (n: number) => {
  const s = n.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};
const pt = (p: Pt) => `${fmt(p.x)} ${fmt(p.y)}`;

function segD(a: ENode, b: ENode): string {
  if (!a.o && !b.i) return `L${pt(b.p)}`;
  return `C${pt(a.o ?? a.p)} ${pt(b.i ?? b.p)} ${pt(b.p)}`;
}

export function subToD(sub: ESub): string {
  const n = sub.nodes;
  if (!n.length) return '';
  let d = `M${pt(n[0].p)}`;
  for (let k = 1; k < n.length; k++) d += segD(n[k - 1], n[k]);
  if (sub.closed) {
    if (n.length > 1 && (n[n.length - 1].o || n[0].i)) d += segD(n[n.length - 1], n[0]);
    d += 'Z';
  }
  return d;
}

export function pathToD(path: EPath): string {
  return path.subs.map(subToD).join('');
}

/** SVG del modelo: misma medida (width/height/viewBox) que el original. */
export function serializeEditDoc(doc: EditDoc): string {
  const attrs = [
    'xmlns="http://www.w3.org/2000/svg"',
    doc.width ? `width="${doc.width}"` : '',
    doc.height ? `height="${doc.height}"` : '',
    doc.viewBox ? `viewBox="${doc.viewBox}"` : '',
    'version="1.1"',
  ]
    .filter(Boolean)
    .join(' ');
  const body = doc.paths
    .filter((p) => p.subs.length)
    .map((p) => `<path fill="#000000" fill-rule="${p.fillRule}" d="${pathToD(p)}"/>`)
    .join('');
  return `<svg ${attrs}>${body}</svg>`;
}

export function cloneDoc(doc: EditDoc): EditDoc {
  return {
    ...doc,
    paths: doc.paths.map((p) => ({
      fillRule: p.fillRule,
      subs: p.subs.map((s) => ({
        closed: s.closed,
        nodes: s.nodes.map((n) => ({ p: { ...n.p }, i: n.i ? { ...n.i } : undefined, o: n.o ? { ...n.o } : undefined })),
      })),
    })),
  };
}

// ---------------------------------------------------------------- piezas

function polyArea(pts: Pt[]): number {
  let a = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function polyBounds(pts: Pt[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const containsBox = (o: Box, i: Box) => o.minX <= i.minX && o.minY <= i.minY && o.maxX >= i.maxX && o.maxY >= i.maxY;

/** Polilínea de un sub-trayecto (cerrado). `tol`: error de aplanado (unidades). */
export function flattenSub(sub: ESub, tol: number): Pt[] {
  const d = subToD({ ...sub, closed: true });
  return flattenPathData(d, tol)[0]?.points ?? sub.nodes.map((n) => n.p);
}

/** Agrupa los sub-trayectos en piezas: cada contorno de afuera con lo que tiene adentro. */
export function computePieces(doc: EditDoc, tol: number): EditPiece[] {
  type Item = { ref: SubRef; poly: Pt[]; b: Box; area: number };
  const items: Item[] = [];
  doc.paths.forEach((path, pi) =>
    path.subs.forEach((sub, si) => {
      const poly = flattenSub(sub, tol);
      if (poly.length < 3) return;
      items.push({ ref: { path: pi, sub: si }, poly, b: polyBounds(poly), area: polyArea(poly) });
    }),
  );
  // Padre directo: el contorno más chico que lo contiene.
  const parent = items.map((it, k) => {
    let best = -1;
    for (let j = 0; j < items.length; j++) {
      if (j === k) continue;
      const o = items[j];
      if (o.area <= it.area || !containsBox(o.b, it.b)) continue;
      if (!pointInPolygon(it.poly[0], o.poly)) continue;
      if (best < 0 || o.area < items[best].area) best = j;
    }
    return best;
  });
  // Profundidad: 0 = contorno de afuera, 1 = agujero, 2 = isla adentro de un
  // agujero (otra pieza: una letra adentro de un aro), 3 = su agujero…
  const depth = (k: number): number => (parent[k] < 0 ? 0 : 1 + depth(parent[k]));
  const groups = new Map<number, number[]>();
  items.forEach((_, k) => {
    const root = depth(k) % 2 === 0 ? k : parent[k];
    const list = groups.get(root) ?? [];
    if (root === k) list.unshift(k);
    else list.push(k);
    groups.set(root, list);
  });
  const pieces: EditPiece[] = [];
  for (const [root, ks] of groups) {
    const area = ks.reduce((acc, k) => acc + (k === root ? items[k].area : -items[k].area), 0);
    pieces.push({ id: pieces.length, refs: ks.map((k) => items[k].ref), bounds: items[root].b, outer: items[root].poly, area: Math.max(0, area) });
  }
  return pieces;
}

/** La pieza bajo el punto (la más chica si hay varias). */
export function pieceAt(pieces: EditPiece[], p: Pt, pad = 0): EditPiece | null {
  let best: EditPiece | null = null;
  for (const pc of pieces) {
    const b = pc.bounds;
    if (p.x < b.minX - pad || p.x > b.maxX + pad || p.y < b.minY - pad || p.y > b.maxY + pad) continue;
    if (!pointInPolygon(p, pc.outer) && pad === 0) continue;
    const a = (b.maxX - b.minX) * (b.maxY - b.minY);
    if (!best || a < (best.bounds.maxX - best.bounds.minX) * (best.bounds.maxY - best.bounds.minY)) best = pc;
  }
  return best;
}

// ---------------------------------------------------------------- operaciones

const refKey = (r: SubRef) => `${r.path}:${r.sub}`;

function mapPoints(doc: EditDoc, refs: SubRef[], f: (p: Pt) => Pt): EditDoc {
  const next = cloneDoc(doc);
  for (const r of refs) {
    const sub = next.paths[r.path]?.subs[r.sub];
    if (!sub) continue;
    for (const n of sub.nodes) {
      n.p = f(n.p);
      if (n.i) n.i = f(n.i);
      if (n.o) n.o = f(n.o);
    }
  }
  return next;
}

export function translateRefs(doc: EditDoc, refs: SubRef[], dx: number, dy: number): EditDoc {
  return mapPoints(doc, refs, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Escala pareja (sin deformar) alrededor del centro de la caja `b`. */
export function scaleRefs(doc: EditDoc, refs: SubRef[], f: number, b: Box): EditDoc {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return mapPoints(doc, refs, (p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));
}

/** Escala pareja (sin deformar) alrededor del punto (cx, cy): tiradores de las esquinas. */
export function scaleRefsAt(doc: EditDoc, refs: SubRef[], f: number, cx: number, cy: number): EditDoc {
  return mapPoints(doc, refs, (p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));
}

/** Saca sub-trayectos (y los caminos que queden vacíos). */
export function removeRefs(doc: EditDoc, refs: SubRef[]): EditDoc {
  const kill = new Set(refs.map(refKey));
  const next = cloneDoc(doc);
  next.paths = next.paths
    .map((p, pi) => ({ ...p, subs: p.subs.filter((_, si) => !kill.has(`${pi}:${si}`)) }))
    .filter((p) => p.subs.length);
  return next;
}

/**
 * Convierte una polilínea cerrada (de Clipper) en nodos con curvas: corta en
 * las esquinas y ajusta curvas entre esquinas con error máximo `tol`.
 */
export function fitClosedRing(ring: Pt[], tol: number): ESub | null {
  const pts = ring.filter((p, k) => k === 0 || dist(p, ring[k - 1]) > tol * 0.01);
  if (pts.length < 3) return null;
  // Mismo método que «Simplificar»: forma mínima, esquinas reales (también las
  // redondeadas) y curvas controladas contra el contorno exacto, así nunca se
  // sale de la forma. Si no ahorra nodos, queda el polígono tal cual.
  const poly: ESub = { closed: true, nodes: pts.map((p) => ({ p })) };
  return simplifySub(poly, tol) ?? poly;
}

/** Un contorno cerrado necesita 3 nodos, o 2 si hay curvas (un círculo en dos mitades). */
function validClosed(nodes: ENode[]): boolean {
  if (nodes.length >= 3) return true;
  return nodes.length === 2 && nodes.some((n) => n.i || n.o);
}

/** Región (Clipper, en µm) de una pieza, respetando el relleno de cada trazado. */
function pieceRegion(doc: EditDoc, piece: EditPiece, mmPerUnit: number, tolMm: number): Paths64 {
  const flatTol = tolMm / 3 / mmPerUnit;
  const byRule = new Map<string, Paths64>();
  for (const r of piece.refs) {
    const path = doc.paths[r.path];
    const sub = path?.subs[r.sub];
    if (!sub) continue;
    const list = byRule.get(path.fillRule) ?? [];
    list.push(toPath64(flattenSub(sub, flatTol), mmPerUnit));
    byRule.set(path.fillRule, list);
  }
  let region: Paths64 = [];
  for (const [rule, paths] of byRule) region = union(region, union(paths, null, rule === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero));
  return region;
}

/** Contornos nuevos de una pieza con offset (null si desaparece). */
function offsetSubs(doc: EditDoc, piece: EditPiece, deltaMm: number, mmPerUnit: number, tolMm: number): ESub[] | null {
  const flatTol = tolMm / 3 / mmPerUnit;
  const byRule = new Map<string, Paths64>();
  for (const r of piece.refs) {
    const path = doc.paths[r.path];
    const sub = path?.subs[r.sub];
    if (!sub) continue;
    const list = byRule.get(path.fillRule) ?? [];
    list.push(toPath64(flattenSub(sub, flatTol), mmPerUnit));
    byRule.set(path.fillRule, list);
  }
  let region: Paths64 = [];
  for (const [rule, paths] of byRule) {
    region = union(region, union(paths, null, rule === 'evenodd' ? FillRule.EvenOdd : FillRule.NonZero));
  }
  const grown = offsetRegion(region, Math.round(deltaMm * UM));
  if (!grown.length) return null;
  const subs: ESub[] = [];
  for (const ring of grown) {
    const pts = ring.map((q) => ({ x: q.x / (mmPerUnit * UM), y: q.y / (mmPerUnit * UM) }));
    const s = fitClosedRing(pts, tolMm / mmPerUnit);
    if (s) subs.push(s);
  }
  return subs.length ? subs : null;
}

/**
 * Offset en paralelo de una o varias piezas (`deltaMm` > 0 engorda, < 0
 * afina). Cada pieza se reemplaza por su resultado, con curvas suaves (error
 * < `tolMm`). Todas se calculan sobre el dibujo original, así que el orden no
 * importa. Devuelve null si alguna desaparece (afinar de más).
 */
export function offsetPieces(
  doc: EditDoc,
  pieces: EditPiece[],
  deltaMm: number,
  mmPerUnit: number,
  tolMm = 0.01,
): { doc: EditDoc; firstNewPath: number } | null {
  const results: ESub[][] = [];
  for (const pc of pieces) {
    const subs = offsetSubs(doc, pc, deltaMm, mmPerUnit, tolMm);
    if (!subs) return null;
    results.push(subs);
  }
  let next = removeRefs(
    doc,
    pieces.flatMap((p) => p.refs),
  );
  const firstNewPath = next.paths.length;
  for (const subs of results) next.paths.push({ fillRule: 'nonzero', subs });
  // Las rectas del offset salen partidas en varios tramos: se juntan.
  const refs = results.flatMap((subs, k) => subs.map((_, si) => ({ path: firstNewPath + k, sub: si })));
  next = removeRedundant(next, (tolMm * 0.2) / mmPerUnit, refs).doc;
  return { doc: next, firstNewPath };
}

/**
 * Une varias piezas en una sola (como «Unir» de Illustrator): lo que se pisa
 * queda una sola figura, con los agujeros que correspondan. El contorno se
 * vuelve a ajustar con curvas (error < `tolMm`). Null si no hay nada que unir.
 */
export function unionPieces(doc: EditDoc, pieces: EditPiece[], mmPerUnit: number, tolMm = 0.01): { doc: EditDoc; firstNewPath: number; merged: number } | null {
  if (pieces.length < 2) return null;
  // Solo se juntan las que de verdad se pisan o se tocan: las sueltas quedan intactas
  // (no se les rehacen las curvas). Grupos por contacto, transitivos.
  const regions = pieces.map((p) => offsetRegion(pieceRegion(doc, p, mmPerUnit, tolMm), 1));
  const group = pieces.map((_, i) => i);
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
  for (let a = 0; a < pieces.length; a++) for (let b = a + 1; b < pieces.length; b++) {
    const A = pieces[a].bounds, B = pieces[b].bounds;
    if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) continue;
    if (intersect(regions[a], regions[b]).length) group[find(a)] = find(b);
  }
  const groups = new Map<number, EditPiece[]>();
  pieces.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  const toMerge = [...groups.values()].filter((g) => g.length > 1);
  if (!toMerge.length) return null;
  const results: ESub[][] = [];
  for (const g of toMerge) {
    const subs = offsetSubs(doc, { ...g[0], refs: g.flatMap((p) => p.refs) }, 0, mmPerUnit, tolMm);
    if (subs) results.push(subs);
  }
  if (!results.length) return null;
  let next = removeRefs(doc, toMerge.flat().flatMap((p) => p.refs));
  const firstNewPath = next.paths.length;
  for (const subs of results) next.paths.push({ fillRule: 'nonzero', subs });
  const refs = results.flatMap((subs, k) => subs.map((_, si) => ({ path: firstNewPath + k, sub: si })));
  next = removeRedundant(next, (tolMm * 0.2) / mmPerUnit, refs).doc;
  return { doc: next, firstNewPath, merged: toMerge.reduce((n, g) => n + g.length, 0) };
}

/** Offset de una sola pieza (ver `offsetPieces`). */
export function offsetPiece(doc: EditDoc, piece: EditPiece, deltaMm: number, mmPerUnit: number, tolMm = 0.01): EditDoc | null {
  return offsetPieces(doc, [piece], deltaMm, mmPerUnit, tolMm)?.doc ?? null;
}

export type NodePart = 'p' | 'i' | 'o';

export interface NodeRef extends SubRef {
  node: number;
}

/** ¿El nodo es "suave" (manijas alineadas, como en una curva sin quiebre)? */
export function isSmooth(n: ENode, angleDeg = 6): boolean {
  if (!n.i || !n.o) return false;
  const a = { x: n.p.x - n.i.x, y: n.p.y - n.i.y };
  const b = { x: n.o.x - n.p.x, y: n.o.y - n.p.y };
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (!la || !lb) return false;
  return (a.x * b.x + a.y * b.y) / (la * lb) >= Math.cos((angleDeg * Math.PI) / 180);
}

/**
 * Mueve un nodo o una de sus manijas a `to`. El nodo arrastra sus manijas;
 * en un nodo suave, mover una manija gira la otra (sin cambiar su largo) para
 * que la curva siga sin quiebre.
 */
export function moveNodePart(doc: EditDoc, ref: NodeRef, part: NodePart, to: Pt): EditDoc {
  const next = cloneDoc(doc);
  const n = next.paths[ref.path]?.subs[ref.sub]?.nodes[ref.node];
  if (!n) return doc;
  if (part === 'p') {
    const dx = to.x - n.p.x;
    const dy = to.y - n.p.y;
    n.p = { ...to };
    if (n.i) n.i = { x: n.i.x + dx, y: n.i.y + dy };
    if (n.o) n.o = { x: n.o.x + dx, y: n.o.y + dy };
    return next;
  }
  const smooth = isSmooth(doc.paths[ref.path].subs[ref.sub].nodes[ref.node]);
  n[part] = { ...to };
  const other: NodePart = part === 'i' ? 'o' : 'i';
  const o = n[other];
  if (smooth && o) {
    const vx = n.p.x - to.x;
    const vy = n.p.y - to.y;
    const l = Math.hypot(vx, vy);
    const keep = Math.hypot(o.x - n.p.x, o.y - n.p.y);
    if (l > 0) n[other] = { x: n.p.x + (vx / l) * keep, y: n.p.y + (vy / l) * keep };
  }
  return next;
}

/** Nodo en esquina: sin manijas (los tramos que llegan a él quedan rectos de su lado). */
export function setNodeCorner(doc: EditDoc, ref: NodeRef): EditDoc {
  const next = cloneDoc(doc);
  const n = next.paths[ref.path]?.subs[ref.sub]?.nodes[ref.node];
  if (!n) return doc;
  delete n.i;
  delete n.o;
  return next;
}

/**
 * Nodo suave: manijas alineadas con la dirección de vecino a vecino, de un
 * tercio de cada tramo (como una curva que pasa por los tres puntos).
 */
export function setNodeSmooth(doc: EditDoc, ref: NodeRef): EditDoc {
  const sub = doc.paths[ref.path]?.subs[ref.sub];
  if (!sub) return doc;
  const nodes = sub.nodes;
  const k = ref.node;
  const prev = sub.closed || k > 0 ? nodes[(k - 1 + nodes.length) % nodes.length] : null;
  const nxt = sub.closed || k < nodes.length - 1 ? nodes[(k + 1) % nodes.length] : null;
  const n = nodes[k];
  const a = prev?.p ?? n.p;
  const b = nxt?.p ?? n.p;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (!l) return doc;
  const ux = dx / l;
  const uy = dy / l;
  const next = cloneDoc(doc);
  const m = next.paths[ref.path].subs[ref.sub].nodes[k];
  if (prev) {
    const li = dist(prev.p, n.p) / 3;
    m.i = { x: n.p.x - ux * li, y: n.p.y - uy * li };
  }
  if (nxt) {
    const lo = dist(nxt.p, n.p) / 3;
    m.o = { x: n.p.x + ux * lo, y: n.p.y + uy * lo };
  }
  return next;
}

/** Borra un nodo; los vecinos conservan sus manijas. Si el contorno queda muy chico, se borra entero. */
export function deleteNode(doc: EditDoc, ref: NodeRef): EditDoc {
  const sub = doc.paths[ref.path]?.subs[ref.sub];
  if (!sub) return doc;
  if (sub.nodes.length <= (sub.closed ? 3 : 2)) return removeRefs(doc, [ref]);
  const next = cloneDoc(doc);
  next.paths[ref.path].subs[ref.sub].nodes.splice(ref.node, 1);
  return next;
}

export function countNodes(doc: EditDoc, refs?: SubRef[]): number {
  const subs = refs
    ? refs.map((r) => doc.paths[r.path]?.subs[r.sub]).filter((s): s is ESub => !!s)
    : doc.paths.flatMap((p) => p.subs);
  return subs.reduce((a, s) => a + s.nodes.length, 0);
}

/**
 * Nodos que sobran y se pueden sacar sin cambiar la forma: repetidos (encima
 * del anterior) o en medio de un tramo recto (sin manijas y alineado con sus
 * vecinos).
 */
export function redundantNodes(
  doc: EditDoc,
  eps: number,
  refs?: SubRef[],
): Array<NodeRef & { kind: 'repetido' | 'recto' }> {
  const out: Array<NodeRef & { kind: 'repetido' | 'recto' }> = [];
  const list = refs ?? doc.paths.flatMap((p, pi) => p.subs.map((_, si) => ({ path: pi, sub: si })));
  for (const r of list) {
    const sub = doc.paths[r.path]?.subs[r.sub];
    if (!sub) continue;
    const n = sub.nodes;
    const min = sub.closed ? 3 : 2;
    let removable = n.length - min;
    for (let k = 0; k < n.length && removable > 0; k++) {
      if (!sub.closed && (k === 0 || k === n.length - 1)) continue;
      const prev = n[(k - 1 + n.length) % n.length];
      const cur = n[k];
      const nxt = n[(k + 1) % n.length];
      const dup = near(prev.p, cur.p, eps) && !cur.i && !prev.o;
      const straight =
        !cur.i && !cur.o && !prev.o && !nxt.i && pointLineDistance(cur.p, prev.p, nxt.p) <= eps && between(cur.p, prev.p, nxt.p);
      if (dup || straight) {
        out.push({ ...r, node: k, kind: dup ? 'repetido' : 'recto' });
        removable--;
        k++; // no sacar dos seguidos en una pasada
      }
    }
  }
  return out;
}

function pointLineDistance(p: Pt, a: Pt, b: Pt): number {
  const l = dist(a, b);
  if (l < 1e-12) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / l;
}

function between(p: Pt, a: Pt, b: Pt): boolean {
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (dist(a, b) ** 2 || 1);
  return t >= -1e-6 && t <= 1 + 1e-6;
}

/** Saca los nodos que sobran (sin cambiar la forma). Repite hasta que no quede ninguno. */
export function removeRedundant(doc: EditDoc, eps: number, refs?: SubRef[]): { doc: EditDoc; removed: number } {
  let current = doc;
  let removed = 0;
  for (let round = 0; round < 50; round++) {
    const found = redundantNodes(current, eps, refs);
    if (!found.length) break;
    const next = cloneDoc(current);
    // De atrás para adelante para no correr índices.
    const bySub = new Map<string, Array<{ node: number; kind: 'repetido' | 'recto' }>>();
    for (const f of found) bySub.set(refKey(f), [...(bySub.get(refKey(f)) ?? []), { node: f.node, kind: f.kind }]);
    for (const [key, list] of bySub) {
      const [pi, si] = key.split(':').map(Number);
      const nodes = next.paths[pi].subs[si].nodes;
      for (const { node: k, kind } of list.sort((a, b) => b.node - a.node)) {
        // Un nodo repetido le pasa su manija de salida al anterior (si no, la
        // curva que sigue perdería su forma).
        if (kind === 'repetido' && nodes[k].o) {
          const prev = nodes[(k - 1 + nodes.length) % nodes.length];
          prev.o = nodes[k].o;
        }
        nodes.splice(k, 1);
      }
    }
    removed += found.length;
    current = next;
  }
  return { doc: current, removed };
}

/** Muestras de un tramo entre dos nodos (incluye el inicio, no el fin). */
function sampleSegment(a: ENode, b: ENode, tol: number): Pt[] {
  if (!a.o && !b.i) return [a.p];
  const c: Cubic = [a.p, a.o ?? a.p, b.i ?? b.p, b.p];
  const poly = dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]);
  const steps = Math.max(4, Math.min(96, Math.ceil(poly / Math.max(tol, 1e-9) / 2)));
  const out: Pt[] = [];
  for (let k = 0; k < steps; k++) out.push(bezierPoint(c, k / steps));
  return out;
}

/** Douglas-Peucker sobre `pts[a..b]` (abierto): marca en `keep` los puntos que hacen falta. */
function douglasPeucker(pts: Pt[], a: number, b: number, tol: number, keep: Uint8Array): void {
  const stack: Array<[number, number]> = [[a, b]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (j - i < 2) continue;
    let far = -1;
    let best = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(pts[k], pts[i], pts[j]);
      if (d > best) {
        best = d;
        far = k;
      }
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([i, far], [far, j]);
  }
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-24) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

/** Ángulo (grados) entre dos direcciones; 0 si alguna es nula. */
function turnDeg(ax: number, ay: number, bx: number, by: number): number {
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (!la || !lb) return 0;
  const c = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Giro a partir del cual un vértice es una esquina. */
const CORNER_DEG = 30;
/** Vértices a menos de esto (en `tol`) se miran juntos como una esquina redondeada. */
const CORNER_GROUP_TOL = 6;

/** Recta como cúbica (controles en las puntas). */
const lineCubic = (a: Pt, b: Pt): Cubic => [a, a, b, b];
const isLine = (c: Cubic) => c[1] === c[0] && c[2] === c[3];

/** Distancia máxima de cada punto de `qs` a la polilínea `poly`. */
function farthest(qs: Pt[], poly: Pt[]): number {
  let worst = 0;
  for (const q of qs) {
    let best = poly.length === 1 ? dist(q, poly[0]) : Infinity;
    for (let k = 0; k + 1 < poly.length && best > worst; k++) best = Math.min(best, segmentDistance(q, poly[k], poly[k + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

/** Cuánto se separan las curvas de la polilínea original, en los dos sentidos. */
function maxDeviation(cubics: Cubic[], poly: Pt[], tol: number): number {
  const fp: Pt[] = [cubics[0][0]];
  for (const c of cubics) {
    // Muestras suficientes para que la cuerda entre dos no sume error.
    const len = dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]);
    const steps = Math.max(4, Math.min(256, Math.ceil(4 * Math.sqrt(len / Math.max(tol, 1e-12)))));
    for (let s = 1; s <= steps; s++) fp.push(bezierPoint(c, s / steps));
  }
  return Math.max(farthest(fp, poly), farthest(poly, fp));
}

/**
 * Simplifica un sub-trayecto: deja la menor cantidad de nodos que pasen a
 * menos de `tol` de la forma original. Devuelve null si no ahorra nodos.
 *
 * 1. Se muestrea todo el contorno como polilínea.
 * 2. Douglas-Peucker con `tol` da la forma mínima: en una recta llena de nodos
 *    (o con nodos casi encimados, o con el zigzag de la vectorización) quedan
 *    solo sus dos puntas.
 * 3. Las esquinas son los vértices de esa forma mínima donde la dirección gira
 *    de verdad, medida con un tramo a cada lado (no nodo contra nodo, que con
 *    nodos encimados da cualquier cosa).
 * 4. Entre esquinas: si es recta, una recta; si no, curvas (Schneider), y las
 *    curvas casi rectas pasan a rectas.
 */
export function simplifySub(sub: ESub, tol: number): ESub | null {
  const n = sub.nodes;
  const count = n.length;
  if (count < (sub.closed ? 4 : 3)) return null;
  // 1. Muestras (sin repetir puntos).
  const raw: Pt[] = [];
  const segs = sub.closed ? count : count - 1;
  for (let k = 0; k < segs; k++) raw.push(...sampleSegment(n[k], n[(k + 1) % count], tol));
  if (!sub.closed) raw.push(n[count - 1].p);
  const pts: Pt[] = [];
  for (const q of raw) if (!pts.length || dist(q, pts[pts.length - 1]) > tol * 1e-3) pts.push(q);
  if (sub.closed) while (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) <= tol * 1e-3) pts.pop();
  const m = pts.length;
  if (m < (sub.closed ? 3 : 2)) return null;

  // 2. Forma mínima. Cerrado: se parte en el punto 0 y el más lejano a él.
  const keep = new Uint8Array(m + 1);
  const ext = sub.closed ? [...pts, pts[0]] : pts;
  keep[0] = 1;
  keep[ext.length - 1] = 1;
  if (sub.closed) {
    let far = 1;
    for (let k = 1; k < m; k++) if (dist(pts[k], pts[0]) > dist(pts[far], pts[0])) far = k;
    keep[far] = 1;
    douglasPeucker(ext, 0, far, tol, keep);
    douglasPeucker(ext, far, m, tol, keep);
  } else {
    douglasPeucker(ext, 0, m - 1, tol, keep);
  }
  const verts: number[] = [];
  for (let k = 0; k < m; k++) if (keep[k]) verts.push(k);

  // 3. Esquinas: giro medido sobre la polilínea original, a `win` de distancia.
  const cum: number[] = [0];
  for (let k = 1; k < ext.length; k++) cum.push(cum[k - 1] + dist(ext[k - 1], ext[k]));
  const total = cum[ext.length - 1];
  const at = (s: number): Pt => {
    // Punto a distancia s (con vuelta si es cerrado) sobre la polilínea.
    let x = s;
    if (sub.closed) x = ((x % total) + total) % total;
    else x = Math.max(0, Math.min(total, x));
    let lo = 0;
    let hi = ext.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= x) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    const t = (x - cum[lo]) / span;
    return { x: ext[lo].x + t * (ext[hi].x - ext[lo].x), y: ext[lo].y + t * (ext[hi].y - ext[lo].y) };
  };
  const nv = verts.length;
  const isCornerV = new Uint8Array(nv);
  for (let j = 0; j < nv; j++) {
    const k = verts[j];
    if (!sub.closed && (j === 0 || j === nv - 1)) {
      isCornerV[j] = 1;
      continue;
    }
    const prevV = verts[(j - 1 + nv) % nv];
    const nextV = verts[(j + 1) % nv];
    const back = sub.closed ? (cum[k] - cum[prevV] + total) % total : cum[k] - cum[prevV];
    const fwd = sub.closed ? (cum[nextV] - cum[k] + total) % total : cum[nextV] - cum[k];
    const win = Math.min(4 * tol, 0.5 * back, 0.5 * fwd);
    if (!(win > 0)) continue;
    const p = pts[k];
    const a = at(cum[k] - win);
    const b = at(cum[k] + win);
    if (turnDeg(p.x - a.x, p.y - a.y, b.x - p.x, b.y - p.y) >= CORNER_DEG) isCornerV[j] = 1;
  }
  // Esquinas redondeadas chiquitas: el giro se reparte entre varios vértices
  // muy juntos (cada uno gira poco). Se miran como grupo: si entre todos giran
  // una esquina, sus puntas quedan como esquina (y el redondeo, como curva).
  const span = CORNER_GROUP_TOL * tol;
  const linked = (j: number) =>
    (sub.closed || j + 1 < nv) && dist(pts[verts[j]], pts[verts[(j + 1) % nv]]) <= span;
  const start = sub.closed ? Array.from({ length: nv }, (_, j) => j).find((j) => !linked((j - 1 + nv) % nv)) : 0;
  if (start !== undefined && nv >= 3) {
    for (let c = 0; c < nv; ) {
      const j0 = (start + c) % nv;
      let len = 1;
      while (len < nv && linked((j0 + len - 1) % nv)) len++;
      if (len >= 2 && (sub.closed || (j0 > 0 && j0 + len - 1 < nv - 1))) {
        const pIn = pts[verts[(j0 - 1 + nv) % nv]];
        const g0 = pts[verts[j0]];
        const g1 = pts[verts[(j0 + len - 1) % nv]];
        const pOut = pts[verts[(j0 + len) % nv]];
        if (turnDeg(g0.x - pIn.x, g0.y - pIn.y, pOut.x - g1.x, pOut.y - g1.y) >= CORNER_DEG) {
          if (dist(g0, g1) <= tol) {
            // Redondeo más chico que la tolerancia: una esquina viva en el medio.
            isCornerV[(j0 + Math.floor(len / 2)) % nv] = 1;
          } else {
            // Las puntas del redondeo son esquinas; el redondeo queda como curva.
            isCornerV[j0] = 1;
            isCornerV[(j0 + len - 1) % nv] = 1;
          }
        }
      }
      c += len;
    }
  }
  const corners: number[] = [];
  for (let j = 0; j < nv; j++) if (isCornerV[j]) corners.push(verts[j]);

  // 4. Tramos entre esquinas.
  const runIdx = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let k = from; ; k = (k + 1) % m) {
      out.push(k);
      if (k === to && out.length > 1) break;
      if (out.length > m + 1) break;
    }
    return out;
  };
  const out: ENode[] = [];
  const pushRun = (idx: number[]) => {
    const rp = idx.map((k) => pts[k]);
    const end = rp[rp.length - 1];
    if (rp.every((q) => segmentDistance(q, rp[0], end) <= tol)) {
      out.push({ p: { ...end } });
      return;
    }
    const emit = (segs: Cubic[]) => {
      for (const c of segs) {
        if (isLine(c)) out.push({ p: c[3] });
        else {
          out[out.length - 1].o = c[1];
          out.push({ p: c[3], i: c[2] });
        }
      }
    };
    const curveOrLine = (c: Cubic, f: number): Cubic => (isNearlyStraight(c, tol * f) ? lineCubic(c[0], c[3]) : c);
    const fit = fitCubics(rp, tol);
    // Primero el intento más simple (curvas que casi no se curvan → rectas, y
    // rectas alineadas → una sola); si se va de la forma, uno más fiel.
    for (const [straightTol, merge] of [
      [0.5, true],
      [0.25, false],
    ] as const) {
      const segs: Cubic[] = fit.map((c) => curveOrLine(c, straightTol));
      if (merge) {
        for (let t = 0; t + 1 < segs.length; ) {
          const c0 = segs[t];
          const c1 = segs[t + 1];
          if (isLine(c0) && isLine(c1) && segmentDistance(c0[3], c0[0], c1[3]) <= tol * 0.5) {
            segs.splice(t, 2, lineCubic(c0[0], c1[3]));
          } else t++;
        }
      }
      // Control: lo simplificado no se puede ir de la forma original.
      if (!segs.length || maxDeviation(segs, rp, tol) > 1.5 * tol) continue;
      emit(segs);
      return;
    }
    // Último recurso: rectas por los puntos de la forma mínima (Douglas-Peucker
    // garantiza que están a menos de `tol`).
    for (let t = 1; t < idx.length; t++) if (keep[idx[t]] || t === idx.length - 1) out.push({ p: { ...pts[idx[t]] } });
  };
  if (!sub.closed) {
    out.push({ p: { ...pts[0] } });
    for (let j = 0; j + 1 < corners.length; j++) pushRun(runIdx(corners[j], corners[j + 1]));
  } else if (corners.length < 2) {
    // Sin esquinas (o con una sola): se ajusta en dos mitades.
    const s0 = corners.length ? corners[0] : 0;
    const s1 = (s0 + Math.floor(m / 2)) % m;
    out.push({ p: { ...pts[s0] } });
    pushRun(runIdx(s0, s1));
    pushRun(runIdx(s1, s0));
  } else {
    out.push({ p: { ...pts[corners[0]] } });
    for (let j = 0; j < corners.length; j++) pushRun(runIdx(corners[j], corners[(j + 1) % corners.length]));
  }
  if (sub.closed && out.length > 1 && near(out[0].p, out[out.length - 1].p, tol * 0.01)) {
    const last = out.pop()!;
    if (last.i) out[0].i = last.i;
  }
  if (out.length >= count || (sub.closed ? !validClosed(out) : out.length < 2)) return null;
  return { closed: sub.closed, nodes: out };
}

/** Simplifica curvas en todo el vector o en las piezas pedidas. */
export function simplifyDoc(doc: EditDoc, tol: number, refs?: SubRef[]): { doc: EditDoc; before: number; after: number } {
  const next = cloneDoc(doc);
  const list = refs ?? doc.paths.flatMap((p, pi) => p.subs.map((_, si) => ({ path: pi, sub: si })));
  const before = countNodes(doc, refs);
  for (const r of list) {
    const sub = next.paths[r.path]?.subs[r.sub];
    if (!sub) continue;
    const s = simplifySub(sub, tol);
    if (s) next.paths[r.path].subs[r.sub] = s;
  }
  return { doc: next, before, after: countNodes(next, refs) };
}

/** Piezas chicas sueltas (motas de la vectorización), por área en mm². */
export function specks(pieces: EditPiece[], maxAreaMm2: number, mmPerUnit: number): EditPiece[] {
  return pieces.filter((p) => p.area * mmPerUnit * mmPerUnit < maxAreaMm2);
}

/** Caja de todo el dibujo (unidades). */
export function docBounds(doc: EditDoc, tol: number): Box | null {
  let b: Box | null = null;
  for (const path of doc.paths)
    for (const sub of path.subs) {
      const pb = polyBounds(flattenSub(sub, tol));
      b = b
        ? { minX: Math.min(b.minX, pb.minX), minY: Math.min(b.minY, pb.minY), maxX: Math.max(b.maxX, pb.maxX), maxY: Math.max(b.maxY, pb.maxY) }
        : pb;
    }
  return b;
}
