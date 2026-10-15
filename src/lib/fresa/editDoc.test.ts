// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bezierPoint, fitCubics } from './curveFit';
import {
  buildEditDoc,
  computePieces,
  countNodes,
  deleteNode,
  moveNodePart,
  offsetPiece,
  redundantNodes,
  removeRedundant,
  serializeEditDoc,
  simplifyDoc,
  translateRefs,
  type EditDoc,
} from './editDoc';
import { buildBlackRegion } from './analyze';
import { parseSvgShapes } from './svgShapes';
import { regionArea } from './geometry';

const svg = (body: string, w = 20, h = 10) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Área negra (mm², 1 unidad = 1 mm). */
const areaOf = (text: string) => regionArea(buildBlackRegion(parseSvgShapes(text).shapes, 1)) / 1e6;

function doc(text: string): EditDoc {
  const r = buildEditDoc(text);
  if (!r.ok) throw new Error(r.error);
  return r.doc;
}

describe('curveFit', () => {
  it('ajusta un cuarto de círculo con pocas curvas y error acotado', () => {
    const pts = Array.from({ length: 60 }, (_, k) => {
      const t = (k / 59) * (Math.PI / 2);
      return { x: 10 * Math.cos(t), y: 10 * Math.sin(t) };
    });
    const cubics = fitCubics(pts, 0.01);
    expect(cubics.length).toBeLessThanOrEqual(4);
    for (const c of cubics)
      for (let k = 0; k <= 20; k++) {
        const p = bezierPoint(c, k / 20);
        expect(Math.abs(Math.hypot(p.x, p.y) - 10)).toBeLessThan(0.02);
      }
  });
});

