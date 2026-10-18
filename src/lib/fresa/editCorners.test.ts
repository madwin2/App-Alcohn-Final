// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildEditDoc, computePieces, serializeEditDoc, type EditDoc } from './editDoc';
import { copyRefs, cornerInfo, internalCorners, pasteClip, roundCorner, roundCorners } from './editCorners';

const docOf = (d: string, attrs = ''): EditDoc => {
  const r = buildEditDoc(`<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" viewBox="0 0 40 40"><path ${attrs} d="${d}"/></svg>`);
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};
const nodeAt = (doc: EditDoc, x: number, y: number) => {
  const nodes = doc.paths[0].subs[0].nodes;
  const node = nodes.findIndex((n) => Math.abs(n.p.x - x) < 1e-6 && Math.abs(n.p.y - y) < 1e-6);
  return { path: 0, sub: 0, node };
};
/** Punto de la cúbica de un nodo al siguiente. */
const cubicAt = (doc: EditDoc, k: number, t: number) => {
  const ns = doc.paths[0].subs[0].nodes, a = ns[k], b = ns[(k + 1) % ns.length];
  const P = [a.p, a.o ?? a.p, b.i ?? b.p, b.p];
  const m = 1 - t;
  return { x: m ** 3 * P[0].x + 3 * m * m * t * P[1].x + 3 * m * t * t * P[2].x + t ** 3 * P[3].x,
    y: m ** 3 * P[0].y + 3 * m * m * t * P[1].y + 3 * m * t * t * P[2].y + t ** 3 * P[3].y };
};

describe('redondear vértices', () => {
  it('un vértice recto de un cuadrado queda con un arco del radio pedido', () => {
    const doc = docOf('M0 0H10V10H0Z');
    const ref = nodeAt(doc, 10, 0);
    expect(cornerInfo(doc, ref)?.angleDeg).toBeCloseTo(90, 5);
    const r = roundCorner(doc, ref, 2)!;
    expect(r.radius).toBe(2);
    const ns = r.doc.paths[0].subs[0].nodes;
    expect(ns).toHaveLength(5);
    const a = ns.findIndex((n) => Math.abs(n.p.x - 8) < 1e-6 && Math.abs(n.p.y) < 1e-6);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(ns[(a + 1) % ns.length].p.x).toBeCloseTo(10, 6);
    expect(ns[(a + 1) % ns.length].p.y).toBeCloseTo(2, 6);
    // Todo el arco a 2 del centro (8, 2): error de la cúbica < 0,1 %.
    for (const t of [0.25, 0.5, 0.75]) {
      const q = cubicAt(r.doc, a, t);
      expect(Math.hypot(q.x - 8, q.y - 2)).toBeCloseTo(2, 2);
    }
  });

  it('si el radio no entra usa el mayor posible, sin pasarse de la mitad de los lados', () => {
    const doc = docOf('M0 0H4V4H0Z');
    const r = roundCorner(doc, nodeAt(doc, 4, 0), 10)!;
    expect(r.radius).toBeLessThan(2);
    expect(r.radius).toBeGreaterThan(1.9);
  });

  it('redondea los cuatro vértices de una vez y el dibujo sigue siendo válido', () => {
    const doc = docOf('M0 0H10V10H0Z');
    const refs = [0, 1, 2, 3].map((node) => ({ path: 0, sub: 0, node }));
    const r = roundCorners(doc, refs, 1);
    expect(r.done).toBe(4);
    expect(r.doc.paths[0].subs[0].nodes).toHaveLength(8);
    expect(serializeEditDoc(r.doc)).toContain('C');
  });

  it('un vértice que no quiebra no se toca', () => {
    const doc = docOf('M0 0H5H10V10H0Z');
    expect(cornerInfo(doc, nodeAt(doc, 5, 0))).toBeNull();
  });

  it('encuentra el vértice interno de una L (la punta blanca donde la fresa no entra)', () => {
    const doc = docOf('M0 0H4V6H10V10H0Z');
    const pieces = computePieces(doc, 0.01);
    const inner = internalCorners(doc, pieces, 0.01);
    expect(inner).toHaveLength(1);
    const p = doc.paths[0].subs[0].nodes[inner[0].ref.node].p;
    expect([p.x, p.y]).toEqual([4, 6]);
  });

  it('en un ojo con punta, la punta del ojo es interna', () => {
    // Cuadrado negro con un agujero en forma de rombo alargado.
    const doc = docOf('M0 0H20V20H0Z M4 10L10 8L16 10L10 12Z', 'fill-rule="evenodd"');
    const inner = internalCorners(doc, computePieces(doc, 0.01), 0.01);
    const tips = inner.map((c) => doc.paths[0].subs[c.ref.sub].nodes[c.ref.node].p);
    expect(tips).toEqual(expect.arrayContaining([{ x: 4, y: 10 }, { x: 16, y: 10 }]));
  });
});

