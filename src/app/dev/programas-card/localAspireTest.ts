import { isPreparationDocument, type PreparationObservation, type PreparationRecord } from '@/lib/programas/preparation';
import { validateObservation } from '../../../../supabase/functions/_shared/preparationProtocol';
import { simulationSources } from './preparationSimulation';

export const LOCAL_ASPIRE_FILE_LIMIT = 8 * 1024 * 1024;
function read(text: string): unknown {
  if (text.length > LOCAL_ASPIRE_FILE_LIMIT) throw new Error('El archivo de prueba supera los 8 MB.');
  try { return JSON.parse(text); } catch { throw new Error('No se pudo leer el JSON de la prueba.'); }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Restaura únicamente una muestra C exportada; nunca adopta aprobaciones del archivo. */
export function readLocalAspirePlan(text: string): PreparationRecord {
  const payload = read(text);
  if (!object(payload) || payload.kind !== 'alcohn-local-aspire-test' || !object(payload.record)) throw new Error('Elegí un armado exportado desde esta prueba.');
  const { document: doc, revision } = payload.record;
  if (!isPreparationDocument(doc) || doc.machine !== 'C' || !/^simulation-C-\d{1,9}$/.test(doc.programId)
    || !Number.isSafeInteger(revision) || Number(revision) < 1 || !doc.stamps.length || doc.stamps.length > 8)
    throw new Error('El armado no corresponde a una prueba válida de la máquina C.');
  const sources = simulationSources();
  const seen = new Set<string>();
  for (const stamp of doc.stamps) {
    const source = sources.find((s) => s.id === stamp.selloId);
    if (!source || seen.has(stamp.selloId) || stamp.instanceId !== `${doc.programId}:${stamp.selloId}` || stamp.sourceUrl !== source.vectorPreviewUrl)
      throw new Error('El armado contiene un sello o una fuente ajena a esta prueba.');
    seen.add(stamp.selloId);
  }
  return { document: doc, revision: Number(revision), observation: null, syncedRevision: null, updatedAt: new Date().toISOString() };
}

/** Lee un informe nativo local sin aprobar archivos ni modificar el plan guardado. */
export function readLocalAspireReport(text: string, record: PreparationRecord): PreparationObservation {
  const payload = read(text);
  if (!object(payload) || payload.programa_id !== record.document.programId || payload.modo !== 'PREPARACION_V2' || !object(payload.preparation))
    throw new Error('El informe no corresponde al programa de prueba abierto. Cargá primero su armado.');
  if (payload.preparation.revision !== record.revision) throw new Error(`El informe es de otra revisión. Se necesita r${record.revision}.`);
  const result = validateObservation(payload.preparation, record.document, record.revision);
  for (const actual of result.stamps) {
    const stamp = record.document.stamps.find((s) => s.instanceId === actual.instanceId);
    if (actual.sourceUrl !== stamp?.sourceUrl || !actual.svg || !['CLASICO', '3MM', 'ALIMENTO'].includes(actual.recipe))
      throw new Error('El informe no tiene un dibujo válido de la fuente vigente.');
  }
  return result;
}
