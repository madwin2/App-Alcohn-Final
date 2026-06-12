import {
  COMERCIAL_CONTACTO_WEBHOOK_TIPO,
  CONTACTO_COMERCIAL_ENVIADO_KEY,
  CONTACTO_COMERCIAL_TIPO_KEY,
} from '@/lib/comercial/contacto';
import { supabase } from '../client';

const WEBHOOK_FN =
  (import.meta as { env?: { VITE_ORDER_WEBHOOK_FUNCTION_NAME?: string } })?.env
    ?.VITE_ORDER_WEBHOOK_FUNCTION_NAME || 'webhook-bot';

export type SendComercialContactoInput = {
  mockupId: string;
  whatsapp: string;
  nombre: string;
};

async function markComercialContactoEnviado(mockupId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error: fetchErr } = await supabase
    .from('mockup_solicitudes')
    .select('metadata_web')
    .eq('id', mockupId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };

  const prev = (data?.metadata_web as Record<string, unknown> | null) ?? {};
  const { error: updateErr } = await supabase
    .from('mockup_solicitudes')
    .update({
      metadata_web: {
        ...prev,
        [CONTACTO_COMERCIAL_ENVIADO_KEY]: new Date().toISOString(),
        [CONTACTO_COMERCIAL_TIPO_KEY]: COMERCIAL_CONTACTO_WEBHOOK_TIPO,
      },
    })
    .eq('id', mockupId);

  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true };
}

/**
 * Envía el mensaje comercial de seguimiento (generador web) vía webhook-bot.
 * Usado para envío manual desde /comercial; el automático lo corre procesar_contactos_comerciales_pendientes().
 */
export async function sendComercialContactoWhatsApp(
  input: SendComercialContactoInput,
): Promise<{ ok: boolean; error?: string }> {
  const tel = input.whatsapp.trim();
  if (!tel) return { ok: false, error: 'El cliente no tiene WhatsApp.' };

  const nombre = input.nombre.trim() || 'Cliente';

  try {
    const { data, error } = await supabase.functions.invoke(WEBHOOK_FN, {
      body: {
        numero_telefono: tel,
        tipo_actualizacion: COMERCIAL_CONTACTO_WEBHOOK_TIPO,
        nombre,
        datos: {
          solicitud_mockup_id: input.mockupId,
        },
      },
    });

    if (error) return { ok: false, error: error.message };

    const payload = data as { success?: boolean; error?: string } | null;
    if (payload && payload.success === false) {
      return { ok: false, error: payload.error || 'El bot rechazó el envío.' };
    }

    return markComercialContactoEnviado(input.mockupId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al invocar webhook' };
  }
}
