import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin';
import { cn } from '@/lib/utils/cn';
import { Estado, Panel, Segmentado, Vacio, type Tono } from '@/components/perfil/perfilUi';
import { renderCentroChatMarkdown } from '@/lib/centro/markdown';
import {
  contarFeedbackNoLeido,
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

const TONO_TIPO: Record<TipoFeedback, Tono> = {
  felicitacion: 'ok',
  mejora: 'neutro',
  correccion: 'aviso',
};

export interface FeedbackTabProps {
  onUnreadChange?: (count: number) => void;
  /** Cambia al llegar desde una notificación estando ya en la pestaña (EQ-R21). */
  refreshKey?: number;
}

export function FeedbackTab({ onUnreadChange, refreshKey = 0 }: FeedbackTabProps) {
  const { toast } = useToast();
  const adminNombre = useNombreAdmin();
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
  }, [load, refreshKey]);

  const lista = useMemo(
    () =>
      ordenarFeedbackCronologico(
        filtrarFeedbackPorTipo(items, filtro),
      ) as FeedbackEquipo[],
    [items, filtro],
  );

  const abrir = async (f: FeedbackEquipo) => {
    // Lista + lectura: tocar uno lo abre a la derecha (no se cierra al volver a tocarlo).
    const next = f.id;
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

  const abierto = lista.find((f) => f.id === abiertoId) ?? null;
  const html = abierto ? renderCentroChatMarkdown(abierto.texto) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Lo que te deja {adminNombre} sobre tu trabajo. Al abrirlo queda como leído.
        </p>
        <Segmentado
          opciones={FILTROS.map((f) => ({ valor: f.value, label: f.label }))}
          valor={filtro}
          onChange={setFiltro}
        />
      </div>

      {lista.length === 0 ? (
        <Vacio>Todavía no hay feedback{filtro !== 'todos' ? ' de este tipo' : ''}.</Vacio>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-12">
          <Panel className="p-3 sm:p-3 xl:col-span-5">
            <ul className="space-y-0.5">
              {lista.map((f) => {
                const noLeido = !f.leidoAt;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => void abrir(f)}
                      className={cn(
                        'w-full rounded-2xl px-4 py-3 text-left transition-colors',
                        abiertoId === f.id ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn('min-w-0 text-sm', noLeido ? 'font-semibold text-foreground' : 'text-foreground/85')}>
                          {f.titulo?.trim() || labelTipoFeedback(f.tipo)}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">{fmtFecha(f.createdAt)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <Estado tono={TONO_TIPO[f.tipo]} className="text-xs text-muted-foreground">
                          {labelTipoFeedback(f.tipo)}
                        </Estado>
                        {noLeido ? <span className="text-xs text-[#f6c46b]">Nuevo</span> : null}
                        {marcandoId === f.id ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel className="min-h-[320px] xl:col-span-7">
            {abierto ? (
              <>
                <Estado tono={TONO_TIPO[abierto.tipo]} className="text-[13px] text-muted-foreground">
                  {labelTipoFeedback(abierto.tipo)} · {fmtFecha(abierto.createdAt)}
                  {abierto.editadoAt ? ` · editado el ${fmtFecha(abierto.editadoAt)}` : ''}
                </Estado>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  {abierto.titulo?.trim() || labelTipoFeedback(abierto.tipo)}
                </h3>
                <div
                  className="prose prose-invert mt-5 max-w-none text-[15px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </>
            ) : (
              <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">
                Elegí uno de la lista para leerlo.
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
