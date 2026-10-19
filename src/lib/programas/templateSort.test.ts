import { describe, expect, it } from 'vitest';
import type { NativeSelector, NativeTemplateInspection, NativeTemplatePurpose } from '../../../supabase/functions/_shared/nativeTemplate';
import { missingForRecipe, recipesForLayers, sortTemplates } from './templateSort';

const sel = (s: Partial<NativeSelector>): NativeSelector => ({ automatic: true, onlyOnLayers: true, open: true, closed: true, layers: [], ...s });
/** Simula el control nativo: automática si tiene capas automáticas; manual según su tipo y profundidades. */
const file = (name: string, s: NativeSelector, stage = 0) => ({
  name,
  inspect: (purpose: NativeTemplatePurpose): NativeTemplateInspection => {
    const ok = purpose === 'automatic' ? s.automatic && s.layers.length > 0
      : !s.automatic && s.toolpathType === (purpose === 'fine_internal' ? 'Profile Inside' : 'Profile Outside')
        && s.startDepthMm === (purpose === 'food_perimeter' ? 3.5 : 0.5) && s.cutDepthMm === (purpose === 'food_perimeter' ? 5.5 : 0.6);
    return { selectors: [s], issues: ok ? [] : ['no'], stage };
  },
});

// Las 12 plantillas de la base C (2026-10-19).
const base = [
  file('0 Taladrado', sel({ layers: ['Taladrado'], toolpathType: 'Drill' })),
  file('0 Roscado', sel({ layers: ['Taladrado'], toolpathType: 'Thread' })),
  file('1 Planeado 6MM', sel({ layers: ['Planeado'] }), 1),
  file('1 Cajeado 6MM', sel({ layers: ['Rectangulo exterior', 'Offset 1 vector'] }), 1),
  file('2 Cajeado 1MM', sel({ layers: ['VECTOR', 'Offset exterior vector'] }), 2),
  file('2 Cajeado 1MM 3mm', sel({ layers: ['VECTOR 3MM', 'Offset exterior vector 3mm'] }), 2),
  file('3 Perfilado 0.5MM', sel({ layers: ['VECTOR'], toolpathType: 'Profile Outside', startDepthMm: 0.5, cutDepthMm: 1.7 }), 3),
  file('3 Perfilado 0.5MM 3mm', sel({ layers: ['VECTOR 3MM'], toolpathType: 'Profile Outside', startDepthMm: 0.5, cutDepthMm: 3 }), 3),
  file('4 Perfilado 0.1MM', sel({ automatic: false, toolpathType: 'Profile Outside', startDepthMm: 0.5, cutDepthMm: 0.6 }), 4),
  file('4 Perfilado 0.1MM [interior', sel({ automatic: false, toolpathType: 'Profile Inside', startDepthMm: 0.5, cutDepthMm: 0.6 }), 4),
  file('5 Corte 6MM', sel({ layers: ['Corte'], toolpathType: 'Profile On', startDepthMm: 3.5, cutDepthMm: 5.5 }), 5),
  file('Corte Forma', sel({ automatic: false, layers: ['Corte'], toolpathType: 'Profile Outside', startDepthMm: 3.5, cutDepthMm: 5.5 }), 5),
];

describe('subir todas las plantillas juntas', () => {
  it('cada una va a su receta por las capas que toma', () => {
    expect(recipesForLayers(['VECTOR', 'Offset exterior vector'])).toEqual(['CLASICO']);
    expect(recipesForLayers(['VECTOR 3MM'])).toEqual(['3MM', 'ALIMENTO']);
    expect(recipesForLayers(['Taladrado'])).toEqual(['CLASICO', '3MM', 'ALIMENTO']);
  });

  it('ordena las 12 de la base C sin que falte nada', () => {
    const { sorted, rejected } = sortTemplates(base);
    expect(rejected).toEqual([]);
    const where = Object.fromEntries(sorted.map((s) => [s.name, s.slot.kind === 'automatic' ? s.slot.recipes.join('+') : s.slot.kind]));
    expect(where).toMatchObject({
      '0 Taladrado': 'CLASICO+3MM+ALIMENTO', '2 Cajeado 1MM': 'CLASICO', '3 Perfilado 0.5MM 3mm': '3MM+ALIMENTO',
      '4 Perfilado 0.1MM': 'fine_full', '4 Perfilado 0.1MM [interior': 'fine_internal', 'Corte Forma': 'food_perimeter',
    });
    for (const r of ['CLASICO', '3MM', 'ALIMENTO'] as const) expect(missingForRecipe(r, sorted)).toEqual([]);
  });

  it('rechaza lo que no reconoce o repite un lugar, y dice qué falta', () => {
    const { sorted, rejected } = sortTemplates([
      base[0], base[8],
      file('otro repaso', sel({ automatic: false, toolpathType: 'Profile Outside', startDepthMm: 0.5, cutDepthMm: 0.6 }), 4),
      file('rara', sel({ automatic: false, toolpathType: 'Pocket' })),
    ]);
    expect(rejected.map((r) => r.name)).toEqual(['otro repaso', 'rara']);
    expect(missingForRecipe('CLASICO', sorted)).toEqual([]);
    expect(missingForRecipe('ALIMENTO', sorted)).toEqual(['Corte Forma']);
  });
});
