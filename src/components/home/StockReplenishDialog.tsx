import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import type { DashboardTask } from '@/lib/supabase/services/dashboard-tasks.service';
import {
  applyStockInboundFromReplenishTask,
  parseStockReplenishTask,
  type StockReplenishPayload,
} from '@/lib/supabase/services/stock.service';

interface StockReplenishDialogProps {
  task: DashboardTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void | Promise<void>;
}

export function StockReplenishDialog({
  task,
  open,
  onOpenChange,
  onCompleted,
}: StockReplenishDialogProps) {
  const { toast } = useToast();
  const [payload, setPayload] = useState<StockReplenishPayload | null>(null);
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) {
      setPayload(null);
      setUnits('');
      return;
    }
    const parsed = parseStockReplenishTask(task.texto);
    setPayload(parsed);
    const suggested =
      parsed?.shortage && parsed.shortage > 0 ? String(parsed.shortage) : '';
    setUnits(suggested);
  }, [task]);

  const handleSubmit = async () => {
    if (!task || !payload) return;
    const n = Number(units);
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    try {
      await applyStockInboundFromReplenishTask({
        taskId: task.id,
        itemKey: payload.itemKey,
        quantity: n,
      });
      await onCompleted();
      onOpenChange(false);
      setUnits('');
      toast({ title: 'Stock actualizado', description: `Se sumaron ${n} unidades de ${payload.itemName}.` });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Probá de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Stockear {payload?.itemName ?? '…'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Para los pedidos pendientes de envío se estiman necesarias al menos{' '}
                <span className="text-foreground font-medium tabular-nums">{payload?.needed ?? '—'}</span>{' '}
                unidades; en depósito hay{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {payload?.stockAlMomento ?? '—'}
                </span>{' '}
                (<span className="text-amber-200/90">faltan {payload?.shortage ?? '—'}</span> para cubrir el
                backlog).
              </p>
              {payload?.pedidoEtiqueta && payload?.orderId ? (
                <p className="text-xs text-muted-foreground/90 border border-white/10 rounded-xl px-3 py-2 bg-black/30">
                  Relacionado además con intento de envío del pedido{' '}
                  <span className="text-foreground font-mono">{payload.pedidoEtiqueta}</span>
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <Label htmlFor="units-stocked">Unidades ingresadas ahora</Label>
          <Input
            id="units-stocked"
            type="number"
            min={1}
            className="rounded-xl border-white/10 bg-black/40"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="Ej. cantidad que sumaste al stock"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Después
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={busy || !payload}
            onClick={handleSubmit}
          >
            {busy ? 'Guardando…' : 'Marcar como hecha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
