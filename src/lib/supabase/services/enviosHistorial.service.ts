import { supabase } from '../client';

export type EnvioEventoTipo = 'csv_generado' | 'etiqueta_descargada' | 'etiqueta_reimpresa';

export type EnvioEventoRow = {
  id: string;
  orden_id: string;
  tipo_evento: EnvioEventoTipo;
  created_at: string;
  created_by: string | null;
  meta: Record<string, unknown> | null;
};

export async function insertEnvioEventos(
  ordenIds: string[],
  tipoEvento: EnvioEventoTipo,
  meta?: Record<string, unknown> | null,
): Promise<void> {
  if (!ordenIds.length) return;

  const { data: authData } = await supabase.auth.getUser();
  const createdBy = authData.user?.id ?? null;

  const rows = ordenIds.map((ordenId) => ({
    orden_id: ordenId,
    tipo_evento: tipoEvento,
    created_by: createdBy,
    meta: meta ?? null,
  }));

  const { error } = await supabase.from('envio_eventos').insert(rows);
  if (error) {
    console.warn('No se pudieron registrar eventos de envío:', error.message);
  }
}

export async function insertEnvioEventoForOrden(
  ordenId: string,
  tipoEvento: EnvioEventoTipo,
  meta?: Record<string, unknown> | null,
): Promise<void> {
  await insertEnvioEventos([ordenId], tipoEvento, meta);
}

/** Etiqueta IDs (Andreani) ya descargadas, leídas desde envio_eventos.meta.etiqueta_id */
export async function getDownloadedAndreaniEtiquetaIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('envio_eventos')
    .select('meta')
    .eq('tipo_evento', 'etiqueta_descargada')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.warn('No se pudo leer historial de descargas Andreani:', error.message);
    return new Set();
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const meta = row.meta as { etiqueta_id?: unknown } | null;
    if (meta && typeof meta.etiqueta_id === 'string') {
      ids.add(meta.etiqueta_id);
    }
  }
  return ids;
}
