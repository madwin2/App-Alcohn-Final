import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { renderCentroChatMarkdown } from '@/lib/centro/markdown';
import {
  clasesTipoFeedback,
  contarFeedbackNoLeido,
  emojiTipoFeedback,
  filtrarFeedbackPorTipo,
  labelTipoFeedback,
  ordenarFeedbackCronologico,
  type TipoFeedback,
} from '@/lib/equipo/feedback';
import {
  getMiFeedback,
  marcarFeedbackLeido,
  type FeedbackEquipo,
} from '@/lib/supabase/services/equipoFeedback.service';

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

const FILTROS: { value: TipoFeedback | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'felicitacion', label: 'Felicitaciones' },
  { value: 'mejora', label: 'Mejoras' },
  { value: 'correccion', label: 'Correcciones' },
];

export interface FeedbackTabProps {
  onUnreadChange?: (count: number) => void;
}

export function FeedbackTab({ onUnreadChange }: FeedbackTabProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<FeedbackEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<TipoFeedback | 'todos'>('todos');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [marcandoId, setMarcandoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getMiFeedback();
      setItems(list);
      onUnreadChange?.(contarFeedbackNoLeido(list));
    } catch (err) {
      toast({
        title: 'No se pudo cargar el feedback',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, onUnreadChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const lista = useMemo(
    () =>
      ordenarFeedbackCronologico(
        filtrarFeedbackPorTipo(items, filtro),
      ) as FeedbackEquipo[],
    [items, filtro],
  );

  const abrir = async (f: FeedbackEquipo) => {
    const next = abiertoId === f.id ? null : f.id;
    setAbiertoId(next);
    if (next && !f.leidoAt) {
      setMarcandoId(f.id);
      try {
        await marcarFeedbackLeido(f.id);
        setItems((prev) => {
          const updated = prev.map((x) =>
            x.id === f.id ? { ...x, leidoAt: x.leidoAt || new Date().toISOString() } : x,
          );
          onUnreadChange?.(contarFeedbackNoLeido(updated));
          return updated;
        });
      } catch (err) {
        toast({
          title: 'No se pudo marcar como leído',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      } finally {
        setMarcandoId(null);
      }
    }
  };

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
      <p className="text-xs text-muted-foreground">
        Lo que te deja Julián sobre tu trabajo. Podés marcarlo como leído; por ahora no hay respuestas.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filtro === f.value ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setFiltro(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay feedback.
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.map((f) => {
            const abierto = abiertoId === f.id;
            const noLeido = !f.leidoAt;
            const html = abierto ? renderCentroChatMarkdown(f.texto) : '';
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => void abrir(f)}
                  className={cn(
                    'w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                    clasesTipoFeedback(f.tipo),
                    noLeido && 'ring-1 ring-white/20',
                    abierto && 'ring-1 ring-white/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base leading-none" aria-hidden>
                          {emojiTipoFeedback(f.tipo)}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {labelTipoFeedback(f.tipo)}
                        </span>
                        {noLeido ? (
                          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            Nuevo
                          </span>
                        ) : null}
                        {marcandoId === f.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      <p className={cn('mt-1.5 text-white', noLeido && 'font-semibold')}>
                        {f.titulo?.trim() || labelTipoFeedback(f.tipo)}
                      </p>
                      {!abierto ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{f.texto}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {fmtFecha(f.createdAt)}
                    </span>
                  </div>
                  {abierto ? (
                    <div
                      className="prose prose-invert prose-sm mt-3 max-w-none border-t border-white/10 pt-3"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
