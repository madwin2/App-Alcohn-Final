import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import {
  conteoVotos,
  labelEstadoIdea,
  puntajeIdea,
} from '@/lib/equipo/corcho';
import {
  getMisIdeasCorcho,
  type IdeaCorcho,
} from '@/lib/supabase/services/equipoCorcho.service';

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  } catch {
    return iso;
  }
}

export function MisIdeasTab({ color }: { color: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<IdeaCorcho[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getMisIdeasCorcho());
    } catch (err) {
      toast({
        title: 'No se pudieron cargar tus ideas',
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

  const ordenadas = useMemo(
    () => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Tus ideas en el corcho, con su estado y votos. El corcho es compartido.
        </p>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/corcho">
            <Pin className="h-3.5 w-3.5" />
            Ir al corcho
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        </Button>
      </div>

      {ordenadas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 px-5 py-12 text-center text-sm text-muted-foreground">
          Todavía no pinchaste ninguna idea.{' '}
          <Link to="/corcho" className="underline text-white/90">
            Andá al corcho
          </Link>{' '}
          y sumá la primera.
        </div>
      ) : (
        <ul className="space-y-2">
          {ordenadas.map((idea) => {
            const { up, down } = conteoVotos(idea.votos);
            const puntaje = puntajeIdea(idea.votos);
            return (
              <li
                key={idea.id}
                className={cn(
                  'rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3',
                  idea.estado === 'descartada' && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-white">{idea.titulo}</h3>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          idea.estado === 'aprobada' &&
                            'bg-emerald-500/20 text-emerald-300',
                          idea.estado === 'descartada' &&
                            'bg-zinc-500/20 text-zinc-300',
                          idea.estado === 'propuesta' &&
                            'bg-amber-500/15 text-amber-200',
                        )}
                      >
                        {labelEstadoIdea(idea.estado)}
                      </span>
                    </div>
                    {idea.descripcion ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {idea.descripcion}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {fmtFecha(idea.createdAt)} · 👍 {up} · 👎 {down} · puntaje{' '}
                      {puntaje > 0 ? `+${puntaje}` : puntaje}
                    </p>
                    {idea.comentarioEstado ? (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">
                        “{idea.comentarioEstado}”
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
