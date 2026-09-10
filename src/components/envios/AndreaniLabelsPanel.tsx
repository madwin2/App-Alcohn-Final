import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Order, OrderItem, SaleState } from '@/lib/types';
import {
  andreaniAssignCandidatesFromOrders,
  assignAndreaniEtiquetaToOrder,
  deleteAndreaniEtiqueta,
  downloadAndreaniEtiquetaPdf,
  downloadMergedAndreaniEtiquetasPdfs,
  importManualAndreaniEtiquetaPdfs,
  liberarAndreaniEtiqueta,
  listAndreaniEtiquetas,
  marcarAndreaniEtiquetaErronea,
  restaurarAndreaniEtiquetaHuerfano,
  type AndreaniEtiquetaRow,
  type AndreaniPedidoTrasLiberar,
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
import { getOrderItemDisplayName } from '@/lib/utils/itemDisplayName';
import { resolveStorageDisplayUrl } from '@/lib/utils/storageUrlUtils';
import { StorageUrlImage } from '@/components/shared/StorageUrlImage';
import { WhatsappLogo } from '@/components/shared/WhatsappLogo';
import {
  getDownloadedAndreaniEtiquetaIds,
  insertEnvioEventoForOrden,
} from '@/lib/supabase/services/enviosHistorial.service';
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlink,
  Upload,
} from 'lucide-react';
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

type ConfirmAction =
  | { kind: 'liberar'; row: AndreaniEtiquetaRow }
  | { kind: 'eliminar'; row: AndreaniEtiquetaRow }
  | { kind: 'erronea'; row: AndreaniEtiquetaRow }
  | { kind: 'restaurar'; row: AndreaniEtiquetaRow };

function itemPreviewUrl(item: OrderItem): string | null {
  return item.files?.vectorPreviewUrl || item.files?.baseUrl || item.files?.vectorUrl || null;
}

function orderItemsDesignLabel(order: Order | undefined, fallback: string | null): string {
  if (!order?.items?.length) return fallback || '—';
  return order.items.map((item) => getOrderItemDisplayName(item)).join(', ');
}

