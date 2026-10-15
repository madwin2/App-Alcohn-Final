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
import { bezierPoint, cornerIndices, fitCubics, isNearlyStraight, type Cubic } from './curveFit';
import { UM, offset as offsetRegion, toPath64, union, type Paths64 } from './geometry';
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
  const corners = cornerIndices(pts, true, 35);
  const nodes: ENode[] = [];
  const pushCubic = (c: Cubic) => {
    if (isNearlyStraight(c, tol * 0.25)) {
      nodes.push({ p: c[3] });
      return;
    }
    nodes[nodes.length - 1].o = c[1];
    nodes.push({ p: c[3], i: c[2] });
  };
  if (!corners.length) {
    // Sin esquinas: se parte en dos mitades para cerrar suave.
    const h = Math.floor(pts.length / 2);
    const a = fitCubics(pts.slice(0, h + 1), tol);
    const b = fitCubics([...pts.slice(h), pts[0]], tol);
    nodes.push({ p: pts[0] });
    for (const c of [...a, ...b]) pushCubic(c);
  } else {
    const n = pts.length;
    nodes.push({ p: pts[corners[0]] });
    for (let k = 0; k < corners.length; k++) {
      const from = corners[k];
      const to = corners[(k + 1) % corners.length];
      const run: Pt[] = [];
      for (let j = from; ; j = (j + 1) % n) {
        run.push(pts[j]);
        if (j === to && run.length > 1) break;
        if (run.length > n + 1) break;
      }
      if (corners.length === 1) run.push(pts[from]);
      for (const c of fitCubics(run, tol)) pushCubic(c);
    }
  }
  // El último nodo repite el primero: se fusiona.
  if (nodes.length > 2 && near(nodes[0].p, nodes[nodes.length - 1].p, tol * 0.01)) {
    const last = nodes.pop()!;
    if (last.i) nodes[0].i = last.i;
  }
  return validClosed(nodes) ? { closed: true, nodes } : null;
}

/** Un contorno cerrado necesita 3 nodos, o 2 si hay curvas (un círculo en dos mitades). */
function validClosed(nodes: ENode[]): boolean {
  if (nodes.length >= 3) return true;
  return nodes.length === 2 && nodes.some((n) => n.i || n.o);
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

/** ¿El nodo es una esquina (cambia la dirección de golpe)? */
function isCorner(prev: ENode, n: ENode, next: ENode): boolean {
  const inDir = n.i ? { x: n.p.x - n.i.x, y: n.p.y - n.i.y } : { x: n.p.x - (prev.o ?? prev.p).x, y: n.p.y - (prev.o ?? prev.p).y };
  const outDir = n.o ? { x: n.o.x - n.p.x, y: n.o.y - n.p.y } : { x: (next.i ?? next.p).x - n.p.x, y: (next.i ?? next.p).y - n.p.y };
  const la = Math.hypot(inDir.x, inDir.y);
  const lb = Math.hypot(outDir.x, outDir.y);
  if (!la || !lb) return true;
  return (inDir.x * outDir.x + inDir.y * outDir.y) / (la * lb) < Math.cos((20 * Math.PI) / 180);
}

/**
 * Simplifica un sub-trayecto: entre esquinas, reemplaza los nodos por la menor
 * cantidad de curvas que pasen a menos de `tol` de la forma original. Las
 * esquinas y los tramos rectos se conservan. Devuelve null si no ahorra nodos.
 */
export function simplifySub(sub: ESub, tol: number): ESub | null {
  const n = sub.nodes;
  if (n.length < 4) return null;
  const count = n.length;
  const cornerIdx: number[] = [];
  for (let k = 0; k < count; k++) {
    if (!sub.closed && (k === 0 || k === count - 1)) {
      cornerIdx.push(k);
      continue;
    }
    if (isCorner(n[(k - 1 + count) % count], n[k], n[(k + 1) % count])) cornerIdx.push(k);
  }
  const out: ENode[] = [];
  const pushRun = (from: number, to: number) => {
    // Tramo de nodos from → to (con vuelta si es cerrado).
    const idx: number[] = [];
    for (let k = from; ; k = (k + 1) % count) {
      idx.push(k);
      if (k === to && idx.length > 1) break;
      if (idx.length > count + 1) break;
    }
    const pts: Pt[] = [];
    for (let j = 0; j < idx.length - 1; j++) pts.push(...sampleSegment(n[idx[j]], n[idx[j + 1]], tol));
    const end = n[idx[idx.length - 1]].p;
    pts.push(end);
    // Si todo el tramo es una recta (aunque tenga nodos en el medio), queda una recta.
    if (pts.every((q) => pointLineDistance(q, pts[0], end) <= tol)) {
      out.push({ p: { ...end } });
      return;
    }
    for (const c of fitCubics(pts, tol)) {
      if (isNearlyStraight(c, tol * 0.25)) {
        out.push({ p: c[3] });
      } else {
        out[out.length - 1].o = c[1];
        out.push({ p: c[3], i: c[2] });
      }
    }
  };
  if (!sub.closed) {
    out.push({ p: { ...n[0].p } });
    for (let k = 0; k + 1 < cornerIdx.length; k++) pushRun(cornerIdx[k], cornerIdx[k + 1]);
  } else if (!cornerIdx.length) {
    // Todo suave: se ajusta en dos mitades partiendo en el nodo 0.
    const half = Math.floor(count / 2);
    out.push({ p: { ...n[0].p } });
    pushRun(0, half);
    pushRun(half, 0);
  } else {
    out.push({ p: { ...n[cornerIdx[0]].p } });
    for (let k = 0; k < cornerIdx.length; k++) pushRun(cornerIdx[k], cornerIdx[(k + 1) % cornerIdx.length]);
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
