import { isPreparationDocument, validatePreparation, type PreparationDocument, type PreparationObservation, type PreparationSource } from './programPreparation.ts';
import { buildExecutionPlan, PREPARATION_RULES } from './executionPlan.ts';

function quoteLua(value: string): string {
  return '"' + Array.from(value).map((c) => c === '\\' ? '\\\\' : c === '"' ? '\\"' : c.charCodeAt(0) < 32 ? '\\' + c.charCodeAt(0).toString().padStart(3, '0') : c).join('') + '"';
}
export function toLua(value: unknown): string {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') return quoteLua(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Número no finito en el manifest.'); return String(value); }
  if (Array.isArray(value)) return '{' + value.map(toLua).join(',') + '}';
  if (typeof value === 'object') return '{' + Object.entries(value).map(([k, v]) => '[' + quoteLua(k) + ']=' + toLua(v)).join(',') + '}';
  throw new Error('Valor no serializable en el manifest.');
}

export function checkedPreparation(value: unknown, sources: PreparationSource[]): PreparationDocument {
  if (!isPreparationDocument(value)) throw new Error('La preparación guardada tiene datos inválidos.');
  const issues = validatePreparation(value, sources);
  if (issues.some((i) => i.severity === 'error')) throw new Error(issues.map((i) => i.message).slice(0, 8).join(' '));
  return value;
}

/** Bloqueo previo al paquete: las plantillas deben cubrir el armado y su respaldo fino. */
export function missingPreparationLayers(doc: PreparationDocument, templates: { selectors: { layers: string[] }[]; selectionLayers?: string[]; selectorLayers?: string[] }[]): string[] {
  const required = new Set(['Corte', 'Taladrado', 'Offset 1 vector', 'Planeado', 'Rectangulo exterior']);
  for (const s of doc.stamps.filter((s) => !s.excluded)) {
    const recipe = PREPARATION_RULES.recipes[s.recipe];
    required.add(recipe.vectorLayer); required.add(recipe.offsetLayer);
    // Auto necesita el perfilado de respaldo aunque un análisis previo no pida repaso.
    if (s.fine?.mode !== 'none') required.add(s.fine?.mode === 'aspire' && s.fine.scope === 'internal' ? recipe.fineInteriorLayer : recipe.fineLayer);
    if (s.recipe === 'ALIMENTO') required.add('Corte Alimento');
  }
  const covered = new Set(templates.flatMap((t) => t.selectionLayers ?? t.selectorLayers ?? t.selectors.flatMap((s) => s.layers)));
  return [...required].filter((name) => !covered.has(name));
}

export function validateObservation(value: unknown, doc: PreparationDocument, revision: number): PreparationObservation {
  if (!value || typeof value !== 'object') throw new Error('Informe de preparación vacío.');
  const observation = value as PreparationObservation;
  if (observation.revision !== revision || typeof observation.recalculated !== 'boolean' || !Array.isArray(observation.stamps)
    || !Array.isArray(observation.issues) || observation.stamps.length > 500 || observation.issues.length > 1000
    || observation.issues.some((i) => !i || typeof i.message !== 'string' || typeof i.code !== 'string' || !['error', 'warning'].includes(i.severity)
      || i.instanceId !== undefined && typeof i.instanceId !== 'string'))
    throw new Error('Informe de preparación inválido.');
  const issues = [...observation.issues];
  const seen = new Set<string>();
  const observedPlan = structuredClone(doc);
  for (const actual of observation.stamps) {
    if (!actual || typeof actual.instanceId !== 'string' || typeof actual.selloId !== 'string'
      || ![actual.centerX, actual.topY, actual.widthMm, actual.heightMm].every((n) => typeof n === 'number' && Number.isFinite(n))
      || actual.widthMm <= 0 || actual.heightMm <= 0 || typeof actual.geometryHash !== 'string' || typeof actual.sourceHash !== 'string'
      || actual.sourceUrl !== undefined && typeof actual.sourceUrl !== 'string'
      || actual.svg !== undefined && (typeof actual.svg !== 'string' || actual.svg.length > 500_000 || /<script|<foreignObject|<!DOCTYPE|<!ENTITY/i.test(actual.svg)))
      throw new Error('Geometría observada inválida.');
    const stamp = observedPlan.stamps.find((s) => s.instanceId === actual.instanceId && s.selloId === actual.selloId && !s.excluded);
    if (!stamp || seen.has(actual.instanceId)) throw new Error('El informe incluye una instancia extra o duplicada.');
    seen.add(actual.instanceId);
    if (Math.abs(stamp.widthMm - actual.widthMm) > 0.02 || Math.abs(stamp.heightMm - actual.heightMm) > 0.02)
      issues.push({ code: 'MEASURE_DIFFERENCE', instanceId: stamp.instanceId, severity: 'warning',
        message: `${stamp.name}: Aspire mide ${actual.heightMm.toFixed(2)} × ${actual.widthMm.toFixed(2)} mm; el plan guardado indica ${stamp.heightMm.toFixed(2)} × ${stamp.widthMm.toFixed(2)} mm. Revisá o adoptá las medidas de fabricación.` });
    Object.assign(stamp, { centerX: actual.centerX, topY: actual.topY, widthMm: actual.widthMm, heightMm: actual.heightMm, recipe: actual.recipe,
      sourceWidthMm: actual.widthMm, sourceHeightMm: actual.heightMm });
  }
  for (const stamp of doc.stamps) if (!stamp.excluded && !seen.has(stamp.instanceId))
    issues.push({ code: 'MISSING', instanceId: stamp.instanceId, severity: 'error', message: `${stamp.name}: falta en el resultado de Aspire.` });
  for (const issue of validatePreparation(observedPlan)) if (!issues.some((i) => i.code === issue.code && i.instanceId === issue.instanceId)) issues.push(issue);
  if (!observation.recalculated) issues.push({ code: 'TOOLPATHS', severity: 'error', message: 'Las trayectorias no se recalcularon correctamente.' });
  const execution = buildExecutionPlan(doc, observation.stamps);
  const proof = observation.execution;
  if (!proof || proof.verified !== true || proof.rulesVersion !== PREPARATION_RULES.version
    || proof.stampCount !== execution.stamps.length || proof.columnCount !== execution.columns.length)
    issues.push({ code: 'EXECUTION', severity: 'error', message: 'Falta comprobar los cortes, taladros y auxiliares del armado final. Actualizá el gadget y sincronizá.' });
  return { ...observation, issues };
}
