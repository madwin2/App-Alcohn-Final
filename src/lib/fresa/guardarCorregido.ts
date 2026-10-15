import { supabase } from '@/lib/supabase/client';
import { generateFilePath, uploadFile } from '@/lib/supabase/services/storage.service';
import { setSelloVectorState } from '@/lib/vectorizacion/vectorizacion.service';
import { forgetSvgText } from './useFresaReport';

/**
 * Sube un SVG corregido y lo deja como vector del sello (`archivo_vector_preview`).
 * Guarda también la medida de fabricación del resultado (si se pasa).
 * Devuelve la URL nueva.
 */
export async function guardarVectorCorregido(
  selloId: string,
  file: File,
  previousUrl?: string | null,
  /** Medida de fabricación del resultado (el gadget escala por el lado largo). */
  fabricationMm?: { widthMm: number; heightMm: number },
): Promise<string> {
  const { data, error } = await supabase.from('sellos').select('orden_id').eq('id', selloId).single();
  if (error) throw error;
  const ordenId = (data as { orden_id?: string | null } | null)?.orden_id;
  if (!ordenId) throw new Error('No se encontró el pedido del sello.');
  const url = await uploadFile('vector', file, generateFilePath(ordenId, 'vector', file.name, selloId));
  await setSelloVectorState(selloId, 'VECTORIZADO', {
    vectorUrl: url,
    widthMm: fabricationMm?.widthMm,
    heightMm: fabricationMm?.heightMm,
  });
  if (previousUrl) forgetSvgText(previousUrl);
  return url;
}