export function AndreaniLabelsPanel({
  orders,
  onAssigned,
  onUpdateOrder,
}: {
  orders: Order[];
  onAssigned?: () => void;
  onUpdateOrder?: (orderId: string, updates: Partial<Order>) => Promise<unknown>;
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
  const [isExpanded, setIsExpanded] = useState(true);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(() => new Set());
  const [ventaBusyId, setVentaBusyId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [pedidoAccion, setPedidoAccion] = useState<AndreaniPedidoTrasLiberar>('sin_envio');
  const [seguimientoManual, setSeguimientoManual] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [erroneasExpanded, setErroneasExpanded] = useState(false);
  const [uploadingPdfs, setUploadingPdfs] = useState(false);
  const [manualUploadFiles, setManualUploadFiles] = useState<File[] | null>(null);
  const [manualMissing, setManualMissing] = useState<
    Array<{ fileName: string; pageNumber: number; tracking: string; destinatario: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    void getDownloadedAndreaniEtiquetaIds().then((ids) => {
      if (!cancelled) setDownloadedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const ordersById = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of orders) map.set(order.id, order);
    return map;
  }, [orders]);

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

  const erroneas = useMemo(
    () => rows.filter((r) => r.estado === 'erronea'),
    [rows],
  );

  const downloadable = useMemo(
    () => assigned.filter((r) => Boolean(r.pdfPath) && r.saleTransferred),
    [assigned],
  );
  const pendingCount = assigned.length - downloadable.length;

  const markDownloaded = useCallback(
    (etiquetaRows: Array<{ id: string; ordenId: string | null }>) => {
      if (etiquetaRows.length === 0) return;
      setDownloadedIds((prev) => {
        const next = new Set(prev);
        for (const row of etiquetaRows) next.add(row.id);
        return next;
      });
      for (const row of etiquetaRows) {
        if (!row.ordenId) continue;
        const already = downloadedIds.has(row.id);
        void insertEnvioEventoForOrden(
          row.ordenId,
          already ? 'etiqueta_reimpresa' : 'etiqueta_descargada',
          { etiqueta_id: row.id },
        );
      }
    },
    [downloadedIds],
  );

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

  const runManualImport = async (
    files: File[],
    overrides?: Record<string, { tracking: string; destinatario?: string | null }>,
  ) => {
    setUploadingPdfs(true);
    try {
      const result = await importManualAndreaniEtiquetaPdfs(files, overrides);
      const done = result.imported + result.updated;
      if (result.skipped.length > 0 && !overrides) {
        setManualUploadFiles(files);
        setManualMissing(
          result.skipped.map((s) => ({
            fileName: s.fileName,
            pageNumber: s.pageNumber,
            tracking: '',
            destinatario: '',
          })),
        );
        if (done > 0) {
          toast({
            title: 'Carga parcial',
            description: `${done} PDF(s) listos. Completá el seguimiento de ${result.skipped.length} hoja(s).`,
          });
          await refresh();
        }
        return;
      }
      if (done === 0 && result.skipped.length > 0) {
        throw new Error(result.skipped[0]?.reason || 'No se pudo importar ningún PDF');
      }
      setManualUploadFiles(null);
      setManualMissing([]);
      toast({
        title: 'PDFs cargados',
        description: `${result.imported} nuevo(s), ${result.updated} actualizado(s). Asignalos desde Huérfanos.`,
      });
      await refresh();
      onAssigned?.();
    } catch (error) {
      toast({
        title: 'No se pudieron cargar los PDFs',
        description: error instanceof Error ? error.message : 'Error al importar',
        variant: 'destructive',
      });
    } finally {
      setUploadingPdfs(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualFilePick = (event: { target: HTMLInputElement }) => {
    const list = event.target.files;
    if (!list?.length) return;
    void runManualImport(Array.from(list));
  };

  const handleConfirmManualMissing = async () => {
    if (!manualUploadFiles?.length) return;
    const incomplete = manualMissing.filter((m) => m.tracking.trim().length < 10);
    if (incomplete.length) {
      toast({
        title: 'Falta el seguimiento',
        description: 'Completá el número de seguimiento (mín. 10 dígitos) en cada hoja.',
        variant: 'destructive',
      });
      return;
    }
    const overrides: Record<string, { tracking: string; destinatario?: string | null }> = {};
    for (const m of manualMissing) {
      overrides[`${m.fileName}::${m.pageNumber}`] = {
        tracking: m.tracking.trim(),
        destinatario: m.destinatario.trim() || null,
      };
    }
    await runManualImport(manualUploadFiles, overrides);
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
      const order = row.ordenId ? orders.find((o) => o.id === row.ordenId) : undefined;
      await downloadAndreaniEtiquetaPdf(row.pdfPath, {
        tracking: row.tracking,
        order: order ?? null,
      });
      markDownloaded([{ id: row.id, ordenId: row.ordenId }]);
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
    const ready = downloadable.filter((r) => Boolean(r.pdfPath));
    if (ready.length === 0) {
      toast({
        title: 'Nada para descargar',
        description: 'No hay etiquetas con venta Transferido y PDF listo.',
        variant: 'destructive',
      });
      return;
    }
    setDownloadingAll(true);
    try {
      await downloadMergedAndreaniEtiquetasPdfs(
        ready.map((r) => ({
          pdfPath: r.pdfPath!,
          tracking: r.tracking,
          order: r.ordenId ? orders.find((o) => o.id === r.ordenId) ?? null : null,
        })),
      );
      markDownloaded(ready.map((r) => ({ id: r.id, ordenId: r.ordenId })));
      toast({
        title: 'PDF listo',
        description: `${ready.length} etiqueta${ready.length === 1 ? '' : 's'} en un solo archivo (100×152).`,
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

  const handleVentaChange = async (row: AndreaniEtiquetaRow, value: 'pendiente' | 'transferido') => {
    if (!row.ordenId || !onUpdateOrder) return;
    const order = ordersById.get(row.ordenId);
    if (!order?.items.length) {
      toast({
        title: 'Pedido no encontrado',
        description: 'Recargá la lista de pedidos e intentá de nuevo.',
        variant: 'destructive',
      });
      return;
    }
    const saleState: SaleState = value === 'transferido' ? 'TRANSFERIDO' : 'FOTO_ENVIADA';
    setVentaBusyId(row.id);
    try {
      await onUpdateOrder(order.id, {
        items: order.items.map((item) => ({ id: item.id, saleState })) as unknown as Order['items'],
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, saleTransferred: value === 'transferido' } : r)),
      );
      onAssigned?.();
      toast({
        title: value === 'transferido' ? 'Venta Transferido' : 'Venta Pendiente',
        description: order.customer.firstName,
      });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar la venta',
        description: error instanceof Error ? error.message : 'Error al guardar',
        variant: 'destructive',
      });
    } finally {
      setVentaBusyId(null);
    }
  };

  const openConfirmAction = (action: ConfirmAction) => {
    setPedidoAccion('sin_envio');
    setSeguimientoManual('');
    setConfirmAction(action);
  };

  const needsPedidoDestino = Boolean(confirmAction?.row.ordenId);

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const { kind, row } = confirmAction;
    setActionBusyId(row.id);
    setMenuOpenId(null);
    try {
      const options = row.ordenId
        ? {
            pedidoAccion,
            seguimiento: pedidoAccion === 'seguimiento_enviado' ? seguimientoManual : null,
          }
        : undefined;

      if (kind === 'liberar') {
        await liberarAndreaniEtiqueta(row.id, options);
        toast({
          title: 'PDF liberado',
          description:
            pedidoAccion === 'sin_envio'
              ? 'Quedó huérfano. El pedido pasó a Sin envío.'
              : 'Quedó huérfano. El pedido pasó a Seguimiento enviado.',
        });
      } else if (kind === 'erronea') {
        await marcarAndreaniEtiquetaErronea(row.id);
        toast({
          title: 'Etiqueta errónea',
          description: 'Ya no aparece en Huérfanos. Podés asignarla después desde Erróneas.',
        });
        setErroneasExpanded(true);
      } else if (kind === 'restaurar') {
        await restaurarAndreaniEtiquetaHuerfano(row.id);
        toast({
          title: 'Volvió a huérfanos',
          description: 'La etiqueta está otra vez en la lista para asignar.',
        });
      } else {
        await deleteAndreaniEtiqueta(row.id, options);
        toast({
          title: 'PDF eliminado',
          description: row.ordenId
            ? pedidoAccion === 'sin_envio'
              ? 'El pedido quedó en Sin envío.'
              : 'El pedido quedó en Seguimiento enviado.'
            : undefined,
        });
      }
      setConfirmAction(null);
      await refresh();
      onAssigned?.();
    } catch (error) {
      toast({
        title: kind === 'liberar'
          ? 'No se pudo liberar'
          : kind === 'erronea'
            ? 'No se pudo marcar como errónea'
            : kind === 'restaurar'
              ? 'No se pudo restaurar'
              : 'No se pudo eliminar',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDownloadRaw = async (row: AndreaniEtiquetaRow) => {
    if (!row.pdfPath) {
      toast({ title: 'Sin PDF', description: 'Esta etiqueta no tiene archivo guardado.', variant: 'destructive' });
      return;
    }
    setDownloadingId(row.id);
    try {
      await downloadAndreaniEtiquetaPdf(row.pdfPath, { tracking: row.tracking, order: null });
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

  const openPreview = async (url: string, mockupSolicitudId?: string | null) => {
    try {
      const src = await resolveStorageDisplayUrl(url, mockupSolicitudId);
      setPreviewUrl(src);
    } catch {
      setPreviewUrl(url);
    }
  };

  const renderFilesCell = (order: Order | undefined) => {
    if (!order?.items?.length) {
      return <span className="text-muted-foreground">—</span>;
    }
    const previews = order.items
      .map((item) => ({ item, url: itemPreviewUrl(item) }))
      .filter((x): x is { item: OrderItem; url: string } => Boolean(x.url));
    if (!previews.length) {
      return <span className="text-muted-foreground">—</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {previews.map(({ item, url }) => (
          <button
            key={item.id}
            type="button"
            title={getOrderItemDisplayName(item)}
            className="block h-9 w-9 cursor-zoom-in rounded border bg-white p-0.5"
            onClick={() => void openPreview(url, item.mockupSolicitudId)}
          >
            <StorageUrlImage
              url={url}
              alt={getOrderItemDisplayName(item)}
              mockupSolicitudId={item.mockupSolicitudId}
              className="h-full w-full"
              imgClassName="h-full w-full object-contain"
              fallbackClassName="flex h-full w-full items-center justify-center bg-muted/40 text-[9px] text-muted-foreground"
            />
          </button>
        ))}
      </div>
    );
  };

  const renderActionsMenu = (
    row: AndreaniEtiquetaRow,
    opts: { canLiberar: boolean; canMarcarErronea?: boolean; canRestaurar?: boolean },
  ) => (
    <Popover
      open={menuOpenId === row.id}
      onOpenChange={(open) => setMenuOpenId(open ? row.id : null)}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={actionBusyId === row.id}
          title="Más acciones"
        >
          {actionBusyId === row.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end">
        {opts.canLiberar ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              setMenuOpenId(null);
              openConfirmAction({ kind: 'liberar', row });
            }}
          >
            <Unlink className="h-3.5 w-3.5" />
            Liberar a huérfano
          </button>
        ) : null}
        {opts.canMarcarErronea ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              setMenuOpenId(null);
              openConfirmAction({ kind: 'erronea', row });
            }}
          >
            <Ban className="h-3.5 w-3.5" />
            Marcar como errónea
          </button>
        ) : null}
        {opts.canRestaurar ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              setMenuOpenId(null);
              openConfirmAction({ kind: 'restaurar', row });
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Devolver a huérfanos
          </button>
        ) : null}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          onClick={() => {
            setMenuOpenId(null);
            openConfirmAction({ kind: 'eliminar', row });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar PDF
        </button>
      </PopoverContent>
    </Popover>
  );

  const renderUnassignedTable = (
    list: AndreaniEtiquetaRow[],
    emptyLabel: string,
    opts: { canMarcarErronea: boolean; canRestaurar: boolean },
  ) => (
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
          {list.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            list.map((row) => (
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
                  <div className="inline-flex items-center gap-1">
                    {row.pdfPath ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={downloadingId === row.id}
                        title="Ver PDF"
                        onClick={() => void handleDownloadRaw(row)}
                      >
                        {downloadingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="h-7"
                      disabled={!assignPick[row.id] || assigningId === row.id}
                      onClick={() => void handleAssign(row.id)}
                    >
                      {assigningId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Asignar'}
                    </Button>
                    {opts.canMarcarErronea ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={actionBusyId === row.id}
                        title="Mover a Erróneas (duplicada, mal generada o no usada)"
                        onClick={() => openConfirmAction({ kind: 'erronea', row })}
                      >
                        Errónea
                      </Button>
                    ) : null}
                    {renderActionsMenu(row, {
                      canLiberar: false,
                      canMarcarErronea: opts.canMarcarErronea,
                      canRestaurar: opts.canRestaurar,
                    })}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

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
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-foreground"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            Envíos Andreani (etiquetas)
          </button>
          {isExpanded ? (
            <p className="mt-0.5 text-xs text-muted-foreground pl-5">
              Traé las etiquetas pagadas del portal. El PDF de despacho se habilita cuando la venta está Transferido.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
            <span className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">
              {downloadable.length} para descargar
            </span>
            <span className="rounded-md border px-1.5 py-0.5">
              {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
            </span>
            <span className="rounded-md border px-1.5 py-0.5">{assigned.length} activas</span>
            {erroneas.length > 0 ? (
              <button
                type="button"
                className="rounded-md border border-amber-600/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-800 dark:text-amber-400"
                title="Ver etiquetas erróneas"
                onClick={() => {
                  setIsExpanded(true);
                  setErroneasExpanded(true);
                }}
              >
                {erroneas.length} errónea{erroneas.length === 1 ? '' : 's'}
              </button>
            ) : null}
          </div>
          {isExpanded ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => void refresh()}
                disabled={loading || syncing || updatingTracking}
              >
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPdfs || syncing || updatingTracking || jobActive}
                title="Subí PDFs bajados a mano desde Andreani; quedan como huérfanos listos para asignar"
              >
                {uploadingPdfs ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Cargando…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Cargar PDF
                  </>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={handleManualFilePick}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSync()}
                disabled={syncing || updatingTracking || jobActive || uploadingPdfs}
              >
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
            </>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <>
          <div className="overflow-auto max-h-[min(40vh,360px)] rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Pedido</th>
                  <th className="px-2 py-1.5 font-medium text-center w-10">WA</th>
                  <th className="px-2 py-1.5 font-medium">Diseño</th>
                  <th className="px-2 py-1.5 font-medium">Base / Vector</th>
                  <th className="px-2 py-1.5 font-medium">Seguimiento</th>
                  <th className="px-2 py-1.5 font-medium">Operación</th>
                  <th className="px-2 py-1.5 font-medium">Venta</th>
                  <th className="px-2 py-1.5 font-medium">Estado Andreani</th>
                  <th className="px-2 py-1.5 font-medium text-right">PDF</th>
                  <th className="px-2 py-1.5 font-medium text-center w-16">Desc.</th>
                  <th className="px-2 py-1.5 font-medium text-right w-10"> </th>
                </tr>
              </thead>
              <tbody>
                {assigned.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-2 py-4 text-center text-muted-foreground">
                      Todavía no hay etiquetas asignadas a pedidos.
                    </td>
                  </tr>
                ) : (
                  assigned.map((row) => {
                    const canDownload = Boolean(row.pdfPath) && row.saleTransferred;
                    const phoneDigits = resolvePhoneDigits(row);
                    const order = row.ordenId ? ordersById.get(row.ordenId) : undefined;
                    const designLabel = orderItemsDesignLabel(order, row.disenoNombre);
                    const wasDownloaded = downloadedIds.has(row.id);
                    return (
                      <tr key={row.id} className="border-t">
                        <td className="px-2 py-1.5">
                          <span className="truncate block max-w-[9rem]" title={row.clienteNombre || undefined}>
                            {row.clienteNombre || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            title={phoneDigits ? 'Copiar número al portapapeles' : 'Sin teléfono en la orden'}
                            disabled={!phoneDigits}
                            onClick={() => handleCopyPhone(row)}
                            className={`inline-flex size-6 items-center justify-center rounded-full border transition-colors ${
                              phoneDigits
                                ? 'border-border bg-background text-foreground hover:bg-muted'
                                : 'cursor-not-allowed border-muted text-muted-foreground opacity-40'
                            }`}
                          >
                            <WhatsappLogo className="size-3.5" />
                          </button>
                        </td>
                        <td className="px-2 py-1.5 max-w-[12rem]">
                          <span className="line-clamp-2" title={designLabel}>
                            {designLabel}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">{renderFilesCell(order)}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">{row.tracking}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">{row.nroOperacion || '—'}</td>
                        <td className="px-2 py-1.5 min-w-[7.5rem]">
                          {row.ordenId && onUpdateOrder ? (
                            <Select
                              value={row.saleTransferred ? 'transferido' : 'pendiente'}
                              onValueChange={(value) =>
                                void handleVentaChange(row, value as 'pendiente' | 'transferido')
                              }
                              disabled={ventaBusyId === row.id}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pendiente" className="text-xs">
                                  Pendiente
                                </SelectItem>
                                <SelectItem value="transferido" className="text-xs">
                                  Transferido
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span>{row.saleTransferred ? 'Transferido' : 'Pendiente'}</span>
                          )}
                        </td>
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
                        <td className="px-2 py-1.5 text-center">
                          {wasDownloaded ? (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400"
                              title="Ya descargaste este PDF"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Sí
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {renderActionsMenu(row, { canLiberar: true })}
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
              Envíos pagados en Andreani sin un único pedido con link asignado. Asignalos a mano, marcalos como
              erróneos o eliminá el PDF. Si el sync falla, bajá el PDF en Andreani y usá{' '}
              <span className="font-medium">Cargar PDF</span>.
            </p>
            {renderUnassignedTable(orphans, 'No hay huérfanos.', {
              canMarcarErronea: true,
              canRestaurar: false,
            })}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setErroneasExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {erroneasExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              Erróneas ({erroneas.length})
            </button>
            {erroneasExpanded ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Etiquetas duplicadas, mal generadas o que no vas a usar. No vuelven a aparecer en Huérfanos al
                  traer etiquetas. Si más adelante coinciden con un pedido, asignalas desde acá.
                </p>
                {renderUnassignedTable(erroneas, 'No hay etiquetas erróneas.', {
                  canMarcarErronea: false,
                  canRestaurar: true,
                })}
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <Dialog
        open={manualMissing.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setManualMissing([]);
            setManualUploadFiles(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Completar seguimiento</DialogTitle>
            <DialogDescription>
              No se pudo leer el TN en {manualMissing.length} hoja(s). Copiá el número desde Andreani y
              confirmá para cargarlo como huérfano.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-auto py-1">
            {manualMissing.map((row, idx) => (
              <div key={`${row.fileName}-${row.pageNumber}`} className="space-y-1.5 rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">
                  {row.fileName}
                  {manualMissing.length > 1 ? ` · hoja ${row.pageNumber}` : ''}
                </p>
                <Input
                  value={row.tracking}
                  onChange={(e) =>
                    setManualMissing((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, tracking: e.target.value } : p)),
                    )
                  }
                  placeholder="N° de seguimiento (ej. 360003072157470)"
                  className="h-8 font-mono text-xs"
                  autoComplete="off"
                />
                <Input
                  value={row.destinatario}
                  onChange={(e) =>
                    setManualMissing((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, destinatario: e.target.value } : p)),
                    )
                  }
                  placeholder="Destinatario (opcional)"
                  className="h-8 text-xs"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setManualMissing([]);
                setManualUploadFiles(null);
              }}
              disabled={uploadingPdfs}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleConfirmManualMissing()} disabled={uploadingPdfs}>
              {uploadingPdfs ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cargar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === 'liberar'
                ? 'Liberar PDF a huérfano'
                : confirmAction?.kind === 'erronea'
                  ? 'Marcar como errónea'
                  : confirmAction?.kind === 'restaurar'
                    ? 'Devolver a huérfanos'
                    : 'Eliminar PDF'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === 'liberar'
                ? `Se desvincula el seguimiento ${confirmAction.row.tracking} del pedido. El PDF queda disponible como huérfano.`
                : confirmAction?.kind === 'erronea'
                  ? `La etiqueta ${confirmAction.row.tracking} deja de aparecer en Huérfanos. El PDF se conserva y podés asignarla después desde Erróneas.`
                  : confirmAction?.kind === 'restaurar'
                    ? `La etiqueta ${confirmAction.row.tracking} vuelve a la lista de huérfanos.`
                    : `Se elimina permanentemente la etiqueta ${confirmAction?.row.tracking ?? ''}.`}
            </DialogDescription>
          </DialogHeader>

          {needsPedidoDestino ? (
            <div className="space-y-3 py-1">
              <p className="text-sm font-medium">¿Qué hacer con el pedido?</p>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 has-[:checked]:border-foreground/40 has-[:checked]:bg-muted/40">
                <input
                  type="radio"
                  name="pedido-destino"
                  className="mt-0.5"
                  checked={pedidoAccion === 'sin_envio'}
                  onChange={() => setPedidoAccion('sin_envio')}
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">Sin envío</span>
                  <span className="block text-xs text-muted-foreground">
                    Queda disponible para asignarle otro PDF de Andreani.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 has-[:checked]:border-foreground/40 has-[:checked]:bg-muted/40">
                <input
                  type="radio"
                  name="pedido-destino"
                  className="mt-0.5"
                  checked={pedidoAccion === 'seguimiento_enviado'}
                  onChange={() => setPedidoAccion('seguimiento_enviado')}
                />
                <span className="text-sm leading-snug">
                  <span className="font-medium">Seguimiento enviado</span>
                  <span className="block text-xs text-muted-foreground">
                    Cierra el envío. Podés cargar un número manual o dejarlo en blanco.
                  </span>
                </span>
              </label>
              {pedidoAccion === 'seguimiento_enviado' ? (
                <div className="space-y-1.5 pl-6">
                  <label className="text-xs text-muted-foreground" htmlFor="seguimiento-manual">
                    Número de seguimiento (opcional)
                  </label>
                  <Input
                    id="seguimiento-manual"
                    value={seguimientoManual}
                    onChange={(e) => setSeguimientoManual(e.target.value)}
                    placeholder="Dejar en blanco si no hay número"
                    className="h-8 text-xs"
                    autoComplete="off"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={confirmAction?.kind === 'eliminar' ? 'destructive' : 'default'}
              disabled={Boolean(actionBusyId)}
              onClick={() => void runConfirmAction()}
            >
              {actionBusyId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {confirmAction?.kind === 'liberar'
                ? 'Liberar'
                : confirmAction?.kind === 'erronea'
                  ? 'Marcar errónea'
                  : confirmAction?.kind === 'restaurar'
                    ? 'Devolver'
                    : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="sm:max-w-lg p-2">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview archivo" className="max-h-[70vh] w-full object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
