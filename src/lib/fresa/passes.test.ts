// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runPasses } from './passes';
import { parseSvgShapes } from './svgShapes';
import { DEFAULT_ANALYSIS_OPTIONS, FRESA_ALIMENTO, FRESA_ANALYSIS_VERSION, FRESA_FINA, primaryProfile } from './config';
import { PREPARATION_RULES } from '../programas/preparation';
import { chequearSvg, fresaCacheKey } from './chequeoFresa';

const gapSvg = (gap: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path d="M2 2h5v6h-5z M${7 + gap} 2h5v6h-5z"/></svg>`;
const passes = (gap: number) => runPasses(parseSvgShapes(gapSvg(gap)).shapes, 1, FRESA_ALIMENTO, 'ALIMENTO', DEFAULT_ANALYSIS_OPTIONS);

describe('comparación de pasadas', () => {
  it('usa la herramienta configurada y separa profundidad principal del repaso', () => {
    expect(primaryProfile('CLASICO')).toMatchObject({ tipDiameterMm: 0.6, halfAngleDeg: 15, finalDepthMm: 1.7 });
    expect(primaryProfile('ALIMENTO')).toMatchObject({ finalDepthMm: 3, minDepthMm: 1 });
    expect(FRESA_ALIMENTO).toMatchObject({ tipDiameterMm: 0.2, physicalTipDiameterMm: 0.1 });
    expect(PREPARATION_RULES.fineAnalysisVersion).toBe(FRESA_ANALYSIS_VERSION);
    expect(passes(1.5).fineReference).toEqual({ lowerMm: 0.4, preferredMm: 0.5 });
  });
  it('no sugiere repaso si la primera ya separa las piezas', () => {
    expect(passes(1.5).outcome).toBe('sin_repaso');
    expect(passes(1.5).candidates).toHaveLength(0);
  });
  it('sugiere repaso solo donde la fina puede mejorar la primera', () => {
    const result = passes(0.8);
    expect(result.outcome).toBe('repaso_sugerido');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.benefitAreaMm2 > 0)).toBe(true);
  });
  it('distingue la franja 0,4–0,5 sin certificarla automáticamente', () => {
    expect(passes(0.74).outcome).toBe('revisar_rango');
  });
  it('no presenta como solución una fina que tampoco separa', () => {
    expect(passes(0.25).outcome).toBe('revisar_diseno');
  });
  it('no inventa la receta de un vector sin tipo conocido', () => {
    const result = runPasses(parseSvgShapes(gapSvg(0.8)).shapes, 1, FRESA_ALIMENTO, null, DEFAULT_ANALYSIS_OPTIONS);
    expect(result.outcome).toBe('sin_receta'); expect(result.primary).toBeNull();
  });
  it('la receta participa de la caché y sobrevive a la corrección', async () => {
    const classic = { mode: 'declarado' as const, stampType: 'CLASICO' };
    const deep = { ...classic, stampType: '3MM' };
    expect(fresaCacheKey(gapSvg(0.8), classic)).not.toBe(fresaCacheKey(gapSvg(0.8), deep));
    const report = await chequearSvg(gapSvg(0.8), deep);
    expect(report.passes?.primaryProfile?.finalDepthMm).toBe(3);
  });
});

describe('selección automática del repaso 0,2 (caso real: Magui Lucero)', () => {
  // Vector real del programa 15 OCT x15 C, 35 mm de largo.
  const svg = readFileSync('src/lib/fresa/__fixtures__/magui-lucero.svg', 'utf8');
  const k = 35 / 1497.29;
  const result = runPasses(parseSvgShapes(svg).shapes, k, FRESA_FINA, 'CLASICO', DEFAULT_ANALYSIS_OPTIONS);
  /** Pieza por su centro en unidades del SVG (x, y). */
  const pieceAt = (x: number, y: number) => result.repaso.pieces.find((p) =>
    p.bounds.minX / k <= x && x <= p.bounds.maxX / k && p.bounds.minY / k <= y && y <= p.bounds.maxY / k)!;

  it('repasa las dos ranuras de la E, no solo una', () => {
    const e = pieceAt(1180, 1795);
    expect(e.selected).toBe(true);
    const slots = result.repaso.zones.filter((z) => z.pieceIds.includes(e.id) && z.center.x / k > 1161 && z.center.x / k < 1227);
    expect(slots.some((z) => z.center.y / k < 1783)).toBe(true); // ranura de arriba
    expect(slots.some((z) => z.center.y / k > 1805)).toBe(true); // ranura de abajo (antes quedaba afuera)
  });

  it('no pasa la 0,2 por piezas donde la 0,6 ya alcanza', () => {
    for (const [x, y] of [[644, 1795], [780, 1795], [1070, 1450], [116, 1950], [775, 1950], [1260, 1990]]) {
      expect(pieceAt(x, y).selected).toBe(false); // I, L, I grande y las tres patas
    }
    expect(result.repaso.pieces.filter((p) => p.selected).length).toBeLessThan(result.repaso.pieces.length);
  });

  it('con la 0,2 se separa todo: repaso sugerido', () => {
    expect(result.outcome).toBe('repaso_sugerido');
    expect(result.candidates.length).toBe(result.repaso.zones.length);
  });
});

describe('selección del repaso: formas simples', () => {
  const run = (svg: string) => runPasses(parseSvgShapes(svg).shapes, 1, FRESA_FINA, 'CLASICO', DEFAULT_ANALYSIS_OPTIONS);
  it('un cuadrado sólido no necesita la 0,2', () => {
    const r = run('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20"><path d="M5 5h10v10h-10z"/></svg>');
    expect(r.repaso.zones).toHaveLength(0);
    expect(r.outcome).toBe('sin_repaso');
  });
  it('una ranura de 0,6 mm dentro de una pieza sí la necesita', () => {
    const r = run('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 5h10v10h-10z M7 9.7h6v0.6h-6z"/></svg>');
    expect(r.repaso.zones.length).toBeGreaterThan(0);
    expect(r.repaso.pieces.every((p) => p.selected)).toBe(true);
  });
});

describe('el repaso pesa según el tamaño de la letra (caso real: 4708)', () => {
  // Números de 21 mm (68,55 mm de largo): la 0,2 solo afina rincones de ~0,5 mm.
  const svg = readFileSync('src/lib/fresa/__fixtures__/4708.svg', 'utf8');
  const shapes = parseSvgShapes(svg).shapes;
  const at = (longMm: number) => runPasses(shapes, longMm / 194.33, FRESA_FINA, 'CLASICO', DEFAULT_ANALYSIS_OPTIONS);

  it('en números grandes no elige repaso', () => {
    const r = at(68.55);
    expect(r.repaso.zones).toHaveLength(0);
    expect(r.repaso.pieces.some((p) => p.selected)).toBe(false);
    // Sin repaso porque lo que deja la 0,6 es chico para el número: tampoco pide revisar.
    expect(r.outcome).toBe('sin_repaso');
  });
  it('el mismo diseño chico sí lo necesita', () => {
    expect(at(12).repaso.zones.length).toBeGreaterThan(0);
  });
});
