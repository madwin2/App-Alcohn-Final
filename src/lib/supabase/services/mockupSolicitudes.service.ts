import { supabase } from '../client';
import type { Database } from '../types';

const MOCKUP_WEBHOOK_FN =
  (import.meta as any)?.env?.VITE_ORDER_WEBHOOK_FUNCTION_NAME || 'webhook-bot';

/** Tipo que debe manejar el bot para enviar imágenes por WhatsApp (mockups listos). */
export const MOCKUP_WEBHOOK_TIPO = 'mockups_listos' as const;

export type MockupSolicitudRow = Database['public']['Tables']['mockup_solicitudes']['Row'];
export type MockupSolicitudInsert = Database['public']['Tables']['mockup_solicitudes']['Insert'];
export type MockupSolicitudUpdate = Database['public']['Tables']['mockup_solicitudes']['Update'];

export async function insertMockupSolicitud(
  row: MockupSolicitudInsert,
): Promise<{ data: MockupSolicitudRow | null; error: Error | null }> {
  const { data, error } = await supabase.from('mockup_solicitudes').insert(row).select().single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as MockupSolicitudRow, error: null };
}

export async function updateMockupSolicitud(
  id: string,
  patch: MockupSolicitudUpdate,
): Promise<{ data: MockupSolicitudRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('mockup_solicitudes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as MockupSolicitudRow, error: null };
}

export async function listMockupSolicitudes(limit = 60): Promise<{
  data: MockupSolicitudRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('mockup_solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as MockupSolicitudRow[], error: null };
}

export type NotifyMockupsWhatsAppInput = {
  whatsapp: string;
  /** `nombre` del contrato webhook (ej. nombre de muestra o slug). */
  nombre: string;
  solicitudId: string;
  mockupCueroUrl: string | null;
  mockupMaderaUrl: string | null;
};

/**
 * Avisa al bot vía Edge Function `webhook-bot` para que envíe los mockups al WhatsApp del cliente.
 * No lanza: devuelve ok/error para mostrar toast sin romper el flujo.
 */
export async function notifyMockupsReadyWhatsApp(
  input: NotifyMockupsWhatsAppInput,
): Promise<{ ok: boolean; error?: string }> {
  const tel = input.whatsapp.trim();
  if (!tel) return { ok: true };

  const cuero = input.mockupCueroUrl?.trim() || null;
  const madera = input.mockupMaderaUrl?.trim() || null;
  if (!cuero && !madera) {
    return { ok: false, error: 'No hay URLs de mockup para enviar.' };
  }

  const nombre = input.nombre.trim() || 'Cliente';

  try {
    const { data, error } = await supabase.functions.invoke(MOCKUP_WEBHOOK_FN, {
      body: {
        numero_telefono: tel,
        tipo_actualizacion: MOCKUP_WEBHOOK_TIPO,
        nombre,
        datos: {
          solicitud_mockup_id: input.solicitudId,
          mockup_cuero_url: cuero,
          mockup_madera_url: madera,
          nombre_muestra: nombre,
        },
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const payload = data as { success?: boolean; error?: string } | null;
    if (payload && payload.success === false) {
      return { ok: false, error: payload.error || 'El bot rechazó el envío.' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al invocar webhook' };
  }
}