describe('copiar y pegar piezas', () => {
  it('pega una copia corrida y conserva el relleno y los agujeros', () => {
    const doc = docOf('M0 0H10V10H0Z M3 3H7V7H3Z', 'fill-rule="evenodd"');
    const clip = copyRefs(doc, [{ path: 0, sub: 0 }, { path: 0, sub: 1 }], { minX: 0, minY: 0, maxX: 10, maxY: 10 }, 0.5);
    const r = pasteClip(doc, clip, 0.5, 1);
    expect(r.firstNewPath).toBe(1);
    expect(r.doc.paths).toHaveLength(2);
    expect(r.doc.paths[1].fillRule).toBe('evenodd');
    expect(r.doc.paths[1].subs[0].nodes[0].p).toEqual({ x: 2, y: 2 }); // +1 mm = +2 unidades
    expect(computePieces(r.doc, 0.01)).toHaveLength(2);
    // El original no cambió.
    expect(doc.paths).toHaveLength(1);
  });

  it('pegado en otro dibujo con otra escala mantiene la medida en mm', () => {
    const src = docOf('M0 0H10V10H0Z');
    const clip = copyRefs(src, [{ path: 0, sub: 0 }], { minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1); // 10 mm
    const dest = docOf('M0 0H1V1H0Z');
    const r = pasteClip(dest, clip, 0.1, 0); // 0,1 mm por unidad
    const ns = r.doc.paths[1].subs[0].nodes.map((n) => n.p);
    const w = Math.max(...ns.map((p) => p.x)) - Math.min(...ns.map((p) => p.x));
    expect(w * 0.1).toBeCloseTo(10, 6);
  });
});

describe('girar y espejar', () => {
  it('cuatro giros de 90° vuelven al original', async () => {
    const { rotateRefs } = await import('./editCorners');
    const doc = docOf('M0 0H10V4H0Z');
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 4 };
    let d = doc;
    for (let i = 0; i < 4; i++) d = rotateRefs(d, [{ path: 0, sub: 0 }], box, 90);
    expect(d.paths[0].subs[0].nodes.map((n) => n.p)).toEqual(doc.paths[0].subs[0].nodes.map((n) => n.p));
    const once = rotateRefs(doc, [{ path: 0, sub: 0 }], box, 90).paths[0].subs[0].nodes.map((n) => n.p);
    const xs = once.map((p) => p.x), ys = once.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 9); // ahora es alto
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 9);
  });
  it('espejar dos veces vuelve al original y una vez invierte izquierda y derecha', async () => {
    const { mirrorRefs } = await import('./editCorners');
    const doc = docOf('M0 0H2V10H0Z');
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const once = mirrorRefs(doc, [{ path: 0, sub: 0 }], box, 'x');
    expect(Math.min(...once.paths[0].subs[0].nodes.map((n) => n.p.x))).toBe(8);
    expect(mirrorRefs(once, [{ path: 0, sub: 0 }], box, 'x')).toEqual(doc);
  });
});

describe('unir piezas', () => {
  it('dos cuadrados que se pisan quedan en una sola pieza con el área de la unión', async () => {
    const { unionPieces } = await import('./editDoc');
    const r = buildEditDoc('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20"><path d="M0 0H10V10H0Z"/><path d="M5 5H15V15H5Z"/></svg>');
    if (!r.ok) throw new Error(r.error);
    const pieces = computePieces(r.doc, 0.01);
    expect(pieces).toHaveLength(2);
    const u = unionPieces(r.doc, pieces, 1)!;
    const after = computePieces(u.doc, 0.01);
    expect(after).toHaveLength(1);
    expect(Math.abs(after[0].area)).toBeCloseTo(175, 0); // 100 + 100 − 25
  });
});

describe('unir solo lo que se toca', () => {
  it('une las dos que se pisan y deja intacta la suelta', async () => {
    const { unionPieces } = await import('./editDoc');
    const r = buildEditDoc('<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20"><path d="M0 0H10V10H0Z"/><path d="M5 5H15V15H5Z"/><path d="M30 0H35V5H30Z"/></svg>');
    if (!r.ok) throw new Error(r.error);
    const u = unionPieces(r.doc, computePieces(r.doc, 0.01), 1)!;
    expect(u.merged).toBe(2);
    expect(computePieces(u.doc, 0.01)).toHaveLength(2);
    // La suelta conserva sus nodos exactos.
    expect(u.doc.paths.some((p) => p.subs.some((s) => s.nodes.some((n) => n.p.x === 35 && n.p.y === 5)))).toBe(true);
  });
  it('si ninguna se toca no hace nada', async () => {
    const { unionPieces } = await import('./editDoc');
    const r = buildEditDoc('<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20"><path d="M0 0H10V10H0Z"/><path d="M20 0H25V5H20Z"/></svg>');
    if (!r.ok) throw new Error(r.error);
    expect(unionPieces(r.doc, computePieces(r.doc, 0.01), 1)).toBeNull();
  });
});

describe('el caso de la captura: ojo en forma de hoja', () => {
  it('la punta del ojo (dos curvas que se juntan) es interna y se redondea con un arco', () => {
    // Cuadrado negro con un ojo en forma de hoja: dos curvas que se juntan en puntas.
    const doc = docOf('M0 0H30V20H0Z M5 12C10 6 20 6 25 8C20 12 10 14 5 12Z', 'fill-rule="evenodd"');
    const inner = internalCorners(doc, computePieces(doc, 0.005), 0.005);
    const tip = inner.find((c) => { const p = doc.paths[0].subs[c.ref.sub].nodes[c.ref.node].p; return p.x === 25 && p.y === 8; });
    expect(tip).toBeTruthy();
    expect(tip!.angleDeg).toBeLessThan(90);
    const before = doc.paths[0].subs[1].nodes.length;
    const r = roundCorner(doc, tip!.ref, 0.8)!;
    expect(r.doc.paths[0].subs[1].nodes.length).toBe(before + 1);
    // La punta ya no está: el contorno no pasa por (25, 8).
    expect(r.doc.paths[0].subs[1].nodes.some((n) => n.p.x === 25 && n.p.y === 8)).toBe(false);
    expect(r.radius).toBeCloseTo(0.8, 6);
  });
});
