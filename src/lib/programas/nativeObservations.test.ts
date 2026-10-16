import { describe, expect, it } from 'vitest';
import observations from './__fixtures__/aspire-c-flow.json';
import { createPreparation, type PreparationObservation } from './preparation';
import { validateObservation } from '../../../supabase/functions/_shared/preparationProtocol';

// Capturados con QualifyFlow.lua en Aspire 10.514, base C, el 2026-10-15.
// Solo rectángulos ficticios; ninguna consulta ni escritura en producción.
describe('informes del recorrido nativo C contra el contrato del servidor', () => {
  it.each([1, 2, 3, 4, 5])('acepta la revisión nativa %i con posiciones y auxiliares comprobados', (revision) => {
    const doc = createPreparation('qualification-flow', 'C', [
      { id: 'flow-a', designName: 'Muestra A', widthMm: 12, heightMm: 30, stampType: 'CLASICO', vectorPreviewUrl: 'fixture.svg' },
      { id: 'flow-b', designName: 'Muestra B', widthMm: 12, heightMm: 30, stampType: '3MM', vectorPreviewUrl: 'fixture.svg' },
    ]);
    doc.supportVerified = true; Object.values(doc.recipes).forEach((recipe) => { recipe.verified = true; });
    doc.recipes.ALIMENTO.perimeterTemplate = { name: 'Corte Forma.ToolpathTemplate', path: 'qualification-flow/ALIMENTO/food_perimeter/fixture.ToolpathTemplate' };
    doc.stamps.forEach((s, index) => { s.instanceId = `qualification:flow-${index ? 'b' : 'a'}`; s.columnId = 'p25'; s.centerX = 50.176; });
    doc.stamps[0].topY = -8.958; doc.stamps[1].topY = -65;
    if (revision >= 2) Object.assign(doc.stamps[0], { columnId: 'p38', centerX: 235.351, topY: -60 });
    if (revision >= 3) Object.assign(doc.stamps[0], { widthMm: 18, heightMm: 45 });
    if (revision >= 4) doc.stamps[0].recipe = 'ALIMENTO';
    const result = validateObservation(observations[revision - 1], doc, revision);
    expect(result.issues).toEqual([]);
    expect(result.recalculated).toBe(true); expect(result.execution?.verified).toBe(true);
  });
  it('conserva la corrección interna al mover y escalar, con la misma fuente y dos instancias', () => {
    const reports = observations as PreparationObservation[];
    expect(reports.every((r) => r.stamps.length === 2)).toBe(true);
    expect(reports[1].stamps[0].svg).toContain('8.500000');
    expect(reports[2].stamps[0].svg).toContain('12.750000');
    expect(reports[4].stamps[0].svg).toBe(reports[3].stamps[0].svg);
    expect(new Set(reports.map((r) => r.stamps[0].sourceHash)).size).toBe(1);
  });
});
