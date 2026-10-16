import { buildExecutionPlan, createPreparation, preparationConflicts, preparationFingerprint, validatePreparation,
  type ObservedStamp, type PreparationDocument, type PreparationObservation, type PreparationSource, type SyncConflict } from '@/lib/programas/preparation';

export type SimulationCase = 'normal' | 'material' | 'width' | 'separation';
export const SIMULATION_CASES: { id: SimulationCase; name: string; description: string }[] = [
  { id: 'normal', name: 'Programa combinado', description: 'Ocho sellos ficticios, cuatro planchuelas y los tres mecanizados.' },
  { id: 'material', name: 'Falta material', description: 'La posición de 19 mm no tiene material. Reubicá sus sellos o devolvelos a pendientes.' },
  { id: 'width', name: 'Un sello queda en el aire', description: 'Un sello de 12 mm está sobre el ancho útil de 11,5 mm. Cambialo de planchuela.' },
  { id: 'separation', name: 'Sellos demasiado juntos', description: 'Dos sellos comparten el mismo lugar. Separalos o usá Reacomodar libres.' },
];
const detailPaths = [
  'M3 20L6 7L9 20H7L6 15L5 20Z', 'M3 8H9V11H6V14H9V21H3V18H6V17H3Z',
  'M3 10L6 7L9 10V20H3Z', 'M2 15L6 8L10 15L6 22Z',
  'M3 8H5V17H9V20H3Z', 'M3 10H9V13H7V20H5V13H3Z',
  'M3 9H9V12H6V14H9V20H3V17H6V16H3Z', 'M3 8L6 12L9 8V20H7V14L6 16L5 14V20H3Z',
];
function drawing(index: number, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><g transform="scale(${w / 12} ${h / 30})"><path fill-rule="evenodd" d="M0 0H12V30H0Z M1 1V29H11V1Z"/><g data-simulation-detail="true"><path d="${detailPaths[index]}"/></g></g></svg>`;
}
export function simulationSources(): PreparationSource[] {
  return [
    ['Marca A', 12, 30, 'CLASICO', 19], ['Taller B', 14, 35, '3MM', 19],
    ['Panadería C', 22, 45, 'ALIMENTO', 25], ['Cuero D', 20, 40, 'CLASICO', 25],
    ['Marca E', 8, 25, 'CLASICO', 12], ['Taller F', 9, 30, '3MM', 12],
    ['Alimento G', 32, 50, 'ALIMENTO', 38], ['Marca H', 30, 45, 'CLASICO', 38],
  ].map(([name, width, height, recipe, column], index) => ({ id: `sim-${index}`, designName: String(name), widthMm: Number(width), heightMm: Number(height),
    stampType: String(recipe), tipoPlanchuela: Number(column), vectorPreviewUrl: `data:image/svg+xml,${encodeURIComponent(drawing(index, Number(width), Number(height)))}` }));
}
export function simulationDocument(id: string, scenario: SimulationCase, sources = simulationSources()): PreparationDocument {
  const doc = createPreparation(id, 'C', sources);
  // Confirmaciones ficticias y rutas inertes: este documento no se envía a un servidor.
  doc.supportVerified = true;
  Object.values(doc.recipes).forEach((recipe) => { recipe.verified = true; });
  doc.recipes.ALIMENTO.perimeterTemplate = { name: 'Corte Forma.ToolpathTemplate', path: `${id}/ALIMENTO/food_perimeter/simulado.ToolpathTemplate` };
  // Espacio extra en el ejemplo para comparar cambios de medida sin solapar al siguiente sello.
  doc.stamps[1].topY -= 16;
  if (scenario === 'material') doc.columns.find((c) => c.id === 'p19')!.available = false;
  if (scenario === 'width') Object.assign(doc.stamps[0], { columnId: 'p12', centerX: doc.columns.find((c) => c.id === 'p12')!.centerX, topY: -160 });
  if (scenario === 'separation') doc.stamps[1].topY = doc.stamps[0].topY;
  return doc;
}
export interface SimulationState {
  plan: PreparationDocument | null; baseline: ObservedStamp[]; current: ObservedStamp[];
  conflicts: SyncConflict[]; events: string[];
}
export const emptySimulation = (): SimulationState => ({ plan: null, baseline: [], current: [], conflicts: [], events: [] });
const same = (a: number, b: number) => Math.abs(a - b) <= 0.02;
const sourceHash = (s: PreparationDocument['stamps'][number]) => preparationFingerprint(s.sourceUrl + (s.vectorSvg ?? ''));
const append = (state: SimulationState, message: string) => [...state.events, message].slice(-12);
function observed(s: PreparationDocument['stamps'][number]): ObservedStamp {
  const source = s.vectorSvg ?? decodeURIComponent(s.sourceUrl.slice(s.sourceUrl.indexOf(',') + 1));
  const svg = s.vectorAlreadyMachined ? source : source.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/, `$1<g transform="translate(${s.sourceWidthMm} 0) scale(-1 1)">$2</g>$3`);
  return { instanceId: s.instanceId, selloId: s.selloId, centerX: s.centerX, topY: s.topY, widthMm: s.widthMm, heightMm: s.heightMm, recipe: s.recipe,
    sourceUrl: s.sourceUrl, sourceHash: sourceHash(s), geometryHash: preparationFingerprint(svg), svg };
}
export function simulatedDocument(doc: PreparationDocument, current: ObservedStamp[], previous?: PreparationDocument | null): PreparationDocument {
  return { ...doc, stamps: current.map((actual) => {
    const stamp = doc.stamps.find((s) => s.instanceId === actual.instanceId) ?? previous?.stamps.find((s) => s.instanceId === actual.instanceId);
    if (!stamp) throw new Error('La pieza simulada no tiene referencia de fabricación. Reiniciá el caso.');
    const column = doc.columns.find((c) => Math.abs(actual.centerX - c.centerX) <= 0.02);
    return { ...stamp, ...actual, columnId: column?.id ?? stamp.columnId, vectorSvg: actual.svg, vectorAlreadyMachined: true,
      sourceWidthMm: actual.widthMm, sourceHeightMm: actual.heightMm };
  }) };
}
/** Simula propiedades y controles compartidos. No ejecuta SDK, CAM, red ni confirmación de archivo. */
export function simulateSync(doc: PreparationDocument, revision: number, state: SimulationState, resolution?: 'app' | 'aspire') {
  const issues = validatePreparation(doc);
  let conflicts: SyncConflict[] = [];
  if (!issues.length && state.plan) {
    const comparable = doc.stamps.map((s) => {
      const oldPlan = state.plan!.stamps.find((o) => o.instanceId === s.instanceId), base = state.baseline.find((o) => o.instanceId === s.instanceId);
      if (!oldPlan || !base) return s;
      return { ...s, ...(same(s.centerX, oldPlan.centerX) && same(s.topY, oldPlan.topY) ? { centerX: base.centerX, topY: base.topY } : {}),
        ...(same(s.widthMm, oldPlan.widthMm) && same(s.heightMm, oldPlan.heightMm) ? { widthMm: base.widthMm, heightMm: base.heightMm } : {}),
        ...(s.recipe === oldPlan.recipe ? { recipe: base.recipe } : {}) };
    });
    conflicts = preparationConflicts(state.baseline, comparable, state.current);
    for (const s of doc.stamps.filter((s) => !s.excluded)) if (state.baseline.some((o) => o.instanceId === s.instanceId) && !state.current.some((o) => o.instanceId === s.instanceId))
      issues.push({ code: 'SIM_MISSING', message: `${s.name}: falta en el armado simulado; no se reinsertó automáticamente.`, instanceId: s.instanceId, severity: 'error' });
    for (const s of doc.stamps) {
      const oldPlan = state.plan.stamps.find((o) => o.instanceId === s.instanceId), base = state.baseline.find((o) => o.instanceId === s.instanceId), actual = state.current.find((o) => o.instanceId === s.instanceId);
      if (oldPlan && base && actual && sourceHash(s) !== sourceHash(oldPlan) && actual.geometryHash !== base.geometryHash)
        conflicts.push({ instanceId: s.instanceId, property: 'geometry', message: 'Cambió el dibujo en la app y también en Aspire.' });
    }
    if (conflicts.length && !resolution) issues.push(...conflicts.map((c) => ({ code: 'SIM_CONFLICT', message: c.message, instanceId: c.instanceId, severity: 'error' as const })));
    if (resolution === 'aspire' && conflicts.some((c) => c.property === 'removal'))
      issues.push({ code: 'SIM_REMOVAL', message: 'La pieza quitada sigue en Aspire simulado. Revisá su pertenencia antes de continuar.', severity: 'error' });
  }
  let current = structuredClone(state.current);
  const blocked = issues.some((i) => i.severity === 'error');
  if (!blocked) current = doc.stamps.filter((s) => !s.excluded).map((s) => {
    const actual = state.current.find((o) => o.instanceId === s.instanceId), oldPlan = state.plan?.stamps.find((o) => o.instanceId === s.instanceId);
    if (!actual || !oldPlan) return observed(s);
    const result = { ...actual };
    const useApp = (property: SyncConflict['property']) => resolution !== 'aspire' || !conflicts.some((c) => c.instanceId === s.instanceId && c.property === property);
    if ((!same(s.centerX, oldPlan.centerX) || !same(s.topY, oldPlan.topY)) && useApp('position')) Object.assign(result, { centerX: s.centerX, topY: s.topY });
    if ((!same(s.widthMm, oldPlan.widthMm) || !same(s.heightMm, oldPlan.heightMm)) && useApp('size')) Object.assign(result, { widthMm: s.widthMm, heightMm: s.heightMm });
    if (s.recipe !== oldPlan.recipe && useApp('recipe')) result.recipe = s.recipe;
    if (sourceHash(s) !== sourceHash(oldPlan) && useApp('geometry')) {
      const replacement = observed(s); Object.assign(result, { svg: replacement.svg, sourceHash: replacement.sourceHash, sourceUrl: replacement.sourceUrl, geometryHash: replacement.geometryHash });
    }
    return result;
  });
  if (!blocked) issues.push(...validatePreparation(simulatedDocument(doc, current)));
  const applied = !issues.some((i) => i.severity === 'error');
  const message = applied ? `r${revision}: armado simulado aplicado; ${current.length} sellos. Sin CAM ni archivo de Aspire.`
    : `r${revision}: simulación detenida; ${issues.length} ${issues.length === 1 ? 'observación' : 'observaciones'}. El armado anterior se conserva.`;
  const next: SimulationState = applied ? { plan: structuredClone(doc), baseline: structuredClone(current), current, conflicts: [], events: append(state, message) }
    : { ...state, conflicts, events: append(state, message) };
  const execution = buildExecutionPlan(doc, next.current);
  const observation: PreparationObservation = { revision, stamps: structuredClone(next.current), issues, recalculated: false,
    execution: { rulesVersion: execution.rulesVersion, stampCount: execution.stamps.length, columnCount: execution.columns.length, verified: false } };
  return { state: next, observation, message };
}
export function simulateAspireEdit(state: SimulationState, kind: 'geometry' | 'size'): SimulationState {
  if (!state.current.length) throw new Error('Primero guardá y simulá el envío inicial.');
  const current = structuredClone(state.current), stamp = current[0];
  if (kind === 'size') { stamp.widthMm *= 1.1; stamp.heightMm *= 1.1; }
  else {
    const marker = '<g data-simulation-detail="true"';
    const match = stamp.svg?.match(/<g data-simulation-detail="true"(?: transform="translate\(([\d.]+) 0\)")?>/);
    if (!match) throw new Error('El dibujo editado no tiene el detalle de ejemplo. Reiniciá el caso para probarlo.');
    stamp.svg = stamp.svg!.replace(match[0], `${marker} transform="translate(${Number(match[1] ?? 0) + 0.5} 0)">`);
    stamp.geometryHash = preparationFingerprint(stamp.svg);
  }
  return { ...state, current, conflicts: [], events: append(state, kind === 'size' ? 'Aspire simulado: sello 1 agrandado un 10 %.' : 'Aspire simulado: detalle interno del sello 1 desplazado, sin cambiar su medida.') };
}
