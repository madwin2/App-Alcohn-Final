import { ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ClienteTimelineEvent } from '@/lib/comercial/types';
import { formatShortDate, whatsAppUrl } from '@/lib/comercial/utils';
import { fetchClienteTimeline } from '@/lib/supabase/services/comercialWeb.service';

const KIND_LABELS: Record<ClienteTimelineEvent['kind'], string> = {
  contacto: 'Contacto',
  mockup: 'Mockup',
  checkout_inicio: 'Checkout',
  checkout_completo: 'Checkout',
  orden: 'Pedido',
  pago_ok: 'Pago OK',
  pago_fallido: 'Pago fallido',
};

const KIND_COLORS: Record<ClienteTimelineEvent['kind'], string> = {
  contacto: 'bg-blue-500',
  mockup: 'bg-purple-500',
  checkout_inicio: 'bg-amber-500',
  checkout_completo: 'bg-amber-600',
  orden: 'bg-slate-500',
  pago_ok: 'bg-green-500',
  pago_fallido: 'bg-red-500',
};

interface ClienteDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
  clienteNombre?: string;
  clienteTelefono?: string | null;
}

export function ClienteDetailDialog({
  open,
  onOpenChange,
  clienteId,
  clienteNombre,
  clienteTelefono,
}: ClienteDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ClienteTimelineEvent[]>([]);
  const [resolvedNombre, setResolvedNombre] = useState<string | null>(null);
  const [resolvedTelefono, setResolvedTelefono] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clienteId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResolvedNombre(null);
    setResolvedTelefono(null);
    void fetchClienteTimeline(clienteId)
      .then((data) => {
        if (!cancelled) {
          setEvents(data.events);
          setResolvedNombre(data.nombre);
          setResolvedTelefono(data.telefono);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar timeline');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clienteId]);

  const displayNombre =
    resolvedNombre && resolvedNombre !== 'Sin nombre' && resolvedNombre !== 'Cliente'
      ? resolvedNombre
      : clienteNombre && clienteNombre !== 'Cliente'
        ? clienteNombre
        : resolvedNombre ?? clienteNombre ?? 'Detalle del cliente';
  const displayTelefono = resolvedTelefono ?? clienteTelefono ?? null;
  const wa = whatsAppUrl(displayTelefono);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{displayNombre}</DialogTitle>
          <DialogDescription>
            Actividad web: muestras online, checkout y pagos.
          </DialogDescription>
        </DialogHeader>

        {displayTelefono ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{displayTelefono}</span>
            {wa ? (
              <Button variant="outline" size="sm" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Cargando historial...
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">{error}</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Sin eventos registrados para este cliente.</p>
        ) : (
          <ol className="relative border-l border-border pl-4">
            {events.map((ev) => (
              <li key={ev.id} className="mb-6 ml-2 last:mb-0">
                <span
                  className={`absolute -left-[5px] mt-1.5 size-2.5 rounded-full ${KIND_COLORS[ev.kind]}`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{KIND_LABELS[ev.kind]}</Badge>
                  <time className="text-xs text-muted-foreground">{formatShortDate(ev.at)}</time>
                </div>
                <p className="mt-1 text-sm font-medium">{ev.label}</p>
                {ev.detail ? <p className="text-xs text-muted-foreground">{ev.detail}</p> : null}
                {ev.url ? (
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <a href={ev.url} target="_blank" rel="noopener noreferrer">
                      Ver archivo <ExternalLink className="ml-1 size-3" />
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
