// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { runPasses } from './passes';
import { parseSvgShapes } from './svgShapes';
import { DEFAULT_ANALYSIS_OPTIONS, FRESA_ALIMENTO, FRESA_ANALYSIS_VERSION, primaryProfile } from './config';
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
