import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order } from '@/lib/types/index';
import { supabase } from '@/lib/supabase/client';
import {
  normalizePersonName,
  parseTrackingPdf,
  TrackingPdfEntry,
} from '@/lib/utils/trackingPdfParser';
import { parseAndreaniTrackingPdf } from '@/lib/utils/andreaniTrackingPdfParser';
import { enrichShippingLabelsPdf } from '@/lib/utils/enrichShippingLabelsPdf';
import { enrichAndreaniLabelsPdf } from '@/lib/utils/enrichAndreaniLabelsPdf';

export type TrackingLabelSource = 'CORREO_ARGENTINO' | 'ANDREANI';

interface TrackingMatch {
  order: Order;
  trackingNumber: string;
  sourceName: string;
}

interface ApplyTrackingError {
  match: TrackingMatch;
  reason: string;
}

interface ApplyTrackingResult {
  appliedMatches: TrackingMatch[];
  failed: ApplyTrackingError[];
}

interface AlreadyAssignedMatch {
  order: Order;
  sourceName: string;
  incomingTrackingNumber: string;
  existingTrackingNumber: string;
}

interface NameParts {
  full: string;
  tokens: string[];
  firstName: string;
  lastName: string;
}

const DESIGN_LABEL_MAX_LENGTH = 64;
const UNASSIGNED_TRACKING_VALUE = '__unassigned__';

const getOrderMatchName = (
  order: Order,
  shippingNamesByOrderId: Map<string, { firstName: string; lastName: string }>
) => {
  const shipping = shippingNamesByOrderId.get(order.id);
  if (shipping) {
    return `${shipping.firstName} ${shipping.lastName}`.trim();
  }
  return `${order.customer.firstName} ${order.customer.lastName}`.trim();
};

const getOrderDesignLabel = (order: Order) => {
  const designNames = order.items
    .map((item) => item.designName?.trim() || 'Sin diseño')
    .filter(Boolean);

  if (designNames.length <= 1) {
    return designNames[0] || 'Sin diseño';
  }

  const firstDesign = designNames[0];
  let label = firstDesign;
  let index = 1;

  while (index < designNames.length) {
    const nextCandidate = `${label}, ${designNames[index]}`;
    if (nextCandidate.length > DESIGN_LABEL_MAX_LENGTH) break;
    label = nextCandidate;
    index += 1;
  }

  return index < designNames.length ? `${label}...` : label;
};

interface UploadTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onApply: (
    matches: TrackingMatch[],
    meta: { labelSource: TrackingLabelSource },
  ) => Promise<ApplyTrackingResult>;
}

