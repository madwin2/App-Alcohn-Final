import { supabase } from '../client';
import { defaultColumns, isPreparationDocument, type PreparationDocument, type PreparationRecord } from '@/lib/programas/preparation';
import { inspectNativeTemplate, isNativeTemplateFilename, type NativeTemplatePurpose } from '../../../../supabase/functions/_shared/nativeTemplate';

export async function uploadPreparationTemplates(programId: string, recipe: string, files: File[], purpose: NativeTemplatePurpose = 'automatic'): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    if (!isNativeTemplateFilename(file.name) || file.size > 5 * 1024 * 1024) throw new Error('Nombre o tamaño de plantilla inválido (máximo 5 MB).');
    const inspection = inspectNativeTemplate(new Uint8Array(await file.arrayBuffer()), purpose);
    if (inspection.issues.length) throw new Error(`${file.name}: ${inspection.issues.join(' ')}`);
  }
  for (const file of files) {
    // Storage no acepta algunos caracteres en la ruta («[» en «4 Perfilado 0.1MM [interior»):
    // la ruta lleva un nombre seguro; el original se conserva en el documento.
    const safe = file.name.replace(/[^A-Za-z0-9._ ()-]/g, '_');
    const path = `${programId}/${recipe}/${purpose === 'automatic' ? '' : purpose + '/'}${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from('programas-plantillas').upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

export async function getProgramPreparation(programId: string): Promise<PreparationRecord | null> {
  const { data, error } = await supabase.from('programa_preparacion').select('*').eq('programa_id', programId).maybeSingle();
  if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205'
    ? 'La preparación visual necesita aplicar la migración pendiente. Podés explorar el editor; todavía no se guardará en el servidor.' : error.message);
  if (!data) return null;
  if (!isPreparationDocument(data.documento)) throw new Error('La preparación guardada tiene un formato incompatible.');
  return { revision: data.revision, document: data.documento, syncedRevision: data.revision_sincronizada,
    observation: data.observacion, updatedAt: data.updated_at };
}

export async function saveProgramPreparation(document: PreparationDocument, expectedRevision: number): Promise<PreparationRecord> {
  if (!isPreparationDocument(document)) throw new Error('Hay medidas o datos inválidos. Revisalos antes de guardar la preparación.');
  const { data, error } = await supabase.rpc('guardar_programa_preparacion', {
    p_programa_id: document.programId, p_revision_esperada: expectedRevision, p_documento: document,
  });
  if (error) throw new Error(error.message.includes('REVISION_CONFLICT')
    ? 'El programa cambió en otra ventana. Recargá la preparación antes de guardar.' : error.message);
  if (!data || !isPreparationDocument(data.documento)) throw new Error('El servidor no confirmó la preparación.');
  return { revision: data.revision, document: data.documento, syncedRevision: data.revision_sincronizada,
    observation: data.observacion, updatedAt: data.updated_at };
}

/** Vuelve el programa al flujo legado. Conserva el historial de revisiones. */
export async function discardProgramPreparation(programId: string, expectedRevision: number): Promise<void> {
  const { error } = await supabase.rpc('descartar_programa_preparacion', { p_programa_id: programId, p_revision_esperada: expectedRevision });
  if (!error) return;
  if (error.code === '42883' || error.code === 'PGRST202') throw new Error('Falta aplicar migration_programas_preparacion_descartar.sql.');
  throw new Error(error.message.includes('REVISION_CONFLICT') ? 'La preparación cambió en otra ventana. Recargala antes de descartarla.'
    : error.message.includes('PROGRAM_NOT_EDITABLE') ? 'El programa está bloqueado o en fabricación.' : error.message);
}

export type MachineSetup = Pick<PreparationDocument, 'columns' | 'gapMm' | 'supportVerified' | 'recipes'> & { fromProgramName: string };

/**
 * El soporte y las plantillas son de la máquina, no del programa (POL-079):
 * se toman de la última preparación de la misma máquina. Las plantillas se
 * copian a la carpeta de este programa porque el servidor exige ese prefijo.
 * La disponibilidad de material es de cada corrida y no se hereda.
 */
/** Última preparación guardada de una máquina (sin contar este programa). */
async function latestPreparation(machine: PreparationDocument['machine'], exceptProgramId?: string) {
  let query = supabase.from('programa_preparacion')
    .select('programa_id, documento, updated_at, programa!inner(nombre, maquina)')
    .eq('programa.maquina', machine);
  if (exceptProgramId) query = query.neq('programa_id', exceptProgramId);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(5);
  if (error) return null;
  return (data ?? []).find((r) => isPreparationDocument(r.documento) && r.documento.machine === machine) ?? null;
}

/**
 * Grande y XL usan las mismas fresas y trayectorias que la Chica (usuario,
 * 2026-10-20): si todavía no tienen plantillas propias, se reciclan las de la
 * Chica. El soporte nunca se recicla: es de cada máquina.
 */
const SHARES_CHICA_TEMPLATES: PreparationDocument['machine'][] = ['G', 'XL'];

export async function inheritMachineSetup(programId: string, machine: PreparationDocument['machine']): Promise<MachineSetup | null> {
  const own = await latestPreparation(machine, programId);
  const row = own ?? (SHARES_CHICA_TEMPLATES.includes(machine) ? await latestPreparation('C', programId) : null);
  if (!row) return null;
  const borrowed = !own;
  const source = row.documento as PreparationDocument;
  const from = row.programa_id as string;
  const copy = async (path: string) => {
    if (!path.startsWith(`${from}/`)) throw new Error('Ruta de plantilla ajena.');
    const rest = path.slice(from.length + 1);
    const slash = rest.lastIndexOf('/');
    const name = rest.slice(slash + 1).replace(/^[0-9a-f-]{36}-/i, '');
    const target = `${programId}/${rest.slice(0, slash + 1)}${crypto.randomUUID()}-${name}`;
    const { error: copyError } = await supabase.storage.from('programas-plantillas').copy(path, target);
    if (copyError) throw new Error(copyError.message);
    return target;
  };
  try {
    const recipes = { ...source.recipes };
    for (const recipe of ['CLASICO', '3MM', 'ALIMENTO'] as const) {
      const r = source.recipes[recipe];
      const fineTemplates: NonNullable<typeof r.fineTemplates> = {};
      for (const [kind, file] of Object.entries(r.fineTemplates ?? {}) as ['full' | 'internal', { name: string; path: string }][])
        fineTemplates[kind] = { name: file.name, path: await copy(file.path) };
      recipes[recipe] = {
        // Prestadas de la Chica: se confirman en esta máquina antes de usarlas.
        templates: r.templates, verified: borrowed ? false : r.verified,
        ...(r.templatePaths ? { templatePaths: await Promise.all(r.templatePaths.map(copy)) } : {}),
        ...(r.fineTemplates ? { fineTemplates } : {}),
        ...(r.perimeterTemplate ? { perimeterTemplate: { name: r.perimeterTemplate.name, path: await copy(r.perimeterTemplate.path) } } : {}),
      };
    }
    const nombre = (row.programa as unknown as { nombre?: string } | null)?.nombre ?? 'otro programa';
    if (borrowed) return { columns: defaultColumns(machine), gapMm: source.gapMm, supportVerified: false, recipes, fromProgramName: `${nombre} (Chica)` };
    return { columns: source.columns.map((c) => ({ ...c, available: true })), gapMm: source.gapMm,
      supportVerified: source.supportVerified, recipes, fromProgramName: nombre };
  } catch {
    return null;
  }
}

/**
 * Soporte y plantillas de la última preparación de la máquina, solo para
 * mostrar (no copia plantillas). Al guardar por primera vez se usa
 * `inheritMachineSetup`, que sí las copia a la carpeta del programa.
 */
export async function peekMachineSetup(machine: PreparationDocument['machine']): Promise<MachineSetup | null> {
  const own = await latestPreparation(machine);
  const row = own ?? (SHARES_CHICA_TEMPLATES.includes(machine) ? await latestPreparation('C') : null);
  if (!row) return null;
  const source = row.documento as PreparationDocument;
  const nombre = (row.programa as unknown as { nombre?: string } | null)?.nombre ?? 'otro programa';
  if (!own) {
    const recipes = { ...source.recipes };
    for (const r of ['CLASICO', '3MM', 'ALIMENTO'] as const) recipes[r] = { ...recipes[r], verified: false };
    return { columns: defaultColumns(machine), gapMm: source.gapMm, supportVerified: false, recipes, fromProgramName: `${nombre} (Chica)` };
  }
  return { columns: source.columns.map((c) => ({ ...c, available: true })), gapMm: source.gapMm,
    supportVerified: source.supportVerified, recipes: source.recipes, fromProgramName: nombre };
}
