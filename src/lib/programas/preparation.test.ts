import { describe, expect, it } from 'vitest';
import { adoptObservedStamp, observedSvgForStamp, buildExecutionPlan, arrangePreparation, createPreparation, defaultColumns, isPreparationDocument, preparationConflicts, preparationFingerprint, validatePreparation, type ObservedStamp, type PreparationSource } from './preparation';
import { checkedPreparation, missingPreparationLayers, toLua, validateObservation } from '../../../supabase/functions/_shared/preparationProtocol';

const sources: PreparationSource[] = [0, 1, 2].map((i) => ({ id: `s${i}`, designName: `Sello ${i}`, widthMm: 12, heightMm: 30, stampType: 'CLASICO', tipoPlanchuela: 19, vectorPreviewUrl: `https://example.test/s${i}.svg` }));
function ready() {
  const doc = createPreparation('program', 'C', sources);
  doc.supportVerified = true;
  for (const recipe of Object.values(doc.recipes)) recipe.verified = true;
  return doc;
}
const codes = (doc: ReturnType<typeof ready>) => validatePreparation(doc, sources).map((i) => i.code);
function actual(): ObservedStamp[] { return ready().stamps.map((s) => ({ ...s, geometryHash: 'shape', sourceHash: 'file' })); }

describe('preparación del soporte', () => {
  it('representa soportes diferentes y exige verificar las medidas físicas', () => {
    expect(defaultColumns('C')).toHaveLength(4); expect(defaultColumns('G')).toHaveLength(2); expect(defaultColumns('XL')).toHaveLength(1);
    expect(codes(createPreparation('program', 'C', sources))).toContain('SUPPORT');
    expect(codes(ready())).toEqual([]);
  });
  it('no ocupa el largo completo al cargar pocos sellos', () => {
    const doc = ready(); expect(doc.stamps[2].topY).toBeCloseTo(doc.columns[2].topY - 76);
    expect(doc.columns[2].bottomY).toBe(-400);
  });
  it.each(['WIDTH', 'LENGTH', 'MATERIAL', 'SEPARATION', 'SOURCE_CHANGED', 'MISSING', 'DUPLICATE'] as const)('detecta %s antes del paquete', (code) => {
    const doc = ready();
    if (code === 'WIDTH') doc.stamps[0].centerX += 20;
    if (code === 'LENGTH') doc.stamps[0].topY = -399;
    if (code === 'MATERIAL') doc.columns[2].available = false;
    if (code === 'SEPARATION') doc.stamps[1].topY = doc.stamps[0].topY - 35;
    if (code === 'SOURCE_CHANGED') doc.stamps[0].sourceUrl += '?replaced';
    if (code === 'MISSING') doc.stamps.pop();
    if (code === 'DUPLICATE') doc.stamps.push({ ...doc.stamps[0] });
    expect(codes(doc)).toContain(code);
    expect(() => checkedPreparation(doc, sources)).toThrow();
  });
  it('mantiene la venta intacta y no deforma la proporción al fabricar', () => {
    const doc = ready(); doc.stamps[0].widthMm *= 1.2; doc.stamps[0].heightMm *= 1.2;
    expect(codes(doc)).not.toContain('ASPECT'); expect(sources[0].widthMm).toBe(12);
    doc.stamps[0].widthMm += 1; expect(codes(doc)).toContain('ASPECT');
  });
  it('no permite incluir en la corrida sellos excluidos todavía asignados', () => {
    const doc = ready(); doc.stamps[0].excluded = true;
    expect(codes(doc)).toContain('EXCLUDED_PENDING');
  });
  it('rechaza tipos sin receta, datos no finitos y rutas arbitrarias', () => {
    expect(createPreparation('p', 'C', [{ ...sources[0], stampType: 'LACRE' }]).stamps[0].excluded).toBe(true);
    const doc = ready(); doc.stamps[0].centerX = NaN; expect(isPreparationDocument(doc)).toBe(false);
    doc.stamps[0].centerX = 1; doc.recipes.CLASICO.templatePaths = ['../other']; expect(isPreparationDocument(doc)).toBe(false);
  });
  it('reacomoda libres sin mover fijos ni cambiar medida, geometría o receta', () => {
    const doc = ready(); doc.stamps[0].pinned = true; doc.stamps[0].topY = -60;
    doc.stamps[1].vectorSvg = '<svg/>';
    const arranged = arrangePreparation(doc);
    expect(arranged.stamps[0]).toEqual(doc.stamps[0]);
    expect(arranged.stamps[1].vectorSvg).toBe('<svg/>');
    expect(codes(arranged)).not.toContain('SEPARATION');
  });
});

