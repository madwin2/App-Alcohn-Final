import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  fetchEnviosHistorialTimeline,
  type EnvioHistorialEntry,
  type EnvioHistorialKind,
} from '@/lib/supabase/services/enviosHistorial.service';
import { formatDateTime } from '@/lib/utils/format';
import type { EnviosCarrierFilter } from './EnviosHeader';

interface HistorialEnviosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_OPTIONS: { value: EnvioHistorialKind | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos los eventos' },
  { value: 'datos_cargados', label: 'Carga de datos' },
  { value: 'csv_generado', label: 'CSV generado' },
  { value: 'etiqueta_descargada', label: 'Etiqueta descargada' },
  { value: 'estado_envio', label: 'Cambios de estado' },
];

const CARRIER_OPTIONS: { value: EnviosCarrierFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos los transportistas' },
  { value: 'CORREO_ARGENTINO', label: 'Correo Argentino' },
  { value: 'ANDREANI', label: 'Andreani' },
  { value: 'VIA_CARGO', label: 'Via Cargo' },
];

export function HistorialEnviosDialog({ open, onOpenChange }: HistorialEnviosDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<EnvioHistorialEntry[]>([]);
  const [search, setSearch] = useState('');
  const [carrier, setCarrier] = useState<EnviosCarrierFilter>('ALL');
  const [kind, setKind] = useState<EnvioHistorialKind | 'ALL'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEnviosHistorialTimeline({
        search,
        carrier,
        kind,
        fromDate: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : null,
        toDate: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
        limit: 250,
      });
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Historial de envíos</DialogTitle>
          <DialogDescription>
            Carga de datos, impresión/descarga de etiquetas y cambios de estado de envío.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="historial-search">Buscar</Label>
            <Input
              id="historial-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, orden o evento..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Transportista</Label>
            <Select value={carrier} onValueChange={(v) => setCarrier(v as EnviosCarrierFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARRIER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as EnvioHistorialKind | 'ALL')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="historial-from">Desde</Label>
            <Input
              id="historial-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="historial-to">Hasta</Label>
            <Input
              id="historial-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="button" onClick={() => void load()} disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Actualizar
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {loading && !entries.length ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando historial...
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : entries.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No hay eventos con estos filtros.
            </p>
          ) : (
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {[entry.customerName, entry.carrier, entry.detail]
                          .filter(Boolean)
                          .join(' · ') || `Orden ${entry.ordenId.slice(0, 8)}…`}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
