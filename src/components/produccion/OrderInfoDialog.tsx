import { Copy, Loader2, MessageCircle, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { whatsAppUrl } from '@/lib/comercial/utils';
import {
  fetchClienteProfile,
  type ClienteProfile,
  type ClienteProfileOrder,
} from '@/lib/supabase/services/clienteProfile.service';
import { formatCurrency, formatDate, formatPhone } from '@/lib/utils/format';

interface OrderInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
  orderId: string | null;
  fallbackName?: string;
}

function copyText(value: string, toast: ReturnType<typeof useToast>['toast'], label: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast({ title: `${label} copiado`, description: value }),
    () =>
      toast({
        title: 'No se pudo copiar',
        description: 'Permisos del portapapeles o HTTPS requerido.',
        variant: 'destructive',
      }),
  );
}

function formatShippingLine(order: ClienteProfileOrder): string {
  const shipping = order.shipping;
  if (!shipping) return 'Sin datos de envío cargados';
  if (order.tipoEnvio === 'Sucursal') {
    const sucursal = shipping.sucursal ? `Sucursal ${shipping.sucursal}` : shipping.domicilio;
    return [sucursal, shipping.localidad, shipping.provincia, shipping.codigoPostal]
      .filter(Boolean)
      .join(' · ');
  }
  if (order.tipoEnvio === 'Retiro' || order.tipoEnvio === 'Retiro en Persona') {
    return 'Retiro en persona';
  }
  return [shipping.domicilio, shipping.localidad, shipping.provincia, shipping.codigoPostal]
    .filter(Boolean)
    .join(' · ');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function OrderInfoDialog({
  open,
  onOpenChange,
  clienteId,
  orderId,
  fallbackName,
}: OrderInfoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ClienteProfile | null>(null);

  useEffect(() => {
    if (!open || !clienteId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
    void fetchClienteProfile(clienteId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar el pedido');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clienteId]);

  const order = useMemo(
    () => profile?.orders.find((o) => o.id === orderId) ?? null,
    [profile, orderId],
  );

  const nombre =
    profile
      ? [profile.cliente.firstName, profile.cliente.lastName].filter(Boolean).join(' ').trim()
      : fallbackName || 'Cliente';
  const phone = profile?.cliente.phone || '';
  const wa = whatsAppUrl(phone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {nombre || 'Pedido'}
            {order?.origen ? <Badge variant="outline">{order.origen}</Badge> : null}
            {order?.estadoEnvio ? <Badge variant="secondary">{order.estadoEnvio}</Badge> : null}
          </DialogTitle>
          <DialogDescription>
            Datos del cliente y del pedido asociado a este diseño.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Cargando pedido...
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">{error}</p>
        ) : profile ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {phone ? (
                <>
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={() => copyText(phone.replace(/\D/g, '') || phone, toast, 'Teléfono')}
                  >
                    {formatPhone(phone)}
                  </button>
                  {wa ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="mr-1.5 size-3.5" />
                        WhatsApp
                      </a>
                    </Button>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Sin teléfono</span>
              )}
              {profile.cliente.email ? (
                <span className="text-muted-foreground">{profile.cliente.email}</span>
              ) : null}
              {profile.cliente.dni ? (
                <span className="text-muted-foreground">DNI {profile.cliente.dni}</span>
              ) : null}
            </div>

            {order ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat
                    label="Fecha"
                    value={order.fecha ? formatDate(order.fecha) : '—'}
                  />
                  <Stat label="Total" value={formatCurrency(order.valorTotal)} />
                  <Stat label="Pendiente" value={formatCurrency(order.restante)} />
                  <Stat
                    label="Envío"
                    value={[order.empresaEnvio, order.tipoEnvio].filter(Boolean).join(' · ') || '—'}
                  />
                </div>

                <section className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Package className="size-4" />
                    Ítems del pedido ({order.items.length})
                  </div>
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div key={item.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium">{item.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.tipo ? <Badge variant="outline">{item.tipo}</Badge> : null}
                            {item.estadoFabricacion ? (
                              <Badge variant="secondary">{item.estadoFabricacion}</Badge>
                            ) : null}
                            {item.estadoVenta ? (
                              <Badge variant="outline">{item.estadoVenta}</Badge>
                            ) : null}
                          </div>
                        </div>
                        {item.nota ? (
                          <p className="mt-1 text-xs text-muted-foreground">{item.nota}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs">
                  {order.shipping ? (
                    <>
                      <p className="font-medium text-foreground">{order.shipping.recipientName}</p>
                      <p className="mt-0.5 text-muted-foreground">{formatShippingLine(order)}</p>
                      {order.shipping.phone ? (
                        <p className="text-muted-foreground">
                          Tel. envío: {formatPhone(order.shipping.phone)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">{formatShippingLine(order)}</p>
                  )}
                  {order.seguimiento ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        Seguimiento {order.seguimiento}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5"
                        onClick={() => copyText(order.seguimiento!, toast, 'Seguimiento')}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No se encontró el pedido asociado a este diseño en el historial del cliente.
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
