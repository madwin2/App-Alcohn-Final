import { useEffect, useState } from 'react';
import { Loader2, MapPin, Clock, FileDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  fetchEnvioHistorialDetail,
  type EnvioHistorialDetail,
} from '@/lib/supabase/services/enviosHistorialTabla.service';
import { formatDateTime } from '@/lib/utils/format';

interface EnviosHistorialDetailDialogProps {
  ordenId: string | null;
  customerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatShippingAddress(detail: EnvioHistorialDetail): string {
  if (detail.shippingType === 'Retiro') return 'Retiro en persona';
  if (!detail.address) return 'Sin dirección cargada';

  const { domicilio, localidad, provincia, codigoPostal, sucursalCodigo } = detail.address;

  if (detail.shippingType === 'Sucursal') {
    const parts = [domicilio?.trim(), localidad?.trim(), provincia?.trim()].filter(Boolean);
    if (sucursalCodigo?.trim()) parts.push(`Cód. ${sucursalCodigo.trim()}`);
    return parts.join(' · ') || 'Sucursal';
  }

  const line1 = domicilio?.trim();
  const line2 = [localidad?.trim(), provincia?.trim(), codigoPostal?.trim() ? `CP ${codigoPostal.trim()}` : null]
    .filter(Boolean)
    .join(', ');
  return [line1, line2].filter(Boolean).join('\n') || 'Sin dirección';
}

function pdfDownloadLabel(tipo: EnvioHistorialDetail['pdfDownloads'][number]['tipoEvento']): string {
  return tipo === 'etiqueta_reimpresa' ? 'Etiqueta reimpresa' : 'Etiqueta descargada';
}

export function EnviosHistorialDetailDialog({
  ordenId,
  customerName,
  open,
  onOpenChange,
}: EnviosHistorialDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnvioHistorialDetail | null>(null);

  useEffect(() => {
    if (!open || !ordenId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchEnvioHistorialDetail(ordenId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, ordenId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalle del envío</DialogTitle>
          <DialogDescription>
            {customerName || (ordenId ? `Pedido ${ordenId.slice(0, 8)}…` : 'Pedido')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando detalle...
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : detail ? (
          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 pr-1">
            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Dirección de envío
              </h3>
              <p className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                {formatShippingAddress(detail)}
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Historial de estados
              </h3>
              {detail.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay cambios de estado registrados.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.timeline.map((entry, index) => (
                    <li key={`${entry.changedAt}-${index}`} className="px-3 py-2.5 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium">
                          {entry.estadoAnterior
                            ? `${entry.estadoAnterior} → ${entry.estadoNuevo ?? '—'}`
                            : entry.estadoNuevo || 'Pedido creado'}
                        </p>
                        <time className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(entry.changedAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.pdfDownloads.length > 0 ? (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <FileDown className="h-4 w-4 text-muted-foreground" />
                  Descargas de PDF
                </h3>
                <ul className="divide-y rounded-lg border">
                  {detail.pdfDownloads.map((entry, index) => (
                    <li key={`${entry.createdAt}-${index}`} className="px-3 py-2.5 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-medium">{pdfDownloadLabel(entry.tipoEvento)}</p>
                        <time className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(entry.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
