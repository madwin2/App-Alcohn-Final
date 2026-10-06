import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  getNecesidadesPendientes,
  resolverNecesidad,
  type NecesidadEquipo,
} from '@/lib/supabase/services/equipoNecesidades.service';
import { notifyNecesidadResuelta } from '@/lib/notificaciones/events';
import { useAuth } from '@/lib/hooks/useAuth';

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  } catch {
    return iso;
  }
}

interface EquipoNecesidadesBandejaProps {
  nombresPorUserId: Record<string, string>;
}

export function EquipoNecesidadesBandeja({ nombresPorUserId }: EquipoNecesidadesBandejaProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<NecesidadEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getNecesidadesPendientes());
    } catch (err) {
      toast({
        title: 'No se pudieron cargar necesidades',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResolver = async (n: NecesidadEquipo) => {
    setResolviendoId(n.id);
    try {
      await resolverNecesidad({
        id: n.id,
        respuestaAdmin: respuestas[n.id] ?? null,
      });
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      const adminNombre =
        (user?.id && nombresPorUserId[user.id]?.split(/\s+/)[0]) || 'Julián';
      notifyNecesidadResuelta({
        adminNombre,
        destinatarioUserId: n.userId,
        necesidadId: n.id,
      });
      toast({ title: 'Pedido marcado como resuelto' });
    } catch (err) {
      toast({
        title: 'No se pudo resolver',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setResolviendoId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Necesidades pendientes…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-xs text-muted-foreground">
        No hay necesidades pendientes del equipo.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white">Necesidades pendientes</h3>
      <ul className="space-y-3">
        {items.map((n) => {
          const nombre = nombresPorUserId[n.userId] || 'Integrante';
          return (
            <li key={n.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <p className="font-medium text-white">{nombre}</p>
              <p className="mt-1 text-muted-foreground">{n.texto}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{fmtFecha(n.createdAt)}</p>
              <Textarea
                className="mt-2 min-h-[60px] text-xs"
                placeholder="Respuesta opcional para la persona…"
                value={respuestas[n.id] ?? ''}
                onChange={(e) =>
                  setRespuestas((prev) => ({ ...prev, [n.id]: e.target.value }))
                }
              />
              <Button
                type="button"
                size="sm"
                className="mt-2 gap-1.5"
                disabled={resolviendoId === n.id}
                onClick={() => void handleResolver(n)}
              >
                {resolviendoId === n.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Marcar resuelta
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
