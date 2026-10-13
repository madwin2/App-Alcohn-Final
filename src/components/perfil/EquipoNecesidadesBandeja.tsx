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
import { Panel, PanelTitle } from '@/components/perfil/perfilUi';

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
        (user?.id && nombresPorUserId[user.id]?.split(/\s+/)[0]) || 'El admin';
      notifyNecesidadResuelta({
        adminNombre,
        destinatarioUserId: n.userId,
        necesidadId: n.id,
        respuestaAdmin: respuestas[n.id] ?? null,
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
      <Panel>
        <PanelTitle title="Pedidos del equipo" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando…
        </p>
      </Panel>
    );
  }

  if (items.length === 0) {
    return (
      <Panel>
        <PanelTitle title="Pedidos del equipo" sub="Lo que piden desde «Lo que necesito»" />
        <p className="text-sm text-muted-foreground">No hay pedidos pendientes.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelTitle
        title="Pedidos del equipo"
        sub={`${items.length} ${items.length === 1 ? 'pendiente' : 'pendientes'} · al resolver, la persona recibe un aviso`}
      />
      <ul className="space-y-2">
        {items.map((n) => {
          const nombre = nombresPorUserId[n.userId] || 'Integrante';
          return (
            <li key={n.id} className="rounded-2xl bg-white/[0.03] p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{nombre}</p>
                <p className="shrink-0 text-xs text-muted-foreground">{fmtFecha(n.createdAt)}</p>
              </div>
              <p className="mt-1 text-foreground/85">{n.texto}</p>
              <Textarea
                className="mt-3 min-h-[60px] resize-none rounded-xl border-0 bg-black/20 text-sm focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0"
                placeholder="Respuesta opcional para la persona…"
                value={respuestas[n.id] ?? ''}
                onChange={(e) =>
                  setRespuestas((prev) => ({ ...prev, [n.id]: e.target.value }))
                }
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 h-8 gap-1.5 rounded-full bg-white/[0.08] px-3.5 text-xs hover:bg-white/[0.14]"
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
    </Panel>
  );
}
