import rules from './preparationRules.json' with { type: 'json' };
import type { PreparationDocument, PreparationIssue, ObservedStamp, Recipe } from './programPreparation.ts';
export const PREPARATION_RULES = rules;
export type ExecutionPose = Pick<ObservedStamp, 'instanceId' | 'selloId' | 'centerX' | 'topY' | 'widthMm' | 'heightMm' | 'recipe'>;
export interface StampExecution {
  instanceId: string; columnId: string; recipe: Recipe;
  vectorLayer: string; fineLayer: string; offsetLayer: string;
  cut: { x1: number; x2: number; y: number };
  drill: { x: number; y: number; radiusMm: number };
}
export interface ColumnExecution {
  columnId: string; nominalMm: number; centerX: number; topY: number; bottomY: number;
  planeWidthMm: number; exteriorWidthMm: number; materialMm: number;
}
export interface ExecutionPlan {
  rulesVersion: number; stamps: StampExecution[]; columns: ColumnExecution[]; issues: PreparationIssue[];
}

/** Operaciones derivadas del estado FINAL. Sin parámetros CAM inventados ni estado de venta. */
export function buildExecutionPlan(doc: PreparationDocument, actual: ExecutionPose[] = doc.stamps.filter((s) => !s.excluded)): ExecutionPlan {
  const plan: ExecutionPlan = { rulesVersion: rules.version, stamps: [], columns: [], issues: [] };
  const fail = (code: string, message: string, instanceId?: string, severity: 'error' | 'warning' = 'error') =>
    plan.issues.push({ code, message, instanceId, severity });
  const tolerance = rules.coordinateToleranceMm;
  const seen = new Set<string>();
  const rows: { pose: ExecutionPose; columnId: string }[] = [];
  for (const pose of actual) {
    const stamp = doc.stamps.find((s) => s.instanceId === pose.instanceId && s.selloId === pose.selloId && !s.excluded);
    if (!stamp || seen.has(pose.instanceId)) { fail('IDENTITY', 'Hay una pieza extra o duplicada en el armado.', pose.instanceId); continue; }
    seen.add(pose.instanceId);
    if (![pose.centerX, pose.topY, pose.widthMm, pose.heightMm].every(Number.isFinite) || pose.widthMm <= 0 || pose.heightMm <= 0 || !['CLASICO', '3MM', 'ALIMENTO'].includes(pose.recipe)) {
      fail('GEOMETRY', `${stamp.name}: medidas o mecanizado inválidos.`, pose.instanceId); continue;
    }
    const col = doc.columns.find((c) => c.id === stamp.columnId);
    if (!col) { fail('COLUMN', `${stamp.name}: planchuela inexistente.`, stamp.instanceId); continue; }
    if (!col.available) fail('MATERIAL', `${stamp.name}: no hay material declarado.`, stamp.instanceId);
    if (Math.abs(pose.centerX - col.centerX) + pose.widthMm / 2 > col.usableMm / 2 + tolerance) fail('WIDTH', `${stamp.name}: queda fuera del ancho útil.`, stamp.instanceId);
    if (pose.topY > col.topY + tolerance || pose.topY - pose.heightMm < col.bottomY - tolerance) fail('LENGTH', `${stamp.name}: excede el largo útil.`, stamp.instanceId);
    const bottom = pose.topY - pose.heightMm;
    const cutY = bottom - rules.cutBelowDesignMm;
    // POL-097: el diseño ya entró (LENGTH). Falta de cola de corte/acabado = aviso, no bloqueo.
    if (cutY - rules.rectangleBelowCutMm < col.bottomY - tolerance) {
      fail('MACHINING_LENGTH', `${stamp.name}: falta espacio al final para el corte y el acabado.`, stamp.instanceId, 'warning');
    }
    const envelope = pose.recipe === 'ALIMENTO' ? rules.foodToolEnvelopeMm : 0;
    if (Math.abs(pose.centerX - col.centerX) + pose.widthMm / 2 + envelope > col.toolEnvelopeMm / 2 + tolerance) fail('TOOL_ENVELOPE', `${stamp.name}: el mecanizado excede la envolvente útil.`, stamp.instanceId);
    rows.push({ pose, columnId: col.id });
    const recipe = rules.recipes[pose.recipe];
    plan.stamps.push({ instanceId: stamp.instanceId, columnId: col.id, recipe: pose.recipe,
      vectorLayer: recipe.vectorLayer, fineLayer: stamp.fine?.scope === 'internal' ? recipe.fineInteriorLayer : recipe.fineLayer, offsetLayer: recipe.offsetLayer,
      cut: { x1: col.centerX - (col.nominalMm + rules.cutExtraWidthMm) / 2, x2: col.centerX + (col.nominalMm + rules.cutExtraWidthMm) / 2, y: cutY },
      drill: { x: pose.centerX, y: pose.topY - pose.heightMm / 2, radiusMm: rules.drillRadiusMm } });
  }
  for (const s of doc.stamps) if (!s.excluded && !seen.has(s.instanceId)) fail('MISSING', `${s.name}: falta en el armado.`, s.instanceId);
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    // Un corte atraviesa la planchuela completa: no alcanza con separar las cajas en X.
    const sameStrip = a.columnId === b.columnId;
    const xOverlap = Math.abs(a.pose.centerX - b.pose.centerX) < (a.pose.widthMm + b.pose.widthMm) / 2;
    const gap = Math.max(a.pose.topY - a.pose.heightMm, b.pose.topY - b.pose.heightMm) - Math.min(a.pose.topY, b.pose.topY);
    if ((sameStrip || xOverlap) && gap < doc.gapMm - tolerance) fail('SEPARATION', 'Dos sellos no respetan la separación de corte.', a.pose.instanceId);
  }
  for (const col of doc.columns) {
    const cuts = plan.stamps.filter((s) => s.columnId === col.id);
    if (!cuts.length) continue;
    const cutY = Math.min(...cuts.map((s) => s.cut.y));
    plan.columns.push({ columnId: col.id, nominalMm: col.nominalMm, centerX: col.centerX, topY: rules.rectangleTopY,
      bottomY: cutY - rules.rectangleBelowCutMm, planeWidthMm: col.nominalMm + rules.planeExtraWidthMm,
      exteriorWidthMm: col.nominalMm + rules.exteriorExtraWidthMm, materialMm: Math.round((col.topY - cutY) * 10) / 10 });
  }
  return plan;
}
