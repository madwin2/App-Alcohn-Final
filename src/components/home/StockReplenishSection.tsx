import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import type { DashboardTask } from '@/lib/supabase/services/dashboard-tasks.service';
import {
  applyStockInboundFromReplenishTask,
  type StockReplenishPayload,
} from '@/lib/supabase/services/stock.service';

interface StockReplenishSectionProps {
  entries: { task: DashboardTask; payload: StockReplenishPayload }[];
  onSkip: (taskId: string) => void;
  onCompleted: () => void | Promise<void>;
}

function ReplenishCard({
  task,
  payload,
  onSkip,
  onCompleted,
}: {
  task: DashboardTask;
  payload: StockReplenishPayload;
  onSkip: () => void;
  onCompleted: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [units, setUnits] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const suggested = payload.shortage > 0 ? String(payload.shortage) : '';
    setUnits(suggested);
  }, [task.id, payload.shortage, payload.itemKey]);

  const handleSubmit = async () => {
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
      toast({
        title: 'Stock actualizado',
        description: `Se sumaron ${n} unidades de ${payload.itemName}.`,
      });
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
    <Card className="border border-white/10 bg-card/50 shadow-[0_8px_40px_rgba(0,0,0,0.35)] rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-base font-semibold tracking-tight leading-snug">
          <span>Stockear {payload.itemName}</span>
          {payload.orderId ? (
            <Badge variant="outline" className="text-[10px] shrink-0 border-amber-400/30 text-amber-200/90">
              Envío
            </Badge>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed pt-1">
          Se estiman necesarias al menos{' '}
          <span className="text-foreground font-medium tabular-nums">{payload.needed}</span> unidades; en
          depósito hay{' '}
          <span className="text-foreground font-medium tabular-nums">{payload.stockAlMomento}</span> (
          <span className="text-amber-200/90">faltan {payload.shortage}</span>).
        </p>
        {payload.pedidoEtiqueta && payload.orderId ? (
          <p className="text-[11px] text-muted-foreground border border-white/10 rounded-lg px-2.5 py-1.5 bg-black/25 mt-2">
            Pedido: <span className="text-foreground font-mono">{payload.pedidoEtiqueta}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="space-y-1.5">
          <Label htmlFor={`units-${task.id}`} className="text-xs">
            Unidades ingresadas ahora
          </Label>
          <Input
            id={`units-${task.id}`}
            type="number"
            min={1}
            className="rounded-xl border-white/10 bg-black/40"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            disabled={busy}
            onClick={onSkip}
          >
            Después
          </Button>
          <Button type="button" size="sm" className="rounded-full" disabled={busy} onClick={handleSubmit}>
            {busy ? 'Guardando…' : 'Marcar como hecha'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StockReplenishSection({ entries, onSkip, onCompleted }: StockReplenishSectionProps) {
  if (!entries.length) return null;

  return (
    <section aria-label="Stock pendiente de reponer" className="space-y-2">
      <h3 className="text-sm font-semibold tracking-tight text-muted-foreground">Stock pendiente</h3>
      <div className="space-y-3">
        {entries.map(({ task, payload }) => (
          <ReplenishCard
            key={task.id}
            task={task}
            payload={payload}
            onSkip={() => onSkip(task.id)}
            onCompleted={onCompleted}
          />
        ))}
      </div>
    </section>
  );
}
