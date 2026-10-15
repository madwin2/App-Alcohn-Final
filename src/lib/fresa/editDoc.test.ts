// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bezierPoint, fitCubics } from './curveFit';
import {
  buildEditDoc,
  computePieces,
  countNodes,
  docBounds,
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

  it('simplifica la G del caso FG (esquinas apenas redondeadas) sin deformarla', () => {
    // Vector real: rectas como cúbicas y esquinas con un redondeo de ~0,02 mm
    // repartido en 2-3 nodos. Antes la esquina no se veía y el lado salía curvo.
    const d0 = 'M311.13 1522.65C312.3567 1523.27 313.5467 1523.97 314.7 1524.75C322.39 1529.93 330.09 1536.38 337.51 1543.15C348.49 1553.17 359.3767 1562.11 370.17 1569.97C372.47 1571.65 375.4133 1574.1833 379 1577.57C387.78 1585.86 396.39 1592.65 407 1600.92C411.0733 1604.1 417.35 1609.2867 425.83 1616.48C436.2967 1625.3667 448.3433 1635.31 461.97 1646.31C464.81 1648.59 466.82 1650.75 469.17 1653.17C469.93 1653.9493 470.9219 1654.4645 472 1654.64C474.56 1655.06 477.06 1655.2633 479.5 1655.25C509.0733 1655.0767 538.63 1655.13 568.17 1655.41C593.9833 1655.6567 613.5367 1655.67 626.83 1655.45C651.54 1655.04 674.16 1655.55 705.05 1655.51C875.3433 1655.29 976.8267 1655.2367 1009.5 1655.35C1079 1655.5833 1117.25 1655.74 1124.25 1655.82C1140.3033 1656.0067 1161.7033 1655.9067 1188.45 1655.52C1190.83 1655.48 1192.0133 1654.2233 1192 1651.75C1191.8533 1620.3433 1191.8133 1584.6367 1191.88 1544.63C1191.8869 1544.2578 1191.6051 1543.9413 1191.23 1543.9C1187.29 1543.5067 1182.88 1543.3067 1178 1543.3C1176.0333 1543.3 1161.95 1543.3667 1135.75 1543.5C1073.6033 1543.82 963.7367 1543.8633 806.15 1543.63C803.52 1543.62 801.24 1543.8 798.7 1543.06C798.3953 1542.9728 798.189 1542.6923 798.2 1542.38C800.11 1489.21 799.16 1437.04 797.75 1381C797.62 1375.95 801.29 1375.75 805.6 1375.8C829.42 1376.0533 849.2867 1376.1533 865.2 1376.1C999.32 1375.63 1160.38 1376.06 1308.25 1375.9C1329.01 1375.88 1353.7033 1375.9467 1382.33 1376.1C1382.6133 1376.1054 1382.8401 1376.3367 1382.84 1376.62L1382.84 1811.92C1382.84 1812.1826 1382.7357 1812.4344 1382.55 1812.62C1382.3644 1812.8057 1382.1126 1812.91 1381.85 1812.91L435.29 1812.91C435.0433 1812.91 434.8068 1812.812 434.6324 1812.6376C434.458 1812.4632 434.36 1812.2267 434.36 1811.98L434.36 1811.37C434.3602 1811.143 434.2534 1810.9257 434.07 1810.78C429.57 1807.2467 406.1233 1787.7433 363.73 1752.27C344.6633 1736.31 326.7567 1721.6867 310.01 1708.4C309.7586 1708.1992 309.6205 1707.8932 309.64 1707.58C309.9533 1702.04 310.13 1696.0967 310.17 1689.75C310.5967 1617.3367 310.7 1561.7733 310.48 1523.06C310.4776 1522.9031 310.5571 1522.7562 310.6899 1522.6725C310.8226 1522.5887 310.9894 1522.5802 311.13 1522.65Z';
    const text = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="300 1370 1090 450"><path d="${d0}"/></svg>`;
    const before = doc(text);
    const tol = 0.455; // 0,01 mm en unidades de este archivo
    const { doc: s, after } = simplifyDoc(before, tol);
    expect(after).toBeLessThan(countNodes(before));
    const b0 = docBounds(before, 0.05)!;
    const b1 = docBounds(s, 0.05)!;
    for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(Math.abs(b1[k] - b0[k])).toBeLessThan(2 * tol);
    const a0 = areaOf(text);
    expect(Math.abs(areaOf(serializeEditDoc(s)) - a0) / a0).toBeLessThan(0.002);
    // El lado derecho (x ≈ 1382,8) sigue siendo una recta.
    const ns = s.paths[0].subs[0].nodes;
    const k = ns.findIndex((n, j) => n.p.x > 1382 && ns[(j + 1) % ns.length].p.x > 1382);
    expect(k).toBeGreaterThanOrEqual(0);
    const next = ns[(k + 1) % ns.length];
    expect(Math.abs(next.p.y - ns[k].p.y)).toBeGreaterThan(400);
    expect(ns[k].o ?? next.i).toBeUndefined();
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
