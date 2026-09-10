import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StorageUrlImage } from '@/components/shared/StorageUrlImage';
import { WhatsappLogo } from '@/components/shared/WhatsappLogo';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { resolveStorageDisplayUrl } from '@/lib/utils/storageUrlUtils';
import type { EnvioHistorialRow } from '@/lib/supabase/services/enviosHistorialTabla.service';
import type { ShippingCarrier } from '@/lib/types';

const CARRIER_LABEL: Record<ShippingCarrier, string> = {
  ANDREANI: 'Andreani',
  CORREO_ARGENTINO: 'Correo Argentino',
  VIA_CARGO: 'Via Cargo',
  OTRO: 'Otro',
  RETIRO_EN_PERSONA: 'Retiro',
};

interface EnviosHistorialTableProps {
  rows: EnvioHistorialRow[];
  loading: boolean;
  emptyMessage?: string;
  onRowClick: (row: EnvioHistorialRow) => void;
  onDownloadPdf: (row: EnvioHistorialRow) => void;
  onCopyPhone: (phone: string) => void;
}

function CarrierBadge({ carrier }: { carrier: ShippingCarrier | null }) {
  if (!carrier) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="font-normal whitespace-nowrap">
      {CARRIER_LABEL[carrier] ?? carrier}
    </Badge>
  );
}

export function EnviosHistorialTable({
  rows,
  loading,
  emptyMessage = 'No hay pedidos con seguimiento enviado para mostrar.',
  onRowClick,
  onDownloadPdf,
  onCopyPhone,
}: EnviosHistorialTableProps) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const cell = 'px-3 py-3 align-middle';
  const head = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';

  const openPreview = (row: EnvioHistorialRow) => {
    if (!row.previewUrl) return;
    void (async () => {
      try {
        const src = await resolveStorageDisplayUrl(row.previewUrl!, row.previewMockupSolicitudId);
        setPreviewImageUrl(src);
      } catch {
        setPreviewImageUrl(row.previewUrl);
      }
    })();
  };

  if (loading && !rows.length) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando historial...
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[min(75vh,720px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card border-b">
              <tr>
                <th className={head}>Creado</th>
                <th className={head}>Cliente</th>
                <th className={head}>Diseño</th>
                <th className={head}>Preview</th>
                <th className={head}>N° seguimiento</th>
                <th className={head}>Empresa</th>
                <th className={head}>Seguimiento enviado</th>
                <th className={`${head} text-center`}>WhatsApp</th>
                <th className={head}>Items</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ContextMenu key={row.ordenId}>
                  <ContextMenuTrigger asChild>
                  <tr
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => onRowClick(row)}
                  >
                    <td className={`${cell} whitespace-nowrap text-muted-foreground`}>
                      {row.createdAt ? formatDate(row.createdAt) : '—'}
                    </td>
                    <td className={`${cell} font-medium max-w-[9rem]`}>
                      <span className="truncate block" title={row.customerName}>
                        {row.customerName}
                      </span>
                    </td>
                    <td className={`${cell} max-w-[10rem] truncate`} title={row.designLabel}>
                      {row.designLabel}
                    </td>
                    <td className={`${cell} w-[4.5rem]`}>
                      {row.previewUrl ? (
                        <button
                          type="button"
                          title="Ver archivo"
                          className="block h-12 w-12 cursor-zoom-in rounded-md border bg-white p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(row);
                          }}
                        >
                          <StorageUrlImage
                            url={row.previewUrl}
                            alt={row.designLabel}
                            mockupSolicitudId={row.previewMockupSolicitudId}
                            className="h-full w-full"
                            imgClassName="h-full w-full object-contain"
                            fallbackClassName="flex h-full w-full items-center justify-center bg-muted/40"
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${cell} font-mono text-xs whitespace-nowrap`}>
                      {row.trackingNumber || '—'}
                    </td>
                    <td className={cell}>
                      <CarrierBadge carrier={row.carrier} />
                    </td>
                    <td className={`${cell} whitespace-nowrap text-muted-foreground`}>
                      {row.seguimientoEnviadoAt ? formatDateTime(row.seguimientoEnviadoAt) : '—'}
                    </td>
                    <td className={`${cell} text-center w-12`}>
                      <button
                        type="button"
                        title={row.customerPhone ? 'Copiar número al portapapeles' : 'Sin teléfono en la orden'}
                        disabled={!row.customerPhone}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (row.customerPhone) onCopyPhone(row.customerPhone);
                        }}
                        className={`inline-flex size-8 items-center justify-center rounded-full border transition-colors ${
                          row.customerPhone
                            ? 'border-green-600/35 bg-green-500/15 text-green-700 hover:bg-green-500/25 dark:border-green-400/35 dark:text-green-400'
                            : 'cursor-not-allowed border-muted text-muted-foreground opacity-40'
                        }`}
                      >
                        <WhatsappLogo className="size-4" />
                      </button>
                    </td>
                    <td className={`${cell} max-w-[14rem]`}>
                      <span className="line-clamp-2 text-xs text-muted-foreground leading-snug" title={row.itemsSummary}>
                        {row.itemsSummary}
                      </span>
                    </td>
                  </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      disabled={!row.andreaniPdfPath}
                      onSelect={() => {
                        if (row.andreaniPdfPath) onDownloadPdf(row);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {row.andreaniPdfPath ? 'Descargar PDF' : 'Sin PDF guardado'}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Vista previa del archivo</DialogTitle>
          </DialogHeader>
          {previewImageUrl ? (
            <div className="w-full max-h-[70vh] overflow-auto rounded-md border bg-white p-4">
              <img
                src={previewImageUrl}
                alt="Preview ampliado"
                className="mx-auto h-auto max-h-[65vh] w-auto object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
