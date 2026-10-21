// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildEditDoc, computePieces, removeRefs, type EditDoc } from '@/lib/fresa/editDoc';
import {
  alignOriginal,
  compararConDoc,
  components,
  dilate,
  erode,
  inkMaskFromRGBA,
  otsuThreshold,
  rasterizeDoc,
  resumenDiferencias,
  type Mask,
} from './comparacionOriginal';

const docOf = (svg: string): EditDoc => {
  const b = buildEditDoc(svg);
  if (!b.ok) throw new Error(b.error);
  return b.doc;
};

/** «Original» simulado: el vector rasterizado con otro recorte y otra escala (como sale de la hoja). */
function fakeOriginal(doc: EditDoc, unit: number, margin: number): Mask {
  const b = doc.paths.flatMap((p) => p.subs.flatMap((s) => s.nodes.map((n) => n.p)));
  const minX = Math.min(...b.map((p) => p.x));
  const minY = Math.min(...b.map((p) => p.y));
  const maxX = Math.max(...b.map((p) => p.x));
  const maxY = Math.max(...b.map((p) => p.y));
  const w = Math.ceil((maxX - minX) / unit) + 2 * margin;
  const h = Math.ceil((maxY - minY) / unit) + 2 * margin;
  return rasterizeDoc(doc, minX - margin * unit, minY - margin * unit, unit, w, h);
}

// «hi» con el punto de la i, y una «o» al lado. Unidades = mm.
const HI = `<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="12mm" viewBox="0 0 30 12">
  <path d="M1 1h1.5v10h-1.5z M2.5 5h3v1.5h-3z M5.5 5h1.5v6h-1.5z"/>
  <path d="M9 5h1.4v6h-1.4z"/>
  <path d="M8.9 2.4a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0z"/>
  <path fill-rule="evenodd" d="M13 5h5v6h-5z M14.2 6.2h2.6v3.6h-2.6z"/>
</svg>`;

describe('máscaras', () => {
  it('Otsu separa dos grupos', () => {
    const hist = new Array(256).fill(0);
    hist[20] = 100;
    hist[240] = 900;
    const t = otsuThreshold(hist);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(240);
  });
  it('tinta: transparente es fondo y el negativo se invierte', () => {
    const px = (r: number, a = 255) => [r, r, r, a];
    // 3×3: borde blanco, centro negro.
    const pos = [...px(255), ...px(255), ...px(255), ...px(255), ...px(0), ...px(255), ...px(0, 0), ...px(255), ...px(255)];
    expect(Array.from(inkMaskFromRGBA(pos, 3, 3).mask.data)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const neg = [...px(0), ...px(0), ...px(0), ...px(0), ...px(255), ...px(0), ...px(0), ...px(0), ...px(0)];
    const r = inkMaskFromRGBA(neg, 3, 3);
    expect(r.inverted).toBe(true);
    expect(r.mask.data[4]).toBe(1);
  });
  it('dilatar, erosionar y componentes', () => {
    const m: Mask = { data: new Uint8Array(25), width: 5, height: 5 };
    m.data[12] = 1;
    expect(dilate(m, 1).data.reduce((a, b) => a + b, 0)).toBe(9);
    expect(erode(dilate(m, 1), 1).data.reduce((a, b) => a + b, 0)).toBe(1);
    m.data[0] = 1;
    expect(components(m).comps).toHaveLength(2);
  });
  it('rasteriza con la regla de relleno (el ojo de la o queda vacío)', () => {
    const doc = docOf(HI);
    const m = rasterizeDoc(doc, 0, 0, 0.1, 300, 120);
    const at = (x: number, y: number) => m.data[Math.floor(y / 0.1) * 300 + Math.floor(x / 0.1)];
    expect(at(13.5, 8)).toBe(1);
    expect(at(15.5, 8)).toBe(0);
    expect(at(9.7, 2.4)).toBe(1);
  });
});

describe('comparación con el original', () => {
  const doc = docOf(HI);
  const sinPunto = docOf(HI.replace(/<path d="M8\.9[^>]*>/, ''));

  it('alinea aunque el original tenga otro recorte y otra escala', () => {
    const ink = fakeOriginal(doc, 0.037, 23);
    const p = alignOriginal(ink, doc)!;
    expect(p.score).toBeGreaterThan(0.95);
    expect(p.scale).toBeCloseTo(0.037, 2);
  });

  it('el mismo dibujo no da diferencias', () => {
    const ink = fakeOriginal(doc, 0.037, 23);
    const r = compararConDoc(ink, doc, 1);
    expect(r.status).toBe('ok');
    expect(r.parecido).toBeGreaterThan(0.9);
  });

  it('detecta el punto de la i que borró la vectorización', () => {
    const ink = fakeOriginal(doc, 0.037, 23);
    const r = compararConDoc(ink, sinPunto, 1);
    expect(r.status).toBe('diferencias');
    expect(r.diferencias).toHaveLength(1);
    const d = r.diferencias[0];
    expect(d).toMatchObject({ kind: 'falta-pieza', punto: true });
    expect((d.box.minX + d.box.maxX) / 2).toBeCloseTo(9.7, 0);
    expect((d.box.minY + d.box.maxY) / 2).toBeCloseTo(2.4, 0);
    expect(resumenDiferencias(r.diferencias)).toBe('Falta el punto de una i');
  });

  it('un ojo tapado sale como algo que no está en el original', () => {
    const tapado = docOf(HI.replace(' M14.2 6.2h2.6v3.6h-2.6z', ''));
    const r = compararConDoc(fakeOriginal(doc, 0.037, 23), tapado, 1);
    expect(r.diferencias.map((d) => d.kind)).toEqual(['sobra']);
  });

  it('vector real: sin cambios da OK y sin una pieza la encuentra', () => {
    const real = docOf(readFileSync('src/lib/fresa/__fixtures__/magui-lucero.svg', 'utf8'));
    // 1497 unidades de ancho → ~60 mm: 1 unidad ≈ 0,04 mm. Original de ~900 px.
    const mmPerUnit = 0.04;
    const ink = fakeOriginal(real, 1.7, 30);
    expect(compararConDoc(ink, real, mmPerUnit).status).toBe('ok');
    const pieces = computePieces(real, 0.5);
    const chica = [...pieces].sort(
      (a, b) => (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY) - (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY),
    )[0];
    const r = compararConDoc(ink, removeRefs(real, chica.refs), mmPerUnit);
    expect(r.diferencias.filter((d) => d.kind === 'falta-pieza')).toHaveLength(1);
    const d = r.diferencias[0];
    expect(d.box.minX).toBeLessThan(chica.bounds.maxX);
    expect(d.box.maxX).toBeGreaterThan(chica.bounds.minX);
  });
});
