import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { EnviosHistorialTable } from '@/components/envios/EnviosHistorialTable';
import { EnviosHistorialDetailDialog } from '@/components/envios/EnviosHistorialDetailDialog';
import {
  ENVIOS_HISTORIAL_PAGE_SIZE,
  ENVIOS_HISTORIAL_SEARCH_PAGE_SIZE,
  fetchEnviosHistorial,
  hasEtiquetaPdfDownloaded,
  type EnvioHistorialRow,
} from '@/lib/supabase/services/enviosHistorialTabla.service';
import { downloadAndreaniEtiquetaPdf } from '@/lib/supabase/services/andreaniEtiquetas.service';
import { insertEnvioEventoForOrden } from '@/lib/supabase/services/enviosHistorial.service';
import { getOrderById } from '@/lib/supabase/services/orders.service';

export default function EnviosHistorialPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<EnvioHistorialRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [selectedRow, setSelectedRow] = useState<EnvioHistorialRow | null>(null);
  const loadIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const loadId = ++loadIdRef.current;
    const pageSize = search.trim() ? ENVIOS_HISTORIAL_SEARCH_PAGE_SIZE : ENVIOS_HISTORIAL_PAGE_SIZE;
    setLoading(true);

    void fetchEnviosHistorial({ search, limit: pageSize, offset: 0 })
      .then((result) => {
        if (loadId !== loadIdRef.current) return;
        setRows(result.rows);
        setHasMore(result.hasMore);
        setNextOffset(pageSize);
      })
      .catch((err) => {
        if (loadId !== loadIdRef.current) return;
        toast({
          title: 'No se pudo cargar el historial',
          description: err instanceof Error ? err.message : 'Error al consultar los envíos',
          variant: 'destructive',
        });
        setRows([]);
        setHasMore(false);
      })
      .finally(() => {
        if (loadId === loadIdRef.current) setLoading(false);
      });
  }, [search, toast]);

  const loadMore = async () => {
    const pageSize = search.trim() ? ENVIOS_HISTORIAL_SEARCH_PAGE_SIZE : ENVIOS_HISTORIAL_PAGE_SIZE;
    const loadId = loadIdRef.current;
    setLoadingMore(true);
    try {
      const result = await fetchEnviosHistorial({ search, limit: pageSize, offset: nextOffset });
      if (loadId !== loadIdRef.current) return;
      setRows((prev) => [...prev, ...result.rows]);
      setHasMore(result.hasMore);
      setNextOffset((prev) => prev + pageSize);
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      toast({
        title: 'No se pudo cargar más',
        description: err instanceof Error ? err.message : 'Error al consultar los envíos',
        variant: 'destructive',
      });
    } finally {
      if (loadId === loadIdRef.current) setLoadingMore(false);
    }
  };

  const handleCopyPhone = (phone: string) => {
    void navigator.clipboard.writeText(phone).then(
      () => {
        toast({
          title: 'Teléfono copiado',
          description: phone,
        });
      },
      () => {
        toast({
          title: 'No se pudo copiar',
          description: 'Permisos del portapapeles o HTTPS requerido.',
          variant: 'destructive',
        });
      },
    );
  };

  const handleDownloadPdf = async (row: EnvioHistorialRow) => {
    if (!row.andreaniPdfPath) {
      toast({
        title: 'Sin PDF',
        description: 'Este pedido no tiene una etiqueta Andreani guardada.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const order = await getOrderById(row.ordenId);
      await downloadAndreaniEtiquetaPdf(row.andreaniPdfPath, {
        tracking: row.trackingNumber ?? undefined,
        order,
      });
      const already = await hasEtiquetaPdfDownloaded(row.ordenId, row.andreaniEtiquetaId);
      await insertEnvioEventoForOrden(
        row.ordenId,
        already ? 'etiqueta_reimpresa' : 'etiqueta_descargada',
        { etiqueta_id: row.andreaniEtiquetaId },
      );
      toast({
        title: already ? 'Etiqueta reimpresa' : 'PDF descargado',
        description: row.trackingNumber ? `Seguimiento ${row.trackingNumber}` : undefined,
      });
    } catch (err) {
      toast({
        title: 'No se pudo descargar',
        description: err instanceof Error ? err.message : 'Error al firmar el PDF',
        variant: 'destructive',
      });
    }
  };

  return (
    <AppMain className="flex flex-col">
      <div className="border-b bg-background p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/envios')} title="Volver a Envíos">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Historial de Envíos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pedidos ya despachados, ordenados por fecha de envío de seguimiento.
            </p>
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por cliente, diseño o WhatsApp..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden flex flex-col gap-4 min-h-0">
        <EnviosHistorialTable
          rows={rows}
          loading={loading}
          emptyMessage={
            search.trim()
              ? 'No hay coincidencias para esa búsqueda.'
              : 'No hay pedidos con seguimiento enviado para mostrar.'
          }
          onRowClick={setSelectedRow}
          onDownloadPdf={(row) => void handleDownloadPdf(row)}
          onCopyPhone={handleCopyPhone}
        />
        {hasMore ? (
          <div className="flex justify-center">
            <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                'Cargar más'
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <EnviosHistorialDetailDialog
        ordenId={selectedRow?.ordenId ?? null}
        customerName={selectedRow?.customerName}
        open={Boolean(selectedRow)}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      />
      <Toaster />
    </AppMain>
  );
}
