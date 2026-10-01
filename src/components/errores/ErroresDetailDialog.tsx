import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StorageUrlImage } from '@/components/shared/StorageUrlImage';
import { ImagePreviewLightbox } from '@/components/shared/ImagePreviewLightbox';
import { useImagePreviewLightbox } from '@/hooks/useImagePreviewLightbox';
import { downloadFile, sanitizeDownloadFilename } from '@/lib/supabase/services/storage.service';
import {
  updateErrorDescripcion,
  updateErrorMotivo,
  type ErrorEventoRow,
} from '@/lib/supabase/services/errores.service';
import {
  REHACER_MOTIVO_LABELS,
  REHACER_MOTIVOS,
  labelRehacerMotivo,
  type RehacerMotivo,
} from '@/lib/supabase/services/rehacer.service';
import { formatDateTime } from '@/lib/utils/format';
import { resolveStorageDisplayUrl } from '@/lib/utils/storageUrlUtils';
import { storageFileKindFromUrl } from '@/lib/utils/storageFileKind';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';

function formatMedidaCm(value: string | null): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `${n} cm`;
}

function formatMedidaMm(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value} mm`;
}

function SnapshotThumb({
  url,
  label,
  onPreview,
  onDownload,
}: {
  url: string;
  label: string;
  onPreview: (url: string, title: string) => void;
  onDownload: (url: string, label: string) => void;
}) {
  const kind = storageFileKindFromUrl(url);
  const isImage = kind === 'image' || kind === 'svg';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={`Descargar ${label}`}
          onClick={() => onDownload(url, label)}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      {isImage ? (
        <button
          type="button"
          className="block w-full overflow-hidden rounded-md border bg-white p-1"
          onClick={() => onPreview(url, label)}
        >
          <StorageUrlImage url={url} alt={label} className="mx-auto max-h-36 object-contain" />
        </button>
      ) : (
        <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 text-xs">
          <span className="text-muted-foreground">{kind.toUpperCase()}</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => onDownload(url, label)}>
            Descargar
          </Button>
        </div>
      )}
    </div>
  );
}

function isSelectableMotivo(motivo: string): motivo is RehacerMotivo {
  return (REHACER_MOTIVOS as readonly string[]).includes(motivo);
}

export function ErroresDetailDialog({
  row,
  open,
  onOpenChange,
  onUpdated,
}: {
  row: ErrorEventoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (next: ErrorEventoRow) => void;
}) {
  const { toast } = useToast();
  const { preview, openPreview, closePreview } = useImagePreviewLightbox();
  const [descripcionDraft, setDescripcionDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [savingMotivo, setSavingMotivo] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setDescripcionDraft(row.descripcion ?? '');
  }, [open, row?.id, row?.descripcion]);

  const dirtyDesc = useMemo(() => {
    const current = (row?.descripcion ?? '').trim();
    return descripcionDraft.trim() !== current;
  }, [descripcionDraft, row?.descripcion]);

  const handlePreview = async (url: string, title: string) => {
    try {
      const display = (await resolveStorageDisplayUrl(url)) || url;
      openPreview(display, title);
    } catch {
      openPreview(url, title);
    }
  };

  const handleDownload = async (url: string, label: string) => {
    try {
      const ext = url.split('?')[0]?.split('.').pop() || 'bin';
      const name = sanitizeDownloadFilename(
        `${label}-${row?.disenoNombre || 'error'}.${ext}`.replace(/\s+/g, '_'),
      );
      await downloadFile(url, name);
    } catch (err) {
      toast({
        title: 'No se pudo descargar',
        description: err instanceof Error ? err.message : 'Error al bajar el archivo',
        variant: 'destructive',
      });
    }
  };

  const handleSaveDescripcion = async () => {
    if (!row || !dirtyDesc) return;
    setSavingDesc(true);
    try {
      const saved = await updateErrorDescripcion(row.id, descripcionDraft);
      const next: ErrorEventoRow = { ...row, descripcion: saved };
      onUpdated?.(next);
      toast({
        title: saved ? 'Descripción guardada' : 'Descripción vaciada',
      });
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error al actualizar',
        variant: 'destructive',
      });
    } finally {
      setSavingDesc(false);
    }
  };

  const handleChangeMotivo = async (nextMotivo: RehacerMotivo) => {
    if (!row || nextMotivo === row.motivo) return;
    setSavingMotivo(true);
    try {
      await updateErrorMotivo(row.id, nextMotivo);
      const next: ErrorEventoRow = {
        ...row,
        motivo: nextMotivo,
        motivoLabel: labelRehacerMotivo(nextMotivo),
      };
      onUpdated?.(next);
      toast({ title: 'Motivo actualizado', description: labelRehacerMotivo(nextMotivo) });
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el motivo',
        description: err instanceof Error ? err.message : 'Error al actualizar',
        variant: 'destructive',
      });
    } finally {
      setSavingMotivo(false);
    }
  };

  const pedidoMm =
    row &&
    formatMedidaMm(row.anchoFabricacionMmPrevio) &&
    formatMedidaMm(row.largoFabricacionMmPrevio)
      ? `${formatMedidaMm(row.anchoFabricacionMmPrevio)} × ${formatMedidaMm(row.largoFabricacionMmPrevio)}`
      : null;

  const pedidoCm =
    row && formatMedidaCm(row.anchoRealPrevio) && formatMedidaCm(row.largoRealPrevio)
      ? `${formatMedidaCm(row.anchoRealPrevio)} × ${formatMedidaCm(row.largoRealPrevio)}`
      : null;

  const snapshots = row
    ? (
        [
          { url: row.archivoBaseSnapshot, label: 'Base' },
          { url: row.archivoBaseMejoradoSnapshot, label: 'Base mejorada' },
          { url: row.archivoVectorSnapshot, label: 'Vector' },
          { url: row.fotoSelloPrevio, label: 'Foto previa' },
        ] as Array<{ url: string | null; label: string }>
      ).filter((s): s is { url: string; label: string } => Boolean(s.url))
    : [];

  const motivoSelectValue = row && isSelectableMotivo(row.motivo) ? row.motivo : undefined;
  const isLegacyMotivo = Boolean(row && !isSelectableMotivo(row.motivo));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {row ? (
            <>
              <DialogHeader>
                <DialogTitle>{row.disenoNombre}</DialogTitle>
                <DialogDescription>
                  {row.clienteNombre ? `${row.clienteNombre} · ` : ''}
                  {formatDateTime(row.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="space-y-1.5">
                  <Label htmlFor="error-motivo">Tipo de error</Label>
                  <Select
                    value={motivoSelectValue}
                    onValueChange={(v) => void handleChangeMotivo(v as RehacerMotivo)}
                    disabled={savingMotivo}
                  >
                    <SelectTrigger
                      id="error-motivo"
                      className={cn(
                        'border-white/10 bg-white/[0.03]',
                        isLegacyMotivo && 'border-amber-500/30',
                      )}
                    >
                      <SelectValue
                        placeholder={
                          isLegacyMotivo
                            ? `${row.motivoLabel} — elegí el tipo nuevo`
                            : 'Elegí un motivo…'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {REHACER_MOTIVOS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {REHACER_MOTIVO_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isLegacyMotivo ? (
                    <p className="text-[11px] text-amber-200/80">
                      Este caso tiene un motivo viejo (“{row.motivoLabel}”). Cambialo a uno de la
                      lista nueva.
                    </p>
                  ) : null}
                  {savingMotivo ? (
                    <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Guardando motivo…
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="error-descripcion">
                    Descripción del error
                    {!row.descripcion?.trim() ? (
                      <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-400">
                        (faltaba completar)
                      </span>
                    ) : null}
                  </Label>
                  <Textarea
                    id="error-descripcion"
                    value={descripcionDraft}
                    onChange={(e) => setDescripcionDraft(e.target.value)}
                    placeholder="Qué se vio mal, en qué parte del vector/medida, qué hay que corregir…"
                    className="min-h-[96px] text-sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Podés completar o corregir la nota después de marcar Rehacer.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!dirtyDesc || savingDesc}
                      onClick={() => void handleSaveDescripcion()}
                    >
                      {savingDesc ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Guardar
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Marcado por" value={row.createdByNombre || '—'} />
                  <Info label="Estado fabricación previo" value={row.fabricacionEstadoPrevio || '—'} />
                  <Info label="Estado venta previo" value={row.ventaEstadoPrevio || '—'} />
                  <Info label="Medida pedida" value={pedidoCm || '—'} />
                  <Info label="Medida fabricación" value={pedidoMm || '—'} />
                  <Info
                    label="Programa"
                    value={
                      row.programaNombrePrevio ||
                      (row.programaIdPrevio ? `${row.programaIdPrevio.slice(0, 8)}…` : '—')
                    }
                  />
                  {row.cobroMonto != null ? (
                    <Info
                      label="Cobro adicional"
                      value={`$${row.cobroMonto.toLocaleString('es-AR')}${
                        row.cobroConcepto ? ` · ${row.cobroConcepto}` : ''
                      }`}
                    />
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Archivos al momento del error
                  </p>
                  {snapshots.length === 0 ? (
                    <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                      Este rehacer no tiene archivos congelados (suele pasar en eventos anteriores a
                      esta función).
                    </p>
                  ) : (
                    <>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Copias congeladas: aunque después se borre o reemplace el archivo del sello, acá
                        queda la versión que falló.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {snapshots.map((s) => (
                          <SnapshotThumb
                            key={s.label}
                            url={s.url}
                            label={s.label}
                            onPreview={handlePreview}
                            onDownload={handleDownload}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/pedidos">
                      Ir a Pedidos
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ImagePreviewLightbox
        src={preview?.src ?? null}
        alt={preview?.alt}
        onClose={closePreview}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