export function UploadTrackingDialog({
  open,
  onOpenChange,
  orders,
  onApply,
}: UploadTrackingDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [labelSource, setLabelSource] = useState<TrackingLabelSource>('CORREO_ARGENTINO');
  const [fileName, setFileName] = useState<string>('');
  const [entries, setEntries] = useState<TrackingPdfEntry[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [shippingNamesByOrderId, setShippingNamesByOrderId] = useState<
    Map<string, { firstName: string; lastName: string }>
  >(new Map());
  const [isLoadingShippingNames, setIsLoadingShippingNames] = useState(false);

  useEffect(() => {
    if (!open) {
      setShippingNamesByOrderId(new Map());
      return;
    }

    const addressIds = [...new Set(orders.map((order) => order.direccionId).filter(Boolean))] as string[];
    if (!addressIds.length) {
      setShippingNamesByOrderId(new Map());
      return;
    }

    let cancelled = false;
    setIsLoadingShippingNames(true);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('direcciones')
          .select('id,nombre,apellido')
          .in('id', addressIds);

        if (error) throw error;

        const addressById = new Map((data ?? []).map((address) => [address.id, address]));
        const nextMap = new Map<string, { firstName: string; lastName: string }>();

        for (const order of orders) {
          if (!order.direccionId) continue;
          const address = addressById.get(order.direccionId);
          if (!address) continue;
          nextMap.set(order.id, {
            firstName: address.nombre?.trim() || order.customer.firstName,
            lastName: address.apellido?.trim() || order.customer.lastName,
          });
        }

        if (!cancelled) setShippingNamesByOrderId(nextMap);
      } catch {
        if (!cancelled) setShippingNamesByOrderId(new Map());
      } finally {
        if (!cancelled) setIsLoadingShippingNames(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orders]);

  const candidateOrders = useMemo(
    () =>
      orders.filter((order) => {
        const state = order.items[0]?.shippingState;
        return state !== 'DESPACHADO' && state !== 'SEGUIMIENTO_ENVIADO';
      }),
    [orders]
  );

  const manualCandidateOrders = useMemo(
    () =>
      orders.filter((order) => {
        const hasTracking = Boolean(order.shipping?.trackingNumber);
        const shippingState = order.items[0]?.shippingState;
        const shippingOk = shippingState !== 'DESPACHADO' && shippingState !== 'SEGUIMIENTO_ENVIADO';
        const fabricationDone = order.items.length > 0 && order.items.every((item) => item.fabricationState === 'HECHO');
        const saleOk =
          order.items.length > 0 &&
          order.items.every((item) => item.saleState === 'FOTO_ENVIADA' || item.saleState === 'TRANSFERIDO');
        return !hasTracking && shippingOk && fabricationDone && saleOk;
      }).sort((a, b) =>
        getOrderDesignLabel(a).localeCompare(getOrderDesignLabel(b), 'es', { sensitivity: 'base' })
      ),
    [orders]
  );

  const toNameParts = (value: string): NameParts => {
    const full = normalizePersonName(value);
    const tokens = full.split(' ').filter(Boolean);
    const firstName = tokens[0] || '';
    const lastName = tokens[tokens.length - 1] || '';
    return { full, tokens, firstName, lastName };
  };

  const isAlreadyAssignedOrder = (order: Order): boolean => {
    const state = order.items[0]?.shippingState;
    return Boolean(order.shipping?.trackingNumber) || state === 'DESPACHADO' || state === 'SEGUIMIENTO_ENVIADO';
  };

  const { exactMatches, ambiguous, unmatched, alreadyAssigned } = useMemo(() => {
    const byName = new Map<string, Order[]>();
    const orderNameParts = new Map<string, NameParts>();

    for (const order of orders) {
      const matchName = getOrderMatchName(order, shippingNamesByOrderId);
      const key = normalizePersonName(matchName);
      const existing = byName.get(key) || [];
      existing.push(order);
      byName.set(key, existing);
      orderNameParts.set(order.id, toNameParts(matchName));
    }

    const matches: TrackingMatch[] = [];
    const alreadyAssignedRows: AlreadyAssignedMatch[] = [];
    const ambiguousRows: TrackingPdfEntry[] = [];
    const unmatchedRows: TrackingPdfEntry[] = [];

    for (const entry of entries) {
      const entryParts = toNameParts(entry.fullName);
      const key = entryParts.full;
      const candidates = byName.get(key) || [];
      if (candidates.length === 1) {
        const matchedOrder = candidates[0];
        if (isAlreadyAssignedOrder(matchedOrder)) {
          alreadyAssignedRows.push({
            order: matchedOrder,
            sourceName: entry.fullName,
            incomingTrackingNumber: entry.trackingNumber,
            existingTrackingNumber: matchedOrder.shipping?.trackingNumber || '(sin número)',
          });
        } else {
          matches.push({
            order: matchedOrder,
            trackingNumber: entry.trackingNumber,
            sourceName: entry.fullName,
          });
        }
      } else if (candidates.length > 1) {
        const actionableCandidates = candidates.filter((order) => !isAlreadyAssignedOrder(order));
        if (actionableCandidates.length === 1) {
          matches.push({
            order: actionableCandidates[0],
            trackingNumber: entry.trackingNumber,
            sourceName: entry.fullName,
          });
        } else if (actionableCandidates.length === 0) {
          const alreadyOrder = candidates[0];
          alreadyAssignedRows.push({
            order: alreadyOrder,
            sourceName: entry.fullName,
            incomingTrackingNumber: entry.trackingNumber,
            existingTrackingNumber: alreadyOrder.shipping?.trackingNumber || '(sin número)',
          });
        } else {
          ambiguousRows.push(entry);
        }
      } else {
        // Fallback: apellido igual + algún nombre del pedido contenido en nombres del PDF
        const fallbackCandidates = orders.filter((order) => {
          const orderParts = orderNameParts.get(order.id);
          if (!orderParts) return false;
          if (!orderParts.lastName || orderParts.lastName !== entryParts.lastName) return false;
          if (!orderParts.firstName) return false;
          return entryParts.tokens.includes(orderParts.firstName);
        });

        if (fallbackCandidates.length === 1) {
          const matchedOrder = fallbackCandidates[0];
          if (isAlreadyAssignedOrder(matchedOrder)) {
            alreadyAssignedRows.push({
              order: matchedOrder,
              sourceName: entry.fullName,
              incomingTrackingNumber: entry.trackingNumber,
              existingTrackingNumber: matchedOrder.shipping?.trackingNumber || '(sin número)',
            });
          } else {
            matches.push({
              order: matchedOrder,
              trackingNumber: entry.trackingNumber,
              sourceName: entry.fullName,
            });
          }
        } else if (fallbackCandidates.length > 1) {
          const actionableCandidates = fallbackCandidates.filter((order) => !isAlreadyAssignedOrder(order));
          if (actionableCandidates.length === 1) {
            matches.push({
              order: actionableCandidates[0],
              trackingNumber: entry.trackingNumber,
              sourceName: entry.fullName,
            });
          } else if (actionableCandidates.length === 0) {
            const alreadyOrder = fallbackCandidates[0];
            alreadyAssignedRows.push({
              order: alreadyOrder,
              sourceName: entry.fullName,
              incomingTrackingNumber: entry.trackingNumber,
              existingTrackingNumber: alreadyOrder.shipping?.trackingNumber || '(sin número)',
            });
          } else {
            ambiguousRows.push(entry);
          }
        } else {
          unmatchedRows.push(entry);
        }
      }
    }

    return {
      exactMatches: matches,
      ambiguous: ambiguousRows,
      unmatched: unmatchedRows,
      alreadyAssigned: alreadyAssignedRows,
    };
  }, [orders, entries, shippingNamesByOrderId]);

  const entryKey = (entry: TrackingPdfEntry) =>
    `${entry.pageNumber}::${entry.fullName}::${entry.trackingNumber}`;

  const allMatches = useMemo((): TrackingMatch[] => {
    const manualMatches: TrackingMatch[] = [];
    for (const entry of unmatched) {
      const selectedOrderId = manualAssignments[entryKey(entry)];
      if (!selectedOrderId || selectedOrderId === UNASSIGNED_TRACKING_VALUE) continue;
      const order = manualCandidateOrders.find((c) => c.id === selectedOrderId);
      if (!order) continue;
      manualMatches.push({
        order,
        trackingNumber: entry.trackingNumber,
        sourceName: entry.fullName,
      });
    }
    return [...exactMatches, ...manualMatches];
  }, [exactMatches, unmatched, manualAssignments, manualCandidateOrders]);

  const resetState = () => {
    setFileName('');
    setEntries([]);
    setManualAssignments({});
    setPdfFile(null);
  };

  const downloadEnrichedPdf = async (showSuccessToast = true, matchesToUse: TrackingMatch[] = allMatches) => {
    if (!pdfFile) {
      throw new Error('Necesitás el PDF cargado.');
    }

    const bytes = await pdfFile.arrayBuffer();
    const map = new Map<string, Order>();
    for (const match of matchesToUse) {
      map.set(match.trackingNumber, match.order);
    }

    const out =
      labelSource === 'ANDREANI'
        ? await enrichAndreaniLabelsPdf(bytes, map)
        : await enrichShippingLabelsPdf(bytes, map);
    if (!out?.length) {
      throw new Error('El PDF de salida quedó vacío.');
    }
    const blob = new Blob([out as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas-con-previews-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    if (showSuccessToast) {
      toast({
        title: 'PDF generado',
        description:
          labelSource === 'ANDREANI'
            ? matchesToUse.length
              ? 'Etiquetas Andreani 100×152 mm con logos e info del pedido en el pie.'
              : 'Etiquetas Andreani 100×152 mm (sin pedidos emparejados — solo adaptación visual).'
            : 'Etiquetas 100×152 mm: sin franja PAQ/Correo arriba; pedido y logos dentro del recuadro inferior de la etiqueta.',
      });
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: 'Archivo inválido',
        description: 'Seleccioná un archivo PDF de etiquetas.',
        variant: 'destructive',
      });
      return;
    }

    setIsParsing(true);
    setFileName(file.name);
    try {
      const parsed =
        labelSource === 'ANDREANI'
          ? await parseAndreaniTrackingPdf(file)
          : await parseTrackingPdf(file);
      setEntries(parsed);
      setPdfFile(file);
      setManualAssignments({});
      toast({
        title: 'PDF procesado',
        description: `Se detectaron ${parsed.length} registros de seguimiento (${labelSource === 'ANDREANI' ? 'Andreani' : 'Correo Argentino'}).`,
      });
    } catch (error) {
      setEntries([]);
      setPdfFile(null);
      toast({
        title: 'Error al procesar PDF',
        description: error instanceof Error ? error.message : 'No se pudo leer el archivo.',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applyMatches = async () => {
    if (allMatches.length === 0) {
      toast({
        title: 'Sin coincidencias',
        description: 'No hay coincidencias para aplicar.',
        variant: 'destructive',
      });
      return;
    }

    const duplicateOrderIds = allMatches
      .map((match) => match.order.id)
      .filter((id, index, arr) => arr.indexOf(id) !== index);
    if (duplicateOrderIds.length > 0) {
      toast({
        title: 'Asignación duplicada',
        description: 'Hay más de un seguimiento asignado al mismo pedido. Revisá las selecciones manuales.',
        variant: 'destructive',
      });
      return;
    }

    setIsApplying(true);
    try {
      const result = await onApply(allMatches, { labelSource });
      const appliedMatches = result.appliedMatches || [];
      const failedMatches = result.failed || [];
      if (pdfFile && appliedMatches.length > 0) {
        try {
          await downloadEnrichedPdf(false, appliedMatches);
        } catch (pdfError) {
          toast({
            title: 'Seguimientos actualizados',
            description:
              pdfError instanceof Error
                ? `Se actualizaron ${appliedMatches.length} pedidos, pero no se pudo descargar el PDF: ${pdfError.message}`
                : `Se actualizaron ${appliedMatches.length} pedidos, pero no se pudo descargar el PDF.`,
          });
          resetState();
          onOpenChange(false);
          return;
        }
      }
      const skippedUnassigned = unmatched.filter((entry) => {
        const selected = manualAssignments[entryKey(entry)];
        return !selected || selected === UNASSIGNED_TRACKING_VALUE;
      }).length;
      const skippedSuffix =
        skippedUnassigned > 0
          ? ` Se omitieron ${skippedUnassigned} seguimiento${skippedUnassigned === 1 ? '' : 's'} sin asignar.`
          : '';
      toast({
        title: failedMatches.length > 0 ? 'Seguimientos aplicados con incidencias' : 'Seguimientos actualizados',
        description:
          failedMatches.length > 0
            ? `Se actualizaron ${appliedMatches.length} pedidos y ${failedMatches.length} quedaron con error.${skippedSuffix}`
            : pdfFile
              ? `Se actualizaron ${appliedMatches.length} pedidos y se descargó el PDF automáticamente.${skippedSuffix}`
              : `Se actualizaron ${appliedMatches.length} pedidos.${skippedSuffix}`,
        ...(failedMatches.length > 0 ? { variant: 'destructive' as const } : {}),
      });
      resetState();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error al aplicar',
        description: error instanceof Error ? error.message : 'No se pudieron actualizar los pedidos.',
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleDownloadEnrichedPdf = async () => {
    if (!pdfFile) {
      toast({
        title: 'No se puede generar el PDF',
        description: 'Necesitás el PDF cargado.',
        variant: 'destructive',
      });
      return;
    }
    if (labelSource === 'CORREO_ARGENTINO' && allMatches.length === 0) {
      toast({
        title: 'No se puede generar el PDF',
        description: 'Para Correo Argentino hace falta al menos un pedido emparejado.',
        variant: 'destructive',
      });
      return;
    }

    setIsEnriching(true);
    try {
      await downloadEnrichedPdf(true, allMatches);
    } catch (error) {
      toast({
        title: 'Error al enriquecer PDF',
        description:
          error instanceof Error ? error.message : 'Revisá que las URLs de preview permitan descarga (CORS).',
        variant: 'destructive',
      });
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetState();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subir seguimientos</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Elegí el origen del PDF y cargá las etiquetas. Se hace match por nombre con pedidos
            pendientes de despacho. Se genera una copia 100×152 mm con logos e info del pedido.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Origen del PDF</p>
              <Select
                value={labelSource}
                onValueChange={(v) => {
                  setLabelSource(v as TrackingLabelSource);
                  resetState();
                }}
                disabled={isParsing || isApplying}
              >
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORREO_ARGENTINO">Correo Argentino</SelectItem>
                  <SelectItem value="ANDREANI">Andreani</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="tracking-upload"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isParsing || isApplying}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {isParsing ? 'Procesando...' : 'Seleccionar PDF'}
              </Button>
              {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-sm">
            <div className="rounded border p-3">Detectados: {entries.length}</div>
            <div className="rounded border p-3">Coincidencia exacta: {exactMatches.length}</div>
            <div className="rounded border p-3">Ya asignado: {alreadyAssigned.length}</div>
            <div className="rounded border p-3">Sin aplicar: {ambiguous.length + unmatched.length}</div>
          </div>

          {exactMatches.length > 0 && (
            <div className="rounded border p-3 space-y-2">
              <p className="text-sm font-medium">Se van a actualizar</p>
              <div className="max-h-48 overflow-auto space-y-1 text-xs">
                {exactMatches.map((match) => {
                  const matchName = getOrderMatchName(match.order, shippingNamesByOrderId);
                  const customerName =
                    `${match.order.customer.firstName} ${match.order.customer.lastName}`.trim();
                  return (
                    <div key={`${match.order.id}-${match.trackingNumber}`} className="flex justify-between gap-2">
                      <span>
                        {matchName}
                        {shippingNamesByOrderId.has(match.order.id) && matchName !== customerName && (
                          <span className="text-muted-foreground"> (cliente: {customerName})</span>
                        )}
                      </span>
                      <span className="font-mono">{match.trackingNumber}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="rounded border p-3 space-y-2 text-xs">
              <p className="text-sm font-medium">Sin match en pedidos (asignación opcional)</p>
              {unmatched.slice(0, 12).map((entry, idx) => (
                <div key={`${entry.trackingNumber}-${idx}`} className="grid grid-cols-2 gap-2 items-center">
                  <div>
                    {entry.fullName} - <span className="font-mono">{entry.trackingNumber}</span>
                  </div>
                  <Select
                    value={manualAssignments[entryKey(entry)] || UNASSIGNED_TRACKING_VALUE}
                    onValueChange={(value) =>
                      setManualAssignments((prev) => {
                        const next = { ...prev };
                        const key = entryKey(entry);
                        if (value === UNASSIGNED_TRACKING_VALUE) {
                          delete next[key];
                        } else {
                          next[key] = value;
                        }
                        return next;
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Dejar sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_TRACKING_VALUE}>Dejar sin asignar</SelectItem>
                      {manualCandidateOrders.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No hay pedidos elegibles
                        </SelectItem>
                      ) : (
                        manualCandidateOrders.map((order) => (
                          <SelectItem key={order.id} value={order.id}>
                            {getOrderDesignLabel(order)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {unmatched.length > 12 && <div>...y {unmatched.length - 12} más</div>}
              <p className="text-[11px] text-muted-foreground">
                Podés dejarlos sin asignar: se aplican igual los seguimientos que ya matchearon.
                Solo se muestran pedidos con fabricación HECHO, venta FOTO ENVIADA o TRANSFERIDO,
                sin seguimiento y con envío distinto de DESPACHADO / SEGUIMIENTO_ENVIADO.
              </p>
            </div>
          )}

          {ambiguous.length > 0 && (
            <div className="rounded border p-3 space-y-1 text-xs">
              <p className="text-sm font-medium">Ambiguos (múltiples pedidos con mismo nombre)</p>
              {ambiguous.slice(0, 8).map((entry, idx) => (
                <div key={`${entry.trackingNumber}-${idx}`}>
                  {entry.fullName} - <span className="font-mono">{entry.trackingNumber}</span>
                </div>
              ))}
              {ambiguous.length > 8 && <div>...y {ambiguous.length - 8} más</div>}
            </div>
          )}

          {alreadyAssigned.length > 0 && (
            <div className="rounded border p-3 space-y-1 text-xs">
              <p className="text-sm font-medium">Ya asignado (pedido con seguimiento existente)</p>
              {alreadyAssigned.slice(0, 10).map((row, idx) => {
                const matchName = getOrderMatchName(row.order, shippingNamesByOrderId);
                return (
                  <div key={`${row.order.id}-${row.incomingTrackingNumber}-${idx}`} className="space-y-0.5">
                    <div>
                      {matchName} ({row.sourceName})
                    </div>
                    <div className="text-muted-foreground">
                      Nuevo: <span className="font-mono">{row.incomingTrackingNumber}</span> | Actual:{' '}
                      <span className="font-mono">{row.existingTrackingNumber}</span>
                    </div>
                  </div>
                );
              })}
              {alreadyAssigned.length > 10 && <div>...y {alreadyAssigned.length - 10} más</div>}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleDownloadEnrichedPdf}
              disabled={
                isApplying ||
                isParsing ||
                isEnriching ||
                !pdfFile ||
                (labelSource === 'CORREO_ARGENTINO' && allMatches.length === 0)
              }
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isEnriching
                ? 'Generando...'
                : labelSource === 'ANDREANI' && allMatches.length === 0
                  ? 'Probar adaptación PDF'
                  : 'Descargar PDF con previews'}
            </Button>
            <Button
              onClick={applyMatches}
              disabled={isApplying || isParsing || isEnriching || isLoadingShippingNames}
            >
              {isApplying ? 'Aplicando...' : isLoadingShippingNames ? 'Cargando datos de envío...' : 'Aplicar seguimientos'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
