import { inspectNativeTemplate, type NativeTemplateInspection, type NativeTemplatePurpose } from '../../../supabase/functions/_shared/nativeTemplate';
import type { Recipe } from './preparation';

/** Dónde va cada plantilla de Aspire al subirlas todas juntas. */
export type TemplateSlot =
  | { kind: 'automatic'; recipes: Recipe[] }
  | { kind: 'fine_full' }
  | { kind: 'fine_internal' }
  | { kind: 'food_perimeter' };

export interface SortedTemplate { name: string; slot: TemplateSlot; stage?: number }
export interface TemplateSort { sorted: SortedTemplate[]; rejected: { name: string; reason: string }[] }

const ALL: Recipe[] = ['CLASICO', '3MM', 'ALIMENTO'];

/**
 * Receta de una trayectoria automática por las capas que toma: las de VECTOR
 * son de Clásico; las de VECTOR 3MM, de 3 mm y de Alimento (el servidor les
 * adapta las capas, Q-PROG-022); las demás (taladro, planeado, corte…) van en
 * todas.
 */
export function recipesForLayers(layers: string[]): Recipe[] {
  const has = (...names: string[]) => layers.some((l) => names.includes(l));
  if (has('VECTOR', 'Offset exterior vector')) return ['CLASICO'];
  if (has('VECTOR 3MM', 'Offset exterior vector 3mm')) return ['3MM', 'ALIMENTO'];
  if (has('VECTOR ALIMENTO', 'Offset exterior vector alimento')) return ['ALIMENTO'];
  return ALL;
}

/**
 * Ordena plantillas sueltas (una trayectoria por archivo) en su lugar: las
 * automáticas a sus recetas; las manuales al repaso habitual (perfil por
 * fuera 0,5–0,6), al repaso interior (por dentro 0,5–0,6) o al Corte Forma de
 * Alimento (por fuera 3,5–5,5). Usa los mismos controles que el servidor, así
 * que lo que entra acá después pasa el paquete.
 */
export function sortTemplates(files: { name: string; inspect: (purpose: NativeTemplatePurpose) => NativeTemplateInspection }[]): TemplateSort {
  const sorted: SortedTemplate[] = [], rejected: TemplateSort['rejected'] = [];
  const taken = new Map<string, string>();
  for (const f of files) {
    const auto = f.inspect('automatic');
    if (!auto.issues.length) {
      sorted.push({ name: f.name, slot: { kind: 'automatic', recipes: recipesForLayers(auto.selectors[0]?.layers ?? []) }, stage: auto.stage });
      continue;
    }
    if (auto.selectors.length > 1) { rejected.push({ name: f.name, reason: 'tiene varias trayectorias; guardá una por archivo' }); continue; }
    const special = (['fine_full', 'fine_internal', 'food_perimeter'] as const).find((p) => !f.inspect(p).issues.length);
    if (!special) { rejected.push({ name: f.name, reason: auto.issues[0] ?? 'no se reconoce' }); continue; }
    const prior = taken.get(special);
    if (prior) { rejected.push({ name: f.name, reason: `ya hay otra para el mismo lugar (${prior})` }); continue; }
    taken.set(special, f.name);
    sorted.push({ name: f.name, slot: { kind: special }, stage: f.inspect(special).stage });
  }
  return { sorted, rejected };
}

/** `sortTemplates` sobre archivos reales (lee los bytes una vez). */
export async function sortTemplateFiles(files: File[]): Promise<TemplateSort & { byName: Map<string, File> }> {
  const read = await Promise.all(files.map(async (file) => ({ file, bytes: new Uint8Array(await file.arrayBuffer()) })));
  const result = sortTemplates(read.map(({ file, bytes }) => ({ name: file.name, inspect: (purpose) => inspectNativeTemplate(bytes, purpose) })));
  return { ...result, byName: new Map(files.map((f) => [f.name, f])) };
}

/** Qué falta para que una receta pueda ir a Aspire (para mostrarlo al subir). */
export function missingForRecipe(recipe: Recipe, sorted: SortedTemplate[]): string[] {
  const out: string[] = [];
  const auto = sorted.filter((s) => s.slot.kind === 'automatic' && s.slot.recipes.includes(recipe));
  if (!auto.length) out.push('trayectorias automáticas');
  if (!sorted.some((s) => s.slot.kind === 'fine_full')) out.push('repaso habitual (4 Perfilado 0.1MM)');
  if (recipe === 'ALIMENTO' && !sorted.some((s) => s.slot.kind === 'food_perimeter')) out.push('Corte Forma');
  return out;
}
