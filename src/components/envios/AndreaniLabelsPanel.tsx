import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/types';
import {
  andreaniAssignCandidatesFromOrders,
  assignAndreaniEtiquetaToOrder,
  downloadAndreaniEtiquetaPdf,
  downloadMergedAndreaniEtiquetasPdfs,
  listAndreaniEtiquetas,
  type AndreaniEtiquetaRow,
} from '@/lib/supabase/services/andreaniEtiquetas.service';
import {
  andreaniJobKindLabel,
  fetchAndreaniWorkerJob,
  isAndreaniJobActive,
  waitAndreaniWorkerJob,
  type AndreaniWorkerJob,
} from '@/lib/andreaniWorkerJob';
import { normalizePhoneDigits } from '@/lib/utils/shippingNormalization';
import { isEtiquetaActivaEnTabla } from '@/lib/utils/andreaniPortalEstado';
import { Download, Loader2, RefreshCw } from 'lucide-react';

type SyncResponse = {
  status?: string;
  message?: string;
  skipped?: number;
  assigned?: number;
  orphans?: number;
  downloaded?: number;
};

type SyncTrackingResponse = {
  status?: string;
  message?: string;
  checked?: number;
  dispatched?: number;
  pending?: number;
  notFound?: number;
};

/** Ícono WhatsApp (marca registrada Meta); solo UI. */
function WhatsappLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.372a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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
  const [updatingTracking, setUpdatingTracking] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignPick, setAssignPick] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [workerJob, setWorkerJob] = useState<AndreaniWorkerJob | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listAndreaniEtiquetas();
      setRows(next);
    } catch (error) {
      console.warn('Error cargando etiquetas Andreani:', error);
      toast({
        title: 'Etiquetas Andreani',
        description: 'No se pudo leer la lista (¿corriste la migración?)',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll del estado del worker mientras haya job activo (o al montar).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const job = await fetchAndreaniWorkerJob();
      if (!cancelled) setWorkerJob(job);
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const jobActive = isAndreaniJobActive(workerJob);

  const candidates = useMemo(() => andreaniAssignCandidatesFromOrders(orders), [orders]);

  const phoneByOrderId = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) {
      const digits = normalizePhoneDigits(order.customer.phoneE164 || '');
      if (digits) map.set(order.id, digits);
    }
    return map;
  }, [orders]);

  const assigned = useMemo(() => {
    const list = rows.filter((r) => r.estado === 'asignada' && isEtiquetaActivaEnTabla(r));
    return [...list].sort((a, b) => {
      const aReady = Boolean(a.pdfPath) && a.saleTransferred ? 0 : 1;
      const bReady = Boolean(b.pdfPath) && b.saleTransferred ? 0 : 1;
      if (aReady !== bReady) return aReady - bReady;
      return b.creadoEn.localeCompare(a.creadoEn);
    });
  }, [rows]);

  const orphans = useMemo(
    () => rows.filter((r) => r.estado === 'huerfano' && isEtiquetaActivaEnTabla(r)),
    [rows],
  );

  const downloadable = useMemo(
    () => assigned.filter((r) => Boolean(r.pdfPath) && r.saleTransferred),
    [assigned],
  );
  const pendingCount = assigned.length - downloadable.length;

  const resolvePhoneDigits = (row: AndreaniEtiquetaRow): string => {
    const fromCliente = normalizePhoneDigits(row.clienteTelefono || '');
    if (fromCliente) return fromCliente;
    if (row.ordenId) return phoneByOrderId.get(row.ordenId) || '';
    return '';
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/andreani-sync-labels', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as SyncResponse;
      if (!res.ok && res.status !== 202) {
        const msg = typeof json.message === 'string' ? json.message : `Error ${res.status}`;
        if (res.status === 404 || /ruta no encontrada/i.test(msg)) {
          throw new Error(
            'El worker Andreani no tiene /sync-labels. Actualizá y reiniciá el servicio en el VPS (git pull + build + pm2 restart).',
          );
        }
        throw new Error(msg);
      }

      toast({
        title: 'Trayendo etiquetas…',
        description: 'Solo envíos pendientes de ingreso (los que se pueden imprimir).',
      });

      const finalJob = await waitAndreaniWorkerJob({
        pollMs: 4_000,
        maxMs: 12 * 60_000,
        onUpdate: (job) => setWorkerJob(job),
      });

      await refresh();
      onAssigned?.();

      if (finalJob?.phase === 'error' || finalJob?.lastOk === false) {
        toast({
          title: 'Sync terminó con error',
          description: finalJob.lastMessage || finalJob.detail || 'Revisá el worker',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Etiquetas actualizadas',
          description: finalJob?.lastMessage || 'Listo',
        });
      }
    } catch (error) {
      toast({
        title: 'No se pudieron traer etiquetas',
        description: error instanceof Error ? error.message : 'Falló el worker',
        variant: 'destructive',
      });
      await refresh();
    } finally {
      setSyncing(false);
      const job = await fetchAndreaniWorkerJob();
      setWorkerJob(job);
    }
  };

  const handleUpdateTracking = async () => {
    setUpdatingTracking(true);
    try {
      const res = await fetch('/api/andreani-sync-tracking', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as SyncTrackingResponse;
      if (!res.ok && res.status !== 202) {
        const msg = typeof json.message === 'string' ? json.message : `Error ${res.status}`;
        if (res.status === 404 || /ruta no encontrada/i.test(msg)) {
          throw new Error(
            'El worker Andreani no tiene /sync-tracking. Actualizá y reiniciá el servicio en el VPS.',
          );
        }
        throw new Error(msg);
      }

      toast({
        title: 'Actualizando seguimientos…',
        description:
          'Revisamos el portal Andreani. Si ya no están “Pendiente de ingreso”, el envío pasa a Despachado.',
      });

      const finalJob = await waitAndreaniWorkerJob({
        pollMs: 4_000,
        maxMs: 12 * 60_000,
        onUpdate: (job) => setWorkerJob(job),
      });

      await refresh();
      onAssigned?.();

      if (finalJob?.phase === 'error' || finalJob?.lastOk === false) {
        toast({
          title: 'Actualización terminó con error',
          description: finalJob.lastMessage || finalJob.detail || 'Revisá el worker',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Seguimientos actualizados',
          description: finalJob?.lastMessage || 'Listo',
        });
      }
    } catch (error) {
      toast({
        title: 'No se pudieron actualizar seguimientos',
        description: error instanceof Error ? error.message : 'Falló el worker',
        variant: 'destructive',
      });
      await refresh();
    } finally {
      setUpdatingTracking(false);
      const job = await fetchAndreaniWorkerJob();
      setWorkerJob(job);
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

  const handleDownloadAll = async () => {
    const paths = downloadable.map((r) => r.pdfPath).filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      toast({
        title: 'Nada para descargar',
        description: 'No hay etiquetas con venta Transferido y PDF listo.',
        variant: 'destructive',
      });
      return;
    }
    setDownloadingAll(true);
    try {
      await downloadMergedAndreaniEtiquetasPdfs(paths);
      toast({
        title: 'PDF listo',
        description: `${paths.length} etiqueta${paths.length === 1 ? '' : 's'} en un solo archivo (100×152).`,
      });
    } catch (error) {
      toast({
        title: 'No se pudo unir los PDFs',
        description: error instanceof Error ? error.message : 'Error al generar el archivo',
        variant: 'destructive',
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleCopyPhone = (row: AndreaniEtiquetaRow) => {
    const digits = resolvePhoneDigits(row);
    if (!digits) {
      toast({
        title: 'Sin teléfono',
        description: 'Este pedido no tiene número cargado.',
        variant: 'destructive',
      });
      return;
    }
    void navigator.clipboard.writeText(digits).then(
      () => {
        toast({
          title: 'Teléfono copiado',
          description: digits,
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

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 space-y-4">
      {(jobActive || workerJob?.phase === 'done' || workerJob?.phase === 'error') && workerJob ? (
        <div
          className={
            workerJob.phase === 'error'
              ? 'rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs'
              : workerJob.phase === 'done'
                ? 'rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-xs'
                : 'rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs'
          }
        >
          <div className="flex items-center gap-2 font-medium">
            {jobActive ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
            <span>
              {jobActive ? 'Worker en curso' : workerJob.phase === 'error' ? 'Worker: error' : 'Worker: listo'}
              {workerJob.kind ? ` · ${andreaniJobKindLabel(workerJob.kind)}` : ''}
              {workerJob.queueDepth > 0 ? ` · cola ${workerJob.queueDepth}` : ''}
            </span>
          </div>
          <p className="mt-0.5 text-muted-foreground">{workerJob.detail}</p>
          {workerJob.lastMessage && !jobActive ? (
            <p className="mt-0.5 text-muted-foreground">{workerJob.lastMessage}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Envíos Andreani (etiquetas)</h2>
          <p className="text-xs text-muted-foreground">
            Traé las etiquetas pagadas del portal. El PDF de despacho se habilita cuando la venta está Transferido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
            <span className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">
              {downloadable.length} para descargar
            </span>
            <span className="rounded-md border px-1.5 py-0.5">
              {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
            </span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} disabled={loading || syncing || updatingTracking}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleUpdateTracking()}
            disabled={updatingTracking || syncing || jobActive}
            title="Consulta el portal Andreani y marca Despachado si ya no están pendientes de ingreso"
          >
            {updatingTracking || (jobActive && workerJob?.kind === 'sync-tracking') ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Actualizando…
              </>
            ) : (
              'Actualizar seguimientos'
            )}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSync()} disabled={syncing || updatingTracking || jobActive}>
            {syncing || (jobActive && workerJob?.kind === 'sync-labels') ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Trayendo…
              </>
            ) : (
              'Traer etiquetas'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloadable.length === 0 || downloadingAll || syncing || updatingTracking}
            title="Descarga todas las etiquetas Transferido en un PDF (hojas 100×152)"
            onClick={() => void handleDownloadAll()}
          >
            {downloadingAll ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Uniendo…
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Descargar todas ({downloadable.length})
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="overflow-auto max-h-[min(40vh,360px)] rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left sticky top-0">
            <tr>
              <th className="px-2 py-1.5 font-medium">Pedido</th>
              <th className="px-2 py-1.5 font-medium">Diseño</th>
              <th className="px-2 py-1.5 font-medium">Seguimiento</th>
              <th className="px-2 py-1.5 font-medium">Operación</th>
              <th className="px-2 py-1.5 font-medium">Venta</th>
              <th className="px-2 py-1.5 font-medium">Estado Andreani</th>
              <th className="px-2 py-1.5 font-medium text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {assigned.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                  Todavía no hay etiquetas asignadas a pedidos.
                </td>
              </tr>
            ) : (
              assigned.map((row) => {
                const canDownload = Boolean(row.pdfPath) && row.saleTransferred;
                const phoneDigits = resolvePhoneDigits(row);
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{row.clienteNombre || '—'}</span>
                        <button
                          type="button"
                          title={phoneDigits ? 'Copiar número al portapapeles' : 'Sin teléfono en la orden'}
                          disabled={!phoneDigits}
                          onClick={() => handleCopyPhone(row)}
                          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            phoneDigits
                              ? 'border-green-600/35 bg-green-500/15 text-green-700 hover:bg-green-500/25 dark:border-green-400/35 dark:text-green-400'
                              : 'cursor-not-allowed border-muted text-muted-foreground opacity-40'
                          }`}
                        >
                          <WhatsappLogo className="size-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">{row.disenoNombre || '—'}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.tracking}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.nroOperacion || '—'}</td>
                    <td className="px-2 py-1.5">{row.saleTransferred ? 'Transferido' : 'Pendiente'}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.estadoPortal || '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={!canDownload || downloadingId === row.id || downloadingAll}
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