describe('contrato de sincronización', () => {
  it('bloquea el paquete si faltan capas de receta o el repaso de respaldo', () => {
    const doc = ready();
    const common = { selectors: [{ layers: ['Corte', 'Taladrado', 'Offset 1 vector', 'Planeado', 'Rectangulo exterior', 'VECTOR', 'Offset exterior vector'] }] };
    expect(missingPreparationLayers(doc, [common])).toEqual(['REPASO CLASICO']);
    expect(missingPreparationLayers(doc, [common, { selectors: [], selectionLayers: ['REPASO CLASICO'] }])).toEqual([]);
    doc.stamps.forEach((s) => { s.fine = { mode: 'none', needsFine: false, inputHash: '', widthMm: s.widthMm, heightMm: s.heightMm, recipe: s.recipe, outcome: 'sin_analisis' }; });
    expect(missingPreparationLayers(doc, [common])).toEqual([]);
    doc.stamps[0].recipe = 'ALIMENTO';
    expect(missingPreparationLayers(doc, [common])).toContain('Corte Alimento');
    expect(missingPreparationLayers(doc, [common])).toContain('VECTOR ALIMENTO');
    expect(missingPreparationLayers(doc, [common, { selectors: [], selectorLayers: ['VECTOR ALIMENTO', 'Offset exterior vector alimento', 'Corte Alimento'] }])).toEqual([]);
  });
  it('no muestra ni analiza un dibujo observado de una fuente anterior', () => {
    const stamp = ready().stamps[0];
    const observation = { revision: 1, recalculated: true, issues: [], stamps: [{ ...actual()[0], svg: '<svg/>', sourceUrl: stamp.sourceUrl }] };
    expect(observedSvgForStamp(stamp, observation)).toBe('<svg/>');
    expect(observedSvgForStamp({ ...stamp, sourceUrl: 'nueva.svg' }, observation)).toBeUndefined();
    observation.stamps[0].selloId = 'otro'; expect(observedSvgForStamp(stamp, observation)).toBeUndefined();
  });
  it('adopta la planchuela real cuando el sello se movió en Aspire', () => {
    const doc = ready(), stamp = actual()[0]; stamp.centerX = doc.columns[0].centerX;
    const adopted = adoptObservedStamp(doc, stamp);
    expect(adopted.stamps[0].columnId).toBe(doc.columns[0].id);
    expect(doc.stamps[0].columnId).toBe(doc.columns[2].id);
    stamp.centerX = 1000; expect(() => adoptObservedStamp(doc, stamp)).toThrow();
  });
  it('conserva la elección del repaso al adoptar medidas y exige analizar la geometría nueva', () => {
    const doc = ready(), stamp = actual()[0];
    doc.stamps[0].fine = { mode: 'aspire', scope: 'internal', needsFine: true, inputHash: 'old', analysisVersion: 6,
      geometryHash: 'old', widthMm: 12, heightMm: 30, recipe: 'CLASICO', outcome: 'repaso_util' };
    stamp.widthMm = 13; stamp.heightMm = 32.5;
    const fine = adoptObservedStamp(doc, stamp).stamps[0].fine;
    expect(fine?.mode).toBe('aspire'); expect(fine?.scope).toBe('internal');
    expect(fine?.geometryHash).toBeUndefined(); expect(fine?.analysisVersion).toBeUndefined();
    expect(fine?.widthMm).toBe(13); expect(fine?.outcome).toBe('sin_analisis');
  });
  it('exige comprobación de auxiliares aunque el informe diga recalculado', () => {
    const doc = ready(), stamps = actual();
    const observation = { revision: 1, recalculated: true, stamps, issues: [] };
    expect(validateObservation(observation, doc, 1).issues.some((i) => i.code === 'EXECUTION')).toBe(true);
    const execution = buildExecutionPlan(doc, stamps);
    expect(validateObservation({ ...observation, execution: { verified: true, rulesVersion: execution.rulesVersion, stampCount: 3, columnCount: 1 } }, doc, 1).issues).toEqual([]);
  });
  it('combina distintas propiedades y pregunta solo por cambios incompatibles de la misma', () => {
    const base = actual(), current = actual(), plan = ready().stamps;
    plan[0].centerX += 3; current[0].geometryHash = 'letras separadas';
    expect(preparationConflicts(base, plan, current)).toEqual([]);
    current[0].centerX += 4; expect(preparationConflicts(base, plan, current)[0].property).toBe('position');
    current[0].centerX = plan[0].centerX; expect(preparationConflicts(base, plan, current)).toEqual([]);
  });
  it('revalida medidas reales y faltantes aunque el gadget diga que recalculó', () => {
    const stamps = actual(); stamps.pop(); stamps[0].widthMm = 50;
    const report = validateObservation({ revision: 1, recalculated: true, stamps, issues: [] }, ready(), 1);
    expect(report.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['MISSING', 'WIDTH']));
  });
  it('rechaza duplicados, SVG activo, receta inválida y revisiones distintas', () => {
    const observation = { revision: 1, recalculated: true, stamps: actual(), issues: [] };
    expect(() => validateObservation(observation, ready(), 2)).toThrow();
    expect(() => validateObservation({ ...observation, stamps: [...observation.stamps, observation.stamps[0]] }, ready(), 1)).toThrow();
    observation.stamps[0].svg = '<svg><script/></svg>'; expect(() => validateObservation(observation, ready(), 1)).toThrow();
    observation.stamps[0].svg = '<svg/>'; (observation.stamps[0] as unknown as { recipe: string }).recipe = 'NO';
    expect(validateObservation(observation, ready(), 1).issues.some((i) => i.severity === 'error')).toBe(true);
  });
  it('no aprueba un recálculo fallido', () => {
    expect(validateObservation({ revision: 1, recalculated: false, stamps: actual(), issues: [] }, ready(), 1).issues.map((i) => i.code)).toContain('TOOLPATHS');
  });
  it('avisa diferencias de medida real contra el plan sin reescribir lo vendido', () => {
    const stamps = actual(); stamps[0].heightMm += 1;
    const doc = ready();
    expect(validateObservation({ revision: 1, recalculated: true, stamps, issues: [] }, doc, 1).issues.map((i) => i.code)).toContain('MEASURE_DIFFERENCE');
    expect(doc.stamps[0].heightMm).toBe(30);
  });
  it('serializa nombres y SVG sin ejecutar código Lua', () => {
    expect(toLua({ text: 'a"\n\\1\u0000' })).toBe('{["text"]="a\\"\\010\\\\1\\000"}');
    expect(() => toLua(NaN)).toThrow(); expect(preparationFingerprint('á')).toBe('2:12933');
  });
});

