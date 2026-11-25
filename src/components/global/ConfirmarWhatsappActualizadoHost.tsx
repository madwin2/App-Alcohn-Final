import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { useToast } from '@/components/ui/use-toast';
import { useWhatsappActualizadoConfirmStore } from '@/lib/state/whatsappActualizadoConfirm.store';
import { notifyOrderUpdated } from '@/lib/supabase/services/orders.service';

/**
 * Host único del cartel «¿Enviar WhatsApp al cliente?» después de editar un pedido.
 * Muestra de a un pedido por vez; con «Sí» se manda, con «No» (o cerrando) no.
 */
export function ConfirmarWhatsappActualizadoHost() {
  const order = useWhatsappActualizadoConfirmStore((s) => s.pendientes[0] ?? null);
  const sacar = useWhatsappActualizadoConfirmStore((s) => s.sacar);
  const { toast } = useToast();

  const nombre = order
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ').trim() || 'el cliente'
    : '';

  return (
    <ConfirmDialog
      open={order != null}
      onOpenChange={(open) => {
        if (!open && order) sacar(order.id);
      }}
      title="¿Enviar WhatsApp al cliente?"
      description={
        order ? `Se editó el pedido de ${nombre}. ¿Le mandamos el WhatsApp avisando que se actualizó su pedido?` : ''
      }
      confirmLabel="Sí, enviar"
      cancelLabel="No"
      onConfirm={() => {
        if (!order) return;
        toast({ title: 'Enviando WhatsApp', description: `Le avisamos a ${nombre} que se actualizó su pedido.` });
        void notifyOrderUpdated(order);
      }}
    />
  );
}