describe('editDoc', () => {
  it('lee paths, rect, círculos y transformaciones y los vuelve a escribir igual', () => {
    const text = svg(
      `<path d="M1 1h4v4h-4z M2 2C2 3 3 3 3 2Z" fill-rule="evenodd"/>` +
        `<g transform="translate(8 1)"><rect width="3" height="2" rx="0.5"/></g>` +
        `<circle cx="15" cy="5" r="2"/><ellipse cx="15" cy="9" rx="2" ry="0.6" transform="rotate(10 15 9)"/>`,
    );
    const out = serializeEditDoc(doc(text));
    // Arcos → cúbicas: error de ~0,03 % del radio.
    expect(areaOf(out)).toBeCloseTo(areaOf(text), 1);
    expect(out).toContain('width="20mm"');
    expect(out).toContain('viewBox="0 0 20 10"');
  });

  it('no edita SVG con rellenos blancos o trazos', () => {
    const r = buildEditDoc(svg(`<rect width="4" height="4"/><rect x="1" y="1" width="1" height="1" fill="#fff"/>`));
    expect(r.ok).toBe(false);
  });

  it('agrupa una letra con su ojo en una sola pieza', () => {
    const d = doc(svg(`<path d="M1 1h4v4h-4z M2 2h2v2h-2z" fill-rule="evenodd"/><circle cx="8" cy="3" r="0.5"/>`));
    const pieces = computePieces(d, 0.01);
    expect(pieces).toHaveLength(2);
    const letra = pieces.find((p) => p.refs.length === 2)!;
    expect(letra.area).toBeCloseTo(16 - 4, 3);
  });

  it('una letra adentro de un aro es otra pieza (no se elige todo junto)', () => {
    // Aro (cuadrado con agujero) y una letra con ojo adentro del agujero.
    const d = doc(
      svg(`<path d="M0 0h10v10h-10z M1 1h8v8h-8z M3 3h4v4h-4z M4 4h2v2h-2z" fill-rule="evenodd"/>`, 10, 10),
    );
    const pieces = computePieces(d, 0.01);
    expect(pieces).toHaveLength(2);
    expect(pieces.map((p) => p.refs.length).sort()).toEqual([2, 2]);
    expect(pieces.find((p) => p.bounds.minX === 3)!.area).toBeCloseTo(16 - 4, 3);
  });

  it('mueve una pieza entera', () => {
    const text = svg(`<path d="M1 1h4v4h-4z M2 2h2v2h-2z" fill-rule="evenodd"/>`);
    const d = doc(text);
    const [p] = computePieces(d, 0.01);
    const moved = translateRefs(d, p.refs, 2, 1);
    const [q] = computePieces(moved, 0.01);
    expect(q.bounds.minX).toBeCloseTo(3, 6);
    expect(q.bounds.minY).toBeCloseTo(2, 6);
    expect(areaOf(serializeEditDoc(moved))).toBeCloseTo(12, 3);
  });

  it('offset exterior engorda en paralelo y deja curvas (no un polígono)', () => {
    const d = doc(svg(`<circle cx="5" cy="5" r="2"/>`));
    const [p] = computePieces(d, 0.005);
    const grown = offsetPiece(d, p, 0.2, 1)!;
    const area = areaOf(serializeEditDoc(grown));
    expect(area).toBeCloseTo(Math.PI * 2.2 * 2.2, 1);
    // Un polígono de Clipper tendría cientos de puntos.
    expect(countNodes(grown)).toBeLessThan(30);
    const thin = offsetPiece(d, p, -0.5, 1)!;
    expect(areaOf(serializeEditDoc(thin))).toBeCloseTo(Math.PI * 1.5 * 1.5, 1);
  });

  it('detecta y saca nodos de más sin cambiar la forma', () => {
    // Cuadrado con un nodo en medio de cada lado y uno repetido.
    const text = svg(`<path d="M1 1L3 1L5 1L5 3L5 5L5 5L3 5L1 5L1 3Z"/>`);
    const d = doc(text);
    expect(redundantNodes(d, 0.001).length).toBeGreaterThan(0);
    const { doc: clean, removed } = removeRedundant(d, 0.001);
    expect(removed).toBe(5);
    expect(countNodes(clean)).toBe(4);
    expect(areaOf(serializeEditDoc(clean))).toBeCloseTo(16, 6);
  });

  it('simplifica un círculo hecho de muchas rectitas a pocas curvas', () => {
    const pts = Array.from({ length: 120 }, (_, k) => {
      const t = (k / 120) * 2 * Math.PI;
      return `${(5 + 3 * Math.cos(t)).toFixed(4)} ${(5 + 3 * Math.sin(t)).toFixed(4)}`;
    });
    const text = svg(`<path d="M${pts.join('L')}Z"/>`);
    const d = doc(text);
    const { after, before } = simplifyDoc(d, 0.01);
    expect(before).toBe(120);
    expect(after).toBeLessThan(12);
  });

  it('simplifica rectas llenas de nodos, con nodos casi encimados y ruido (caso FG)', () => {
    // Rectángulo 20×6 con un nodo cada 0,25 mm, un zigzag de 0,002 mm y, en
    // cada esquina, un par de nodos casi encimados (como sale de la vectorización).
    const pts: string[] = [];
    const add = (x: number, y: number) => pts.push(`${x.toFixed(4)} ${y.toFixed(4)}`);
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.25);
      add(x0, y0);
      add(x0 + 0.0008, y0 + 0.0006); // casi encimado
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        const j = (k % 2 ? 1 : -1) * 0.002;
        add(x0 + t * (x1 - x0) + (y1 !== y0 ? j : 0), y0 + t * (y1 - y0) + (x1 !== x0 ? j : 0));
      }
    };
    edge(1, 1, 21, 1);
    edge(21, 1, 21, 7);
    edge(21, 7, 1, 7);
    edge(1, 7, 1, 1);
    const d = doc(svg(`<path d="M${pts.join('L')}Z"/>`));
    const { doc: s, before, after } = simplifyDoc(d, 0.01);
    expect(before).toBeGreaterThan(200);
    expect(after).toBe(4);
    expect(areaOf(serializeEditDoc(s))).toBeCloseTo(120, 1);
    for (const n of s.paths[0].subs[0].nodes) expect(n.i ?? n.o).toBeUndefined();
  });

  it('simplifica una D: rectas quedan rectas y la panza queda curva', () => {
    const pts: string[] = ['1 1'];
    for (let y = 1.5; y < 9; y += 0.5) pts.push(`1 ${y}`); // lomo recto con nodos
    pts.push('1 9');
    for (let x = 1.5; x <= 5; x += 0.5) pts.push(`${x} 9`);
    for (let k = 1; k < 60; k++) {
      const t = Math.PI / 2 - (k / 60) * Math.PI;
      pts.push(`${(5 + 4 * Math.cos(t)).toFixed(4)} ${(5 + 4 * Math.sin(t)).toFixed(4)}`);
    }
    for (let x = 5; x > 1; x -= 0.5) pts.push(`${x} 1`);
    const d = doc(svg(`<path d="M${pts.join('L')}Z"/>`));
    const { doc: s, after } = simplifyDoc(d, 0.01);
    expect(after).toBeLessThan(12);
    const area = 4 * 8 + (Math.PI * 16) / 2;
    expect(areaOf(serializeEditDoc(s))).toBeCloseTo(area, 0);
    expect(s.paths[0].subs[0].nodes.some((n) => n.i || n.o)).toBe(true);
  });

  it('mueve un nodo con sus manijas y borra nodos', () => {
    const d = doc(svg(`<path d="M1 1C2 0 3 0 4 1L4 4L1 4Z"/>`));
    const ref = { path: 0, sub: 0, node: 1 };
    const moved = moveNodePart(d, ref, 'p', { x: 5, y: 1 });
    const n = moved.paths[0].subs[0].nodes[1];
    expect(n.p).toEqual({ x: 5, y: 1 });
    expect(n.i).toEqual({ x: 4, y: 0 });
    const less = deleteNode(moved, { path: 0, sub: 0, node: 2 });
    expect(countNodes(less)).toBe(3);
  });
});
