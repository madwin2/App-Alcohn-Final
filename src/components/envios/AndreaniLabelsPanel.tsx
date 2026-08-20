import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/types';
import {
  andreaniAssignCandidatesFromOrders,
  assignAndreaniEtiquetaToOrder,
  downloadAndreaniEtiquetaPdf,
  listAndreaniEtiquetas,
  type AndreaniEtiquetaRow,
} from '@/lib/supabase/services/andreaniEtiquetas.service';
import { Download, Loader2, RefreshCw } from 'lucide-react';

type SyncResponse = {
  status?: string;
  message?: string;
  skipped?: number;
  assigned?: number;
  orphans?: number;
  downloaded?: number;
};

export function AndreaniLabelsPanel({
  orders,
  onAssigned,
}: {
  orders: Order[];
  onAssigned?: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AndreaniEtiquetaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignPick, setAssignPick] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const candidates = useMemo(() => andreaniAssignCandidatesFromOrders(orders), [orders]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAndreaniEtiquetas());
    } catch (error) {
      toast({
        title: 'Etiquetas Andreani',
        description: error instanceof Error ? error.message : 'No se pudieron leer las etiquetas (¿corriste la migración?)',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const assigned = rows.filter((r) => r.estado === 'asignada');
  const orphans = rows.filter((r) => r.estado === 'huerfano');

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/andreani-sync-labels', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as SyncResponse;
      if (!res.ok) {
        const msg = typeof json.message === 'string' ? json.message : `Error ${res.status}`;
        if (res.status === 404 || /ruta no encontrada/i.test(msg)) {
          throw new Error(
            'El worker Andreani no tiene /sync-labels. Actualizá y reiniciá el servicio en el VPS (git pull + build + pm2 restart).',
          );
        }
        throw new Error(msg);
      }
      toast({
        title: 'Etiquetas actualizadas',
        description:
          json.message ||
          `Nuevas: ${json.downloaded ?? 0} · asignadas: ${json.assigned ?? 0} · huérfanas: ${json.orphans ?? 0} · ya estaban: ${json.skipped ?? 0}`,
      });
      await refresh();
      onAssigned?.();
    } catch (error) {
      toast({
        title: 'No se pudieron traer etiquetas',
        description: error instanceof Error ? error.message : 'Falló el worker',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleAssign = async (etiquetaId: string) => {
    const ordenId = assignPick[etiquetaId];
    if (!ordenId) {
      toast({ title: 'Elegí un pedido', variant: 'destructive' });
      return;
    }
    setAssigningId(etiquetaId);
    try {
      await assignAndreaniEtiquetaToOrder(etiquetaId, ordenId);
      toast({ title: 'Etiqueta asignada', description: 'El pedido quedó en Etiqueta lista. La venta no cambió.' });
      setAssignPick((prev) => {
        const next = { ...prev };
        delete next[etiquetaId];
        return next;
      });
      await refresh();
      onAssigned?.();
    } catch (error) {
      toast({
        title: 'No se pudo asignar',
        description: error instanceof Error ? error.message : 'Error al asignar',
        variant: 'destructive',
      });
    } finally {
      setAssigningId(null);
    }
  };

  const handleDownload = async (row: AndreaniEtiquetaRow) => {
    if (!row.pdfPath) {
      toast({ title: 'Sin PDF', description: 'Esta etiqueta no tiene archivo guardado.', variant: 'destructive' });
      return;
    }
    if (row.estado !== 'asignada' || !row.saleTransferred) {
      toast({
        title: 'Todavía no se puede descargar',
        description: 'Pasá la venta a Transferido cuando el cliente pague el restante.',
        variant: 'destructive',
      });
      return;
    }
    setDownloadingId(row.id);
    try {
      await downloadAndreaniEtiquetaPdf(row.pdfPath);
    } catch (error) {
      toast({
        title: 'No se pudo descargar',
        description: error instanceof Error ? error.message : 'Error al firmar el PDF',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Envíos Andreani (etiquetas)</h2>
          <p className="text-xs text-muted-foreground">
            Traé las etiquetas pagadas del portal. El PDF de despacho se habilita cuando la venta está Transferido.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} disabled={loading || syncing}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSync()} disabled={syncing}>
            {syncing ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Trayendo…
              </>
            ) : (
              'Traer etiquetas'
            )}
          </Button>
        </div>
      </div>

      <div className="overflow-auto max-h-[min(40vh,360px)] rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left sticky top-0">
            <tr>
              <th className="px-2 py-1.5 font-medium">Pedido</th>
              <th className="px-2 py-1.5 font-medium">Seguimiento</th>
              <th className="px-2 py-1.5 font-medium">Operación</th>
              <th className="px-2 py-1.5 font-medium">Venta</th>
              <th className="px-2 py-1.5 font-medium text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {assigned.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                  Todavía no hay etiquetas asignadas a pedidos.
                </td>
              </tr>
            ) : (
              assigned.map((row) => {
                const canDownload = Boolean(row.pdfPath) && row.saleTransferred;
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1.5">{row.clienteNombre || '—'}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.tracking}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.nroOperacion || '—'}</td>
                    <td className="px-2 py-1.5">{row.saleTransferred ? 'Transferido' : 'Pendiente'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={!canDownload || downloadingId === row.id}
                        title={
                          row.saleTransferred
                            ? 'Descargar etiqueta 100×152'
                            : 'Disponible cuando la venta esté Transferido'
                        }
                        onClick={() => void handleDownload(row)}
                      >
                        {downloadingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Huérfanos ({orphans.length})
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Envíos pagados en Andreani sin un único pedido con link asignado. Asignalos a mano.
        </p>
        <div className="overflow-auto max-h-[min(36vh,280px)] rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left sticky top-0">
              <tr>
                <th className="px-2 py-1.5 font-medium">Destinatario</th>
                <th className="px-2 py-1.5 font-medium">Seguimiento</th>
                <th className="px-2 py-1.5 font-medium">Pedido</th>
                <th className="px-2 py-1.5 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {orphans.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                    No hay huérfanos.
                  </td>
                </tr>
              ) : (
                orphans.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1.5">
                      <div>{row.destinatario || '—'}</div>
                      <div className="text-[10px] text-muted-foreground">{row.destino}</div>
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.tracking}</td>
                    <td className="px-2 py-1.5 min-w-[180px]">
                      <Select
                        value={assignPick[row.id] || ''}
                        onValueChange={(value) => setAssignPick((prev) => ({ ...prev, [row.id]: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Elegir pedido…" />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7"
                        disabled={!assignPick[row.id] || assigningId === row.id}
                        onClick={() => void handleAssign(row.id)}
                      >
                        {assigningId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Asignar'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
