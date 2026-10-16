/** Contrato compartido por editor, validación del servidor y manifest del gadget. */
import { buildExecutionPlan, PREPARATION_RULES } from './executionPlan.ts';
import { isNativeTemplateFilename } from './nativeTemplate.ts';
export type PreparationMachine = 'C' | 'G' | 'XL';
export type Recipe = 'CLASICO' | '3MM' | 'ALIMENTO';
export interface SupportColumn {
  id: string; nominalMm: number; usableMm: number; centerX: number; topY: number; bottomY: number;
  toolEnvelopeMm: number; available: boolean;
}
export interface StampPlacement {
  instanceId: string; selloId: string; name: string; columnId: string;
  centerX: number; topY: number; widthMm: number; heightMm: number; rotationDeg: number;
  recipe: Recipe; pinned: boolean; excluded: boolean; exclusionReason?: string;
  sourceUrl: string; sourceWidthMm: number; sourceHeightMm: number;
  vectorSvg?: string;
  vectorAlreadyMachined?: boolean;
  fine?: { mode: 'auto' | 'whole' | 'none' | 'aspire'; scope?: 'full' | 'internal'; needsFine: boolean; inputHash: string; geometryHash?: string; analysisVersion?: number;
    widthMm: number; heightMm: number; recipe: Recipe; outcome: string };
}
export interface PreparationDocument {
  version: 2; programId: string; machine: PreparationMachine; supportVerified: boolean;
  gapMm: number; columns: SupportColumn[]; stamps: StampPlacement[];
  recipes: Record<Recipe, { templates: string[]; templatePaths?: string[]; verified: boolean;
    perimeterTemplate?: { name: string; path: string };
    fineTemplates?: Partial<Record<'full' | 'internal', { name: string; path: string }>> }>;
}
export interface PreparationIssue { code: string; message: string; instanceId?: string; severity: 'error' | 'warning' }
export interface ObservedStamp {
  instanceId: string; selloId: string; centerX: number; topY: number; widthMm: number; heightMm: number;
  recipe: Recipe; geometryHash: string; sourceHash: string; sourceUrl?: string; svg?: string;
}
export interface PreparationObservation {
  revision: number; stamps: ObservedStamp[]; issues: PreparationIssue[]; recalculated: boolean;
  execution?: { rulesVersion: number; verified: boolean; stampCount: number; columnCount: number };
}
export interface PreparationRecord {
  revision: number; document: PreparationDocument; syncedRevision: number | null;
  observation: PreparationObservation | null; updatedAt: string;
}
export interface PreparationSource {
  id: string; designName: string; widthMm: number; heightMm: number; stampType: string;
  tipoPlanchuela?: number | null; vectorPreviewUrl?: string;
}

export function defaultColumns(machine: PreparationMachine): SupportColumn[] {
  const cols = machine === 'C' ? [[25, 24, 50.176], [12, 11.5, 87.776], [19, 18, 187.776], [38, 36.5, 235.351]]
    : machine === 'G' ? [[38, 36.5, 50.65], [12, 11.5, 94.4]] : [[63, 63, 31.5]];
  return cols.map(([nominalMm, usableMm, centerX]) => ({
    id: `p${nominalMm}`, nominalMm, usableMm, centerX, topY: machine === 'C' ? -8.958 : machine === 'G' ? -9.788 : -1,
    bottomY: machine === 'C' ? -400 : -250, toolEnvelopeMm: nominalMm + 14, available: true,
  }));
}

export function recipeFromType(value: string): Recipe | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  return upper === 'CLASICO' || upper === '3MM' || upper === 'ALIMENTO' ? upper : null;
}

