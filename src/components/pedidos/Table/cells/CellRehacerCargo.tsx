import { useEffect, useState } from 'react';
import { Order } from '@/lib/types/index';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CircleDollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import {
  markReworkChargeCollected,
  REHACER_MOTIVO_LABELS,
  type RehacerMotivo,
} from '@/lib/supabase/services/rehacer.service';

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

function motivoLabel(motivo: string): string {
  return REHACER_MOTIVO_LABELS[motivo as RehacerMotivo] || motivo;
}

export function CellRehacerCargo({ order }: { order: Order }) {
  const { toast } = useToast();
  const [charges, setCharges] = useState(order.reworkCharges ?? []);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setCharges(order.reworkCharges ?? []);
  }, [order.reworkCharges]);

  if (!charges.length) return null;

  const pendientes = charges.filter((c) => !c.cobrado);
  const pending = pendientes.length > 0;

  const handleToggle = async (eventId: string, cobrado: boolean) => {
    setBusyId(eventId);
    try {
      await markReworkChargeCollected(eventId, cobrado);
      setCharges((prev) => prev.map((c) => (c.id === eventId ? { ...c, cobrado } : c)));
    } catch (error) {
      toast({
        title: 'No se pudo actualizar',
        description: error instanceof Error ? error.message : 'Error al marcar cobrado',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex items-center justify-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            title={pending ? 'Cobro adicional pendiente' : 'Cobro adicional (cobrado)'}
          >
            <CircleDollarSign
              className={`h-3.5 w-3.5 ${
                pending ? 'text-amber-500' : 'text-muted-foreground'
              }`}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 bg-card border-border p-3" align="start">
          <p className="mb-2 text-sm font-medium">Cobro adicional (rehacer)</p>
          <div className="space-y-2">
            {charges.map((charge) => (
              <div key={charge.id} className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{money.format(charge.monto)}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(charge.createdAt), 'dd/MM/yy', { locale: es })}
                  </span>
                </div>
                {charge.concepto ? <p>{charge.concepto}</p> : null}
                <p className="text-muted-foreground">{motivoLabel(charge.motivo)}</p>
                {charge.descripcion ? (
                  <p className="text-muted-foreground">{charge.descripcion}</p>
                ) : null}
                <label className="flex items-center gap-2 pt-1">
                  <Checkbox
                    checked={charge.cobrado}
                    disabled={busyId === charge.id}
                    onCheckedChange={(value) => void handleToggle(charge.id, value === true)}
                  />
                  Cobrado
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