describe('operaciones del armado final', () => {
  it('separa el repaso interior puntual del perfilado habitual', () => {
    const doc = ready();
    doc.stamps[0].fine = { mode: 'aspire', scope: 'internal', needsFine: true, inputHash: '', widthMm: 12, heightMm: 30, recipe: 'CLASICO', outcome: 'sin_analisis' };
    expect(buildExecutionPlan(doc).stamps[0].fineLayer).toBe('REPASO INTERIOR CLASICO');
    expect(buildExecutionPlan(doc).stamps[1].fineLayer).toBe('REPASO CLASICO');
    expect(isPreparationDocument(doc)).toBe(true);
    doc.stamps[0].fine.mode = 'whole'; expect(isPreparationDocument(doc)).toBe(false);
  });
  it('calcula corte, taladro y material al cambiar de planchuela', () => {
    const doc = ready(); doc.stamps = [doc.stamps[0]];
    doc.stamps[0].columnId = 'p38'; doc.stamps[0].centerX = doc.columns[3].centerX;
    const execution = buildExecutionPlan(doc);
    expect(execution.issues).toEqual([]);
    expect(execution.stamps[0].cut.x2 - execution.stamps[0].cut.x1).toBe(46);
    expect(execution.stamps[0].drill.radiusMm).toBe(3);
    expect(execution.columns[0].materialMm).toBe(34);
    expect(execution.columns[0].bottomY).toBeCloseTo(doc.stamps[0].topY - 37);
  });
  it('impide cortes sobre otro sello aunque sus dibujos no se solapen en X', () => {
    const doc = ready(); doc.stamps = doc.stamps.slice(0, 2);
    for (const s of doc.stamps) { s.widthMm = 4; s.columnId = 'p25'; s.topY = -10; }
    doc.stamps[0].centerX = doc.columns[0].centerX - 5; doc.stamps[1].centerX = doc.columns[0].centerX + 5;
    expect(buildExecutionPlan(doc).issues.some((i) => i.code === 'SEPARATION')).toBe(true);
  });
  it('reserva espacio para el último corte y distribuye libres en otras planchuelas', () => {
    const doc = ready(); doc.columns[2].bottomY = -50;
    const arranged = arrangePreparation(doc);
    expect(arranged.stamps.filter((s) => s.columnId === 'p19')).toHaveLength(1);
    expect(buildExecutionPlan(arranged).issues).toEqual([]);
    arranged.stamps[0].topY = -15; arranged.stamps[0].heightMm = 30;
    const machining = buildExecutionPlan(arranged).issues.filter((i) => i.code === 'MACHINING_LENGTH');
    expect(machining.length).toBeGreaterThan(0);
    expect(machining.every((i) => i.severity === 'warning')).toBe(true);
  });
});
