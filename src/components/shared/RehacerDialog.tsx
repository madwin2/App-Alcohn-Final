import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import {
  fetchRehacerContexto,
  fetchRehacerHistorialPorSello,
  registrarRehacer,
  REHACER_MOTIVOS,
  REHACER_MOTIVO_LABELS,
  type RehacerContexto,
  type RehacerMotivo,
} from '@/lib/supabase/services/rehacer.service';

interface RehacerDialogProps {
  open: boolean;
  selloIds: string[];
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}

function envioSeReinicia(estado: string | null): boolean {
  return Boolean(estado && estado !== 'Sin envio');
}

export function RehacerDialog({ open, selloIds, onOpenChange, onConfirmed }: RehacerDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contextos, setContextos] = useState<RehacerContexto[]>([]);
  const [historialCount, setHistorialCount] = useState(0);
  const [motivo, setMotivo] = useState<RehacerMotivo | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [cobrar, setCobrar] = useState(false);
  const [cobroMonto, setCobroMonto] = useState('');
  const [cobroConcepto, setCobroConcepto] = useState('');

  const selloIdsKey = selloIds.join(',');

  useEffect(() => {
    if (!open || !selloIdsKey) return;
    const ids = selloIdsKey.split(',').filter(Boolean);
    setMotivo('');
    setDescripcion('');
    setCobrar(false);
    setCobroMonto('');
    setCobroConcepto('');
    setHistorialCount(0);
    setLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchRehacerContexto(ids);
        if (cancelled) return;
        setContextos(next);
        if (ids.length === 1) {
          const hist = await fetchRehacerHistorialPorSello(ids[0]);
          if (!cancelled) setHistorialCount(hist.length);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn('Error cargando contexto de rehacer:', error);
        toast({
          title: 'No se pudo leer el ítem',
          description: error instanceof Error ? error.message : 'Revisá si corriste la migración.',
          variant: 'destructive',
        });
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // selloIdsKey cubre el lote; toast/onOpenChange no van en deps para no re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selloIdsKey]);

  const resumen = useMemo(() => {
    if (!contextos.length) return null;
    const willResetShipping = contextos.some((c) => envioSeReinicia(c.envioEstado));
    const isPartial = contextos.some((c) => {
      const inOrder = contextos.filter((x) => x.ordenId === c.ordenId).length;
      return c.cantidadItemsEnPedido > inOrder;
    });
    const showCobro = contextos.some((c) => c.ventaEstado && c.ventaEstado !== 'Señado');
    return { willResetShipping, isPartial, showCobro };
  }, [contextos]);

  const handleConfirm = async () => {
    if (!motivo) {
      toast({ title: 'Elegí un motivo', variant: 'destructive' });
      return;
    }
    if (motivo === 'OTRO' && !descripcion.trim()) {
      toast({ title: 'Describí el motivo', description: 'Es obligatorio si elegís Otro.', variant: 'destructive' });
      return;
    }
    let cobroMontoNum: number | null = null;
    if (cobrar) {
      cobroMontoNum = Number(String(cobroMonto).replace(',', '.'));
      if (!Number.isFinite(cobroMontoNum) || cobroMontoNum <= 0) {
        toast({ title: 'Monto inválido', description: 'Ingresá un cobro adicional mayor a 0.', variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    try {
      await registrarRehacer({
        selloIds,
        motivo,
        descripcion,
        cobroMonto: cobrar ? cobroMontoNum : null,
        cobroConcepto: cobrar ? cobroConcepto : null,
      });
      toast({
        title: 'Marcado para rehacer',
        description:
          selloIds.length === 1
            ? 'El ítem volvió a Rehacer.'
            : `${selloIds.length} ítems volvieron a Rehacer.`,
      });
      onConfirmed();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'No se pudo registrar',
        description: error instanceof Error ? error.message : 'Error al guardar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rehacer</DialogTitle>
          <DialogDescription>
            Se registra el motivo y se resetea lo que corresponda (foto, venta o envío) según el estado actual.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
              {contextos.length === 1 ? (
                <p>
                  <span className="font-medium">{contextos[0].disenoNombre}</span>
                  {' — '}
                  Venta: {contextos[0].ventaEstado || '—'}
                  {', '}
                  Envío: {contextos[0].envioEstado || 'Sin envío'}
                  {contextos[0].seguimiento ? ` (${contextos[0].seguimiento})` : ''}
                </p>
              ) : (
                <p>
                  <span className="font-medium">{contextos.length} ítems</span>
                  {contextos[0]?.clienteNombre ? ` del pedido de ${contextos[0].clienteNombre}` : ''}
                </p>
              )}
              {historialCount > 0 ? (
                <p className="text-muted-foreground">
                  Este ítem ya se rehizo {historialCount} {historialCount === 1 ? 'vez' : 'veces'} antes.
                </p>
              ) : null}
              {resumen?.willResetShipping ? (
                <p className="text-amber-700 dark:text-amber-400">
                  {resumen.isPartial
                    ? 'Al menos uno de estos ítems ya estaba enviado. Se va a reiniciar el envío de todo el pedido (el seguimiento viejo queda guardado).'
                    : 'Este pedido ya tenía envío cargado. Se va a reiniciar a Sin envío (el seguimiento viejo queda guardado).'}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rehacer-motivo">Motivo</Label>
              <Select value={motivo} onValueChange={(value) => setMotivo(value as RehacerMotivo)}>
                <SelectTrigger id="rehacer-motivo">
                  <SelectValue placeholder="Elegí un motivo…" />
                </SelectTrigger>
                <SelectContent>
                  {REHACER_MOTIVOS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {REHACER_MOTIVO_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rehacer-desc">
                Descripción{motivo === 'OTRO' ? ' (obligatoria)' : ' (opcional)'}
              </Label>
              <Textarea
                id="rehacer-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Qué pasó, qué hay que cambiar…"
                className="min-h-[80px] text-sm"
              />
            </div>

            {resumen?.showCobro ? (
              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={cobrar}
                    onCheckedChange={(value) => setCobrar(value === true)}
                  />
                  Corresponde cobrar algo al cliente
                </label>
                {cobrar ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="rehacer-monto" className="text-xs">
                        Monto
                      </Label>
                      <Input
                        id="rehacer-monto"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cobroMonto}
                        onChange={(e) => setCobroMonto(e.target.value)}
                        placeholder="0"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rehacer-concepto" className="text-xs">
                        Concepto
                      </Label>
                      <Input
                        id="rehacer-concepto"
                        value={cobroConcepto}
                        onChange={(e) => setCobroConcepto(e.target.value)}
                        placeholder="material, envío…"
                        className="h-8"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={loading || saving || !motivo}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
