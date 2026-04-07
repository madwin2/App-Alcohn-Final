import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Order } from '@/lib/types/index';
import {
  normalizePersonName,
  parseTrackingPdf,
  TrackingPdfEntry,
} from '@/lib/utils/trackingPdfParser';

interface TrackingMatch {
  order: Order;
  trackingNumber: string;
  sourceName: string;
}

interface NameParts {
  full: string;
  tokens: string[];
  firstName: string;
  lastName: string;
}

interface UploadTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onApply: (matches: TrackingMatch[]) => Promise<void>;
}

export function UploadTrackingDialog({
  open,
  onOpenChange,
  orders,
  onApply,
}: UploadTrackingDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [fileName, setFileName] = useState<string>('');
  const [entries, setEntries] = useState<TrackingPdfEntry[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const candidateOrders = useMemo(
    () =>
      orders.filter((order) => {
        const state = order.items[0]?.shippingState;
        return state !== 'DESPACHADO' && state !== 'SEGUIMIENTO_ENVIADO';
      }),
    [orders]
  );

  const toNameParts = (value: string): NameParts => {
    const full = normalizePersonName(value);
    const tokens = full.split(' ').filter(Boolean);
    const firstName = tokens[0] || '';
    const lastName = tokens[tokens.length - 1] || '';
    return { full, tokens, firstName, lastName };
  };

  const { exactMatches, ambiguous, unmatched } = useMemo(() => {
    const byName = new Map<string, Order[]>();
    const orderNameParts = new Map<string, NameParts>();

    for (const order of candidateOrders) {
      const key = normalizePersonName(`${order.customer.firstName} ${order.customer.lastName}`);
      const existing = byName.get(key) || [];
      existing.push(order);
      byName.set(key, existing);
      orderNameParts.set(order.id, toNameParts(`${order.customer.firstName} ${order.customer.lastName}`));
    }

    const matches: TrackingMatch[] = [];
    const ambiguousRows: TrackingPdfEntry[] = [];
    const unmatchedRows: TrackingPdfEntry[] = [];

    for (const entry of entries) {
      const entryParts = toNameParts(entry.fullName);
      const key = entryParts.full;
      const candidates = byName.get(key) || [];
      if (candidates.length === 1) {
        matches.push({
          order: candidates[0],
          trackingNumber: entry.trackingNumber,
          sourceName: entry.fullName,
        });
      } else if (candidates.length > 1) {
        ambiguousRows.push(entry);
      } else {
        // Fallback: apellido igual + algún nombre del pedido contenido en nombres del PDF
        const fallbackCandidates = candidateOrders.filter((order) => {
          const orderParts = orderNameParts.get(order.id);
          if (!orderParts) return false;
          if (!orderParts.lastName || orderParts.lastName !== entryParts.lastName) return false;
          if (!orderParts.firstName) return false;
          return entryParts.tokens.includes(orderParts.firstName);
        });

        if (fallbackCandidates.length === 1) {
          matches.push({
            order: fallbackCandidates[0],
            trackingNumber: entry.trackingNumber,
            sourceName: entry.fullName,
          });
        } else if (fallbackCandidates.length > 1) {
          ambiguousRows.push(entry);
        } else {
          unmatchedRows.push(entry);
        }
      }
    }

    return { exactMatches: matches, ambiguous: ambiguousRows, unmatched: unmatchedRows };
  }, [candidateOrders, entries]);

  const resetState = () => {
    setFileName('');
    setEntries([]);
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
      const parsed = await parseTrackingPdf(file);
      setEntries(parsed);
      toast({
        title: 'PDF procesado',
        description: `Se detectaron ${parsed.length} registros de seguimiento.`,
      });
    } catch (error) {
      setEntries([]);
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
    if (exactMatches.length === 0) {
      toast({
        title: 'Sin coincidencias',
        description: 'No hay coincidencias exactas para aplicar.',
        variant: 'destructive',
      });
      return;
    }

    setIsApplying(true);
    try {
      await onApply(exactMatches);
      toast({
        title: 'Seguimientos actualizados',
        description: `Se actualizaron ${exactMatches.length} pedidos.`,
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
            Cargá el PDF de etiquetas. Se tomará el número después de TN y se hará match por
            nombre y apellido con pedidos pendientes de despacho.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
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

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded border p-3">Detectados: {entries.length}</div>
            <div className="rounded border p-3">Coincidencia exacta: {exactMatches.length}</div>
            <div className="rounded border p-3">Sin aplicar: {ambiguous.length + unmatched.length}</div>
          </div>

          {exactMatches.length > 0 && (
            <div className="rounded border p-3 space-y-2">
              <p className="text-sm font-medium">Se van a actualizar</p>
              <div className="max-h-48 overflow-auto space-y-1 text-xs">
                {exactMatches.map((match) => (
                  <div key={`${match.order.id}-${match.trackingNumber}`} className="flex justify-between gap-2">
                    <span>
                      {match.order.customer.firstName} {match.order.customer.lastName}
                    </span>
                    <span className="font-mono">{match.trackingNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="rounded border p-3 space-y-1 text-xs">
              <p className="text-sm font-medium">Sin match en pedidos</p>
              {unmatched.slice(0, 8).map((entry, idx) => (
                <div key={`${entry.trackingNumber}-${idx}`}>
                  {entry.fullName} - <span className="font-mono">{entry.trackingNumber}</span>
                </div>
              ))}
              {unmatched.length > 8 && <div>...y {unmatched.length - 8} más</div>}
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

          <div className="flex justify-end">
            <Button onClick={applyMatches} disabled={isApplying || isParsing || exactMatches.length === 0}>
              {isApplying ? 'Aplicando...' : 'Aplicar seguimientos'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