export function createPreparation(programId: string, machine: PreparationMachine, sources: PreparationSource[]): PreparationDocument {
  const columns = defaultColumns(machine);
  const nextTop = new Map(columns.map((c) => [c.id, c.topY]));
  const stamps = sources.map((s): StampPlacement => {
    const widthMm = Math.min(s.widthMm, s.heightMm);
    const heightMm = Math.max(s.widthMm, s.heightMm);
    const col = columns.find((c) => c.nominalMm === s.tipoPlanchuela && widthMm <= c.usableMm) ?? columns.find((c) => widthMm <= c.usableMm) ?? columns[0];
    const topY = nextTop.get(col.id) ?? col.topY;
    nextTop.set(col.id, topY - heightMm - 8);
    return {
      instanceId: `${programId}:${s.id}`, selloId: s.id, name: s.designName, columnId: col.id,
      centerX: col.centerX, topY, widthMm, heightMm, rotationDeg: 0,
      recipe: recipeFromType(s.stampType) ?? 'CLASICO', pinned: false, excluded: recipeFromType(s.stampType) === null,
      exclusionReason: recipeFromType(s.stampType) ? undefined : 'Tipo sin receta compatible; elegí el mecanizado antes de incluirlo.',
      sourceUrl: s.vectorPreviewUrl ?? '', sourceWidthMm: s.widthMm, sourceHeightMm: s.heightMm,
    };
  });
  return arrangePreparation({ version: 2, programId, machine, supportVerified: false, gapMm: 8, columns, stamps,
    recipes: {
      CLASICO: { templates: ['clasico.ToolpathTemplate'], verified: false },
      '3MM': { templates: ['3mm.ToolpathTemplate'], verified: false },
      ALIMENTO: { templates: ['alimento.ToolpathTemplate'], verified: false },
    },
  });
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Misma huella de bytes que Lua; detecta cambios, no autentica archivos. */
export function preparationFingerprint(text: string): string {
  const bytes = new TextEncoder().encode(text); let hash = 7;
  for (const b of bytes) hash = (hash * 31 + b) % 2147483647;
  return `${bytes.length}:${hash}`;
}

/** Valida datos no confiables de DB/edge/gadget, sin convertir strings ni aceptar NaN. */
export function isPreparationDocument(value: unknown): value is PreparationDocument {
  if (!value || typeof value !== 'object') return false;
  const v = value as PreparationDocument;
  return v.version === 2 && typeof v.programId === 'string' && ['C', 'G', 'XL'].includes(v.machine)
    && typeof v.supportVerified === 'boolean' && finite(v.gapMm) && v.gapMm >= 0 && v.gapMm <= 100
    && Array.isArray(v.columns) && v.columns.length > 0 && v.columns.length <= 20
    && v.columns.every((c) => c && typeof c.id === 'string' && finite(c.nominalMm) && finite(c.usableMm) && c.usableMm > 0
      && c.usableMm <= c.nominalMm && finite(c.centerX) && finite(c.topY) && finite(c.bottomY) && c.topY > c.bottomY
      && finite(c.toolEnvelopeMm) && c.toolEnvelopeMm >= c.usableMm && typeof c.available === 'boolean')
    && Array.isArray(v.stamps) && v.stamps.length <= 500
    && v.stamps.every((s) => s && typeof s.instanceId === 'string' && typeof s.selloId === 'string' && typeof s.name === 'string'
      && typeof s.columnId === 'string' && finite(s.centerX) && finite(s.topY) && finite(s.widthMm) && finite(s.heightMm)
      && s.widthMm > 0 && s.heightMm > 0 && finite(s.sourceWidthMm) && s.sourceWidthMm > 0 && finite(s.sourceHeightMm) && s.sourceHeightMm > 0
      && s.rotationDeg === 0 && ['CLASICO', '3MM', 'ALIMENTO'].includes(s.recipe)
      && typeof s.pinned === 'boolean' && typeof s.excluded === 'boolean' && typeof s.sourceUrl === 'string'
      && (s.vectorAlreadyMachined === undefined || typeof s.vectorAlreadyMachined === 'boolean')
      && (s.fine === undefined || s.fine && ['auto', 'whole', 'none', 'aspire'].includes(s.fine.mode)
        && (s.fine.scope === undefined || ['full', 'internal'].includes(s.fine.scope))
        && (s.fine.scope !== 'internal' || s.fine.mode === 'aspire')
        && typeof s.fine.needsFine === 'boolean' && typeof s.fine.inputHash === 'string'
        && (s.fine.analysisVersion === undefined || Number.isInteger(s.fine.analysisVersion) && s.fine.analysisVersion > 0)
        && finite(s.fine.widthMm) && finite(s.fine.heightMm) && ['CLASICO', '3MM', 'ALIMENTO'].includes(s.fine.recipe) && typeof s.fine.outcome === 'string'
        && (s.fine.geometryHash === undefined || typeof s.fine.geometryHash === 'string'))
      && (s.vectorSvg === undefined || typeof s.vectorSvg === 'string' && s.vectorSvg.length <= 500_000 && !/<script|<foreignObject|<!DOCTYPE|<!ENTITY/i.test(s.vectorSvg)))
    && !!v.recipes && (['CLASICO', '3MM', 'ALIMENTO'] as const).every((r) => {
      const recipe = v.recipes[r];
      return recipe && typeof recipe.verified === 'boolean' && Array.isArray(recipe.templates) && recipe.templates.length > 0
        && recipe.templates.length <= 20 && recipe.templates.every(isNativeTemplateFilename)
        && (recipe.templatePaths === undefined || Array.isArray(recipe.templatePaths) && recipe.templatePaths.length <= 20
          && recipe.templatePaths.every((p) => typeof p === 'string' && p.length <= 500 && !p.includes('..')))
        && (recipe.perimeterTemplate === undefined || r === 'ALIMENTO' && recipe.perimeterTemplate
          && isNativeTemplateFilename(recipe.perimeterTemplate.name)
          && typeof recipe.perimeterTemplate.path === 'string' && recipe.perimeterTemplate.path.length <= 500 && !recipe.perimeterTemplate.path.includes('..'))
        && (recipe.fineTemplates === undefined || recipe.fineTemplates && Object.entries(recipe.fineTemplates).every(([kind, file]) =>
          ['full', 'internal'].includes(kind) && file && isNativeTemplateFilename(file.name)
          && typeof file.path === 'string' && file.path.length <= 500 && !file.path.includes('..')));
    });
}

export function validatePreparation(doc: PreparationDocument, sources?: PreparationSource[]): PreparationIssue[] {
  const issues: PreparationIssue[] = [];
  const add = (code: string, message: string, instanceId?: string) => issues.push({ code, message, instanceId, severity: 'error' });
  if (!isPreparationDocument(doc)) return [{ code: 'INVALID', message: 'La preparación tiene datos inválidos.', severity: 'error' }];
  if (!doc.supportVerified) add('SUPPORT', 'Confirmá las posiciones y áreas útiles contra el soporte físico.');
  if (doc.gapMm < PREPARATION_RULES.minimumGapMm) add('GAP', 'La separación de corte debe respetar los 8 mm confirmados.');
  const columnIds = new Set(doc.columns.map((c) => c.id));
  if (columnIds.size !== doc.columns.length) add('DUPLICATE_COLUMN', 'Hay posiciones de planchuela duplicadas.');
  const ids = new Set<string>();
  const sellos = new Set<string>();
  for (const s of doc.stamps) {
    if (ids.has(s.instanceId) || sellos.has(s.selloId)) add('DUPLICATE', `${s.name}: instancia duplicada.`, s.instanceId);
    ids.add(s.instanceId); sellos.add(s.selloId);
    if (s.excluded) {
      if (!s.exclusionReason?.trim()) add('EXCLUDED_REASON', `${s.name}: indicá por qué queda fuera.`, s.instanceId);
      add('EXCLUDED_PENDING', `${s.name}: devolvelo a pendientes antes de sincronizar para que no se marque como fabricado.`, s.instanceId);
      continue;
    }
    const c = doc.columns.find((col) => col.id === s.columnId);
    if (!c) { add('COLUMN', `${s.name}: planchuela inexistente.`, s.instanceId); continue; }
    if (!c.available) add('MATERIAL', `${s.name}: no hay material declarado en esa posición.`, s.instanceId);
    if (Math.abs(s.centerX - c.centerX) + s.widthMm / 2 > c.usableMm / 2 + 0.01)
      add('WIDTH', `${s.name}: queda fuera del ancho útil.`, s.instanceId);
    if (s.topY > c.topY + 0.01 || s.topY - s.heightMm < c.bottomY - 0.01)
      add('LENGTH', `${s.name}: excede el largo útil.`, s.instanceId);
    // Límite generado a +0,5 mm, perfil exterior con radio 3 y su barrido.
    const envelope = s.recipe === 'ALIMENTO' ? PREPARATION_RULES.foodToolEnvelopeMm : 0;
    if (Math.abs(s.centerX - c.centerX) + s.widthMm / 2 + envelope > c.toolEnvelopeMm / 2 + 0.01)
      add('TOOL_ENVELOPE', `${s.name}: el corte perimetral excede la envolvente verificada.`, s.instanceId);
    if (!doc.recipes[s.recipe].verified) add('RECIPE', `${s.name}: falta verificar las plantillas de ${s.recipe}.`, s.instanceId);
    if (s.recipe === 'ALIMENTO' && !doc.recipes.ALIMENTO.perimeterTemplate)
      add('PERIMETER_TEMPLATE', `${s.name}: cargá Corte Forma en la plantilla de corte perimetral de Alimento.`, s.instanceId);
    if (!s.sourceUrl) add('VECTOR', `${s.name}: falta el vector fuente.`, s.instanceId);
    const source = sources?.find((item) => item.id === s.selloId);
    if (sources && !source) add('REMOVED', `${s.name}: ya no pertenece a este programa.`, s.instanceId);
    if (source && source.vectorPreviewUrl !== s.sourceUrl) add('SOURCE_CHANGED', `${s.name}: cambió el vector fuente; revisá la geometría antes de sincronizar.`, s.instanceId);
    const ratio = s.widthMm / s.heightMm;
    const sourceRatio = Math.min(s.sourceWidthMm, s.sourceHeightMm) / Math.max(s.sourceWidthMm, s.sourceHeightMm);
    const expected = s.rotationDeg % 180 ? 1 / sourceRatio : sourceRatio;
    if (Math.abs(ratio / expected - 1) > 0.002) add('ASPECT', `${s.name}: las medidas deforman la proporción del vector.`, s.instanceId);
  }
  for (const source of sources ?? []) if (!sellos.has(source.id)) add('MISSING', `${source.designName}: falta en la preparación.`);
  const active = doc.stamps.filter((s) => !s.excluded);
  if (!active.length) add('EMPTY', 'No hay sellos incluidos en la preparación.');
  for (const issue of buildExecutionPlan(doc).issues) if (!issues.some((i) => i.code === issue.code && i.instanceId === issue.instanceId)) issues.push(issue);
  return issues;
}

/** Reacomoda solo posiciones libres; nunca cambia medida ni receta. */
export function arrangePreparation(doc: PreparationDocument): PreparationDocument {
  const stamps = doc.stamps.map((s) => ({ ...s }));
  const placed = stamps.filter((s) => !s.excluded && s.pinned);
  const tail = PREPARATION_RULES.cutBelowDesignMm + PREPARATION_RULES.rectangleBelowCutMm;
  for (const s of stamps.filter((s) => !s.excluded && !s.pinned)) {
    const candidates = doc.columns.filter((c) => c.available && s.widthMm <= c.usableMm)
      .sort((a, b) => Number(b.id === s.columnId) - Number(a.id === s.columnId) || a.nominalMm - b.nominalMm);
    for (const col of candidates) {
      let top = col.topY;
      for (const blocker of placed.filter((p) => p.columnId === col.id).sort((a, b) => b.topY - a.topY)) {
        if (top - s.heightMm - doc.gapMm >= blocker.topY) break;
        if (top > blocker.topY - blocker.heightMm - doc.gapMm) top = blocker.topY - blocker.heightMm - doc.gapMm;
      }
      if (top - s.heightMm - tail < col.bottomY) continue;
      s.columnId = col.id; s.centerX = col.centerX; s.topY = top; break;
    }
    placed.push(s);
  }
  return { ...doc, stamps };
}

/** Adopción explícita: infiere la planchuela solo cuando contiene la caja completa. */
export function adoptObservedStamp(doc: PreparationDocument, actual: ObservedStamp): PreparationDocument {
  const columns = doc.columns.filter((c) => Math.abs(actual.centerX - c.centerX) + actual.widthMm / 2 <= c.usableMm / 2 + PREPARATION_RULES.coordinateToleranceMm
    && actual.topY <= c.topY + PREPARATION_RULES.coordinateToleranceMm && actual.topY - actual.heightMm >= c.bottomY - PREPARATION_RULES.coordinateToleranceMm);
  if (columns.length !== 1) throw new Error('La posición de Aspire no corresponde a una única planchuela. Revisá el montaje antes de adoptarla.');
  return { ...doc, stamps: doc.stamps.map((s) => s.instanceId !== actual.instanceId || s.selloId !== actual.selloId ? s : {
    ...s, columnId: columns[0].id, centerX: actual.centerX, topY: actual.topY, widthMm: actual.widthMm, heightMm: actual.heightMm,
    sourceWidthMm: actual.widthMm, sourceHeightMm: actual.heightMm, recipe: actual.recipe,
    fine: s.fine ? { mode: s.fine.mode, ...(s.fine.scope ? { scope: s.fine.scope } : {}), needsFine: true,
      inputHash: '', widthMm: actual.widthMm, heightMm: actual.heightMm, recipe: actual.recipe, outcome: 'sin_analisis' } : undefined,
  }) };
}

/** No presentar como vector vigente una observación anterior a un cambio de fuente. */
export function observedSvgForStamp(stamp: StampPlacement, observation?: PreparationObservation | null): string | undefined {
  const actual = observation?.stamps.find((s) => s.instanceId === stamp.instanceId && s.selloId === stamp.selloId);
  return actual?.sourceUrl === stamp.sourceUrl ? actual?.svg : undefined;
}

export type MergeProperty = 'position' | 'size' | 'recipe' | 'geometry' | 'removal';
export interface SyncConflict { instanceId: string; property: MergeProperty; message: string }
const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;

/** Tres vías: último estado observado, nuevo plan y Aspire actual. */
export function preparationConflicts(base: ObservedStamp[], plan: StampPlacement[], observed: ObservedStamp[]): SyncConflict[] {
  const conflicts: SyncConflict[] = [];
  for (const actual of observed) {
    const old = base.find((s) => s.instanceId === actual.instanceId);
    const wanted = plan.find((s) => s.instanceId === actual.instanceId && !s.excluded);
    if (!old) continue;
    if (!wanted) {
      if (actual.geometryHash !== old.geometryHash || !close(actual.widthMm, old.widthMm) || !close(actual.heightMm, old.heightMm))
        conflicts.push({ instanceId: actual.instanceId, property: 'removal', message: 'Se quitó de la app y se editó en Aspire.' });
      continue;
    }
    const changed = (a: number[], b: number[]) => a.some((n, i) => !close(n, b[i]));
    for (const [property, a, b, c] of [
      ['position', [old.centerX, old.topY], [wanted.centerX, wanted.topY], [actual.centerX, actual.topY]],
      ['size', [old.widthMm, old.heightMm], [wanted.widthMm, wanted.heightMm], [actual.widthMm, actual.heightMm]],
    ] as const) if (changed([...a], [...b]) && changed([...a], [...c]) && changed([...b], [...c]))
      conflicts.push({ instanceId: actual.instanceId, property, message: `${property === 'size' ? 'La medida' : 'La posición'} cambió en ambos lados.` });
    if (wanted.recipe !== old.recipe && actual.recipe !== old.recipe && wanted.recipe !== actual.recipe)
      conflicts.push({ instanceId: actual.instanceId, property: 'recipe', message: 'El mecanizado cambió en ambos lados.' });
    if (actual.sourceHash !== old.sourceHash && actual.geometryHash !== old.geometryHash)
      conflicts.push({ instanceId: actual.instanceId, property: 'geometry', message: 'Cambió el vector fuente y hay correcciones locales.' });
  }
  return conflicts;
}
