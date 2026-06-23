import { buildSellosFromWebCheckout } from '@/lib/comercial/webCart';
import { supabase } from '../client';
import type { Database } from '../types';
import { getOrderById, notifyOrderRegistered } from './orders.service';
import type { Order } from '@/lib/types/index';

type OrdenRow = Database['public']['Tables']['ordenes']['Row'];
type MockupRow = Database['public']['Tables']['mockup_solicitudes']['Row'];

const PAGO_PENDIENTE = ['pendiente', 'pago_fallido', 'esperando_comprobante', 'abandonado'] as const;

export type ConfirmWebOrderPaymentParams = {
  ordenId: string;
  validatedBy?: string | null;
  skipWebhook?: boolean;
  /** Monto de seña recibido (transferencia). Si no se indica, se usa el del checkout o $20.000. */
  seniaMonto?: number | null;
};

export async function confirmWebOrderPayment(
  params: ConfirmWebOrderPaymentParams,
): Promise<Order> {
  const { ordenId, validatedBy, skipWebhook, seniaMonto } = params;

  const { data: orden, error: ordenError } = await supabase
    .from('ordenes')
    .select('*')
    .eq('id', ordenId)
    .maybeSingle();

  if (ordenError) throw new Error(ordenError.message);
  if (!orden) throw new Error('Pedido no encontrado.');
  if (orden.origen !== 'Web') {
    throw new Error('Solo se pueden confirmar pagos de pedidos web.');
  }
  if (orden.estado_pago_web === 'pagado') {
    throw new Error('Este pedido ya tiene el pago confirmado.');
  }
  if (
    orden.estado_pago_web &&
    !PAGO_PENDIENTE.includes(orden.estado_pago_web as (typeof PAGO_PENDIENTE)[number])
  ) {
    throw new Error(`Estado de pago no confirmable: ${orden.estado_pago_web}`);
  }

  const { data: existingSellos, error: sellosCheckError } = await supabase
    .from('sellos')
    .select('id')
    .eq('orden_id', ordenId);

  if (sellosCheckError) throw new Error(sellosCheckError.message);
  if (existingSellos?.length) {
    if (orden.estado_pago_web === 'pagado') {
      throw new Error('Este pedido ya tiene el pago confirmado.');
    }
    // Recuperación: sellos creados pero la orden no llegó a pagado (p. ej. fallo en update).
    const { error: deleteError } = await supabase.from('sellos').delete().eq('orden_id', ordenId);
    if (deleteError) throw new Error(deleteError.message);
  }

  let mockup: MockupRow | null = null;
  const mockupId = orden.mockup_solicitud_id ?? null;
  if (mockupId) {
    const { data, error } = await supabase
      .from('mockup_solicitudes')
      .select('*')
      .eq('id', mockupId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    mockup = (data as MockupRow | null) ?? null;
  }

  const carritoJson =
    orden.carrito_json ??
    mockup?.carrito_json ??
    null;

  const sellosPayload = buildSellosFromWebCheckout({
    ordenId,
    carritoJson,
    notasWeb: (orden.notas_web as Record<string, unknown> | null) ?? null,
    metodoPago: orden.metodo_pago ?? null,
    mockup,
    mockupSolicitudId: mockupId,
    seniaMonto,
  });

  const { error: insertError } = await supabase.from('sellos').insert(sellosPayload);
  if (insertError) throw new Error(insertError.message);

  const now = new Date().toISOString();
  const hasComprobante = Boolean(orden.comprobante_subido_at || orden.comprobante_url);

  const ordenUpdate: Partial<OrdenRow> = {
    estado_pago_web: 'pagado',
    estado_orden: 'Señado',
    pago_confirmado_at: now,
    estado_envio: orden.estado_envio ?? 'Sin envio',
  };

  if (hasComprobante) {
    ordenUpdate.comprobante_validado_at = now;
    ordenUpdate.comprobante_validado_por = validatedBy ?? null;
  }

  const { error: updateError } = await supabase.from('ordenes').update(ordenUpdate).eq('id', ordenId);
  if (updateError) throw new Error(updateError.message);

  const order = await getOrderById(ordenId);
  if (!order) {
    throw new Error('El pedido se confirmó pero no se pudo cargar para mostrar.');
  }

  if (!skipWebhook) {
    await notifyOrderRegistered(order);
  }

  return order;
}
