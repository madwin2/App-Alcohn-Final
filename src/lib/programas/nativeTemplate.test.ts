import { describe, expect, it } from 'vitest';
import { foodSelectorLayers, inspectNativeTemplate, isNativeTemplateFilename } from '../../../supabase/functions/_shared/nativeTemplate';

function fixture(overrides: Record<string, unknown> = {}, name = '3 Trayectoria de prueba') {
  const chunks: Uint8Array[] = [new Uint8Array([3, 0, 0, 0]), new TextEncoder().encode('mcTemplateTree')];
  const wide = (text: string) => new Uint8Array([255, 254, 255, text.length, ...Array.from(text).flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])]);
  chunks.push(wide(name));
  const operation = Object.fromEntries(Object.entries(overrides).filter(([key]) => key === 'ToolpathType' || key.startsWith('_ppd')));
  for (const [key, value] of Object.entries({ ...operation, _vcgfVersion: 3, _vcgfFilterUsed: true, _vcgfOnlyOnLayers: true, _vcgfSelectOpen: false,
    _vcgfSelectClosed: true, _vcgfNumLayers: 1, _vcgfLayerName0: 'REPASO CLASICO', ...overrides })) {
    chunks.push(wide(key));
    const type = typeof value === 'string' ? 3 : typeof value === 'boolean' ? 2 : Number.isInteger(value) ? 1 : 0;
    chunks.push(new Uint8Array([type, 0, 0, 0]));
    if (typeof value === 'string') chunks.push(wide(value));
    else if (typeof value === 'boolean') chunks.push(new Uint8Array([Number(value)]));
    else { const buffer = new Uint8Array(type === 0 ? 8 : 4); const view = new DataView(buffer.buffer);
      if (type === 0) view.setFloat64(0, Number(value), true); else view.setInt32(0, Number(value), true); chunks.push(buffer); }
  }
  return new Uint8Array(chunks.flatMap((c) => [...c]));
}
describe('selección de plantillas nativas de Aspire', () => {
  it('acepta el nombre interior de la base y acentos sin admitir rutas como nombre', () => {
    expect(isNativeTemplateFilename('4 Perfilado 0.1MM [interior.ToolpathTemplate')).toBe(true);
    expect(isNativeTemplateFilename('Corte perímetro.ToolpathTemplate')).toBe(true);
    expect(isNativeTemplateFilename('../Corte.ToolpathTemplate')).toBe(false);
    expect(isNativeTemplateFilename('C:\\Corte.ToolpathTemplate')).toBe(false);
    expect(isNativeTemplateFilename('Corte.exe')).toBe(false);
  });
  it('comprueba capas automáticas usando parámetros, no el nombre del archivo', () => {
    expect(inspectNativeTemplate(fixture())).toEqual({ stage: 3, subOrder: 0, issues: [], selectors: [{ automatic: true, onlyOnLayers: true, open: false, closed: true, layers: ['REPASO CLASICO'] }] });
  });
  it('ordena planeado antes de cajeado y taladrado antes de roscado dentro de una misma etapa', () => {
    expect(inspectNativeTemplate(fixture({ _vcgfLayerName0: 'Planeado' }, '1 Planeado')).subOrder).toBe(0);
    expect(inspectNativeTemplate(fixture({ _vcgfLayerName0: 'Rectangulo exterior' }, '1 Cajeado')).subOrder).toBe(1);
    expect(inspectNativeTemplate(fixture({ ToolpathType: 'Thread' }, '0 Roscado')).subOrder).toBe(1);
    expect(inspectNativeTemplate(fixture({ ToolpathType: 'Drill' }, '0 Taladrado')).subOrder).toBe(0);
  });
  it.each([{ _vcgfFilterUsed: false }, { _vcgfNumLayers: 0 }, { _vcgfOnlyOnLayers: false }, { _vcgfSelectClosed: false }])('rechaza selección que no se puede recalcular automáticamente: %j', (override) => {
    expect(inspectNativeTemplate(fixture(override)).issues.length).toBeGreaterThan(0);
  });
  it('rechaza archivos vacíos, desconocidos y selectores truncados', () => {
    expect(inspectNativeTemplate(new Uint8Array()).issues.length).toBeGreaterThan(0);
    expect(inspectNativeTemplate(new Uint8Array(100)).issues.length).toBeGreaterThan(0);
    expect(inspectNativeTemplate(fixture().subarray(0, -10)).issues.length).toBeGreaterThan(0);
  });
  it('acepta el perfilado manual solo cuando se declara como repaso del tipo y profundidad confirmados', () => {
    const bytes = fixture({ ToolpathType: 'Profile Outside', _ppdStartDepth: 0.5, _ppdCutDepth: 0.6,
      _vcgfFilterUsed: false, _vcgfSelectClosed: false, _vcgfNumLayers: 0 });
    expect(inspectNativeTemplate(bytes).issues.length).toBeGreaterThan(0);
    expect(inspectNativeTemplate(bytes, 'fine_full').issues).toEqual([]);
    expect(inspectNativeTemplate(bytes, 'fine_internal').issues.length).toBeGreaterThan(0);
    expect(inspectNativeTemplate(fixture({ ToolpathType: 'Profile Outside', _ppdStartDepth: 0.5, _ppdCutDepth: 1.7, _vcgfFilterUsed: false }), 'fine_full').issues.length).toBeGreaterThan(0);
  });
  it('acepta Corte Forma únicamente en el campo perimetral y adapta las capas principales de 3MM para Alimento', () => {
    const bytes = fixture({ ToolpathType: 'Profile Outside', _ppdStartDepth: 3.5, _ppdCutDepth: 5.5,
      _vcgfFilterUsed: false, _vcgfSelectClosed: false, _vcgfNumLayers: 0 }, 'Corte Forma');
    expect(inspectNativeTemplate(bytes, 'automatic').issues.length).toBeGreaterThan(0);
    expect(inspectNativeTemplate(bytes, 'fine_full').issues.length).toBeGreaterThan(0);
    expect(inspectNativeTemplate(bytes, 'food_perimeter')).toMatchObject({ issues: [], stage: 5, subOrder: 1 });
    const main = inspectNativeTemplate(fixture({ _vcgfNumLayers: 2, _vcgfLayerName0: 'VECTOR 3MM', _vcgfLayerName1: 'Offset exterior vector 3mm' }));
    expect(foodSelectorLayers(main)).toEqual(['VECTOR ALIMENTO', 'Offset exterior vector alimento']);
    expect(main.selectors[0].layers).toEqual(['VECTOR 3MM', 'Offset exterior vector 3mm']);
    expect(foodSelectorLayers(inspectNativeTemplate(fixture({ _vcgfLayerName0: 'Planeado' })))).toBeUndefined();
  });
});
