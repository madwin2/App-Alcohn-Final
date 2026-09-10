import { supabase } from '../client';

const WEBHOOK_FN =
  (import.meta as { env?: { VITE_ORDER_WEBHOOK_FUNCTION_NAME?: string } })?.env
    ?.VITE_ORDER_WEBHOOK_FUNCTION_NAME || 'webhook-bot';

export type BotWebhookTipo =
  | 'pedido_registrado'
  | 'pedido_actualizado'
  | 'sello_rehacer'
  | string;

export type InvokeBotWebhookInput = {
  numeroTelefono: string | null | undefined;
  nombre: string;
  tipo: BotWebhookTipo;
  datos?: Record<string, unknown>;
};

export async function invokeBotWebhook(input: InvokeBotWebhookInput): Promise<void> {
  const telefono = (input.numeroTelefono || '').trim();
  if (!telefono) return;

  const { error } = await supabase.functions.invoke(WEBHOOK_FN, {
    body: {
      numero_telefono: telefono,
      tipo_actualizacion: input.tipo,
      nombre: input.nombre || 'Cliente',
      datos: input.datos || {},
    },
  });

  if (error) {
    console.error(`Error sending ${input.tipo} webhook:`, error);
  }
}
