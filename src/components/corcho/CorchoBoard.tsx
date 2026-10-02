import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/hooks/useAuth';
import { useEquipoRol } from '@/lib/hooks/useEquipoRol';
import {
  esIdeaNuevaParaMi,
  filtrarIdeasCorcho,
  ordenarIdeasCorcho,
  siguienteVoto,
  type FiltroEstadoCorcho,
  type OrdenCorcho,
  type ValorVotoCorcho,
} from '@/lib/equipo/corcho';
import {
  getMiembrosEquipo,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service';
import {
  actualizarIdeaCorcho,
  borrarIdeaCorcho,
  cambiarEstadoIdeaCorcho,
  crearIdeaCorcho,
  getIdeasCorcho,
  marcarIdeaCorchoVista,
  setVotoIdeaCorcho,
  type EstadoIdeaCorcho,
  type IdeaCorcho,
} from '@/lib/supabase/services/equipoCorcho.service';
import {
  notifyIdeaEstado,
  notifyIdeaNueva,
} from '@/lib/notificaciones/events';
import { supabase } from '@/lib/supabase/client';
import { IdeaCorchoCard } from '@/components/corcho/IdeaCorchoCard';

const REALTIME_DEBOUNCE_MS = 400;

const ESTADOS: { value: FiltroEstadoCorcho; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'propuesta', label: 'Propuestas' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'descartada', label: 'Descartadas' },
];

export interface CorchoBoardProps {
  /** Si cambia, el padre puede refrescar el badge del menú. */
  onNuevasChange?: (count: number) => void;
}

export function CorchoBoard({ onNuevasChange }: CorchoBoardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { esAdmin } = useEquipoRol();
  const viewerUserId = user?.id ?? '';

  const [ideas, setIdeas] = useState<IdeaCorcho[]>([]);
  const [miembros, setMiembros] = useState<PerfilEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoCorcho>('todas');
  const [filtroAutor, setFiltroAutor] = useState<string | null>(null);
  const [soloNuevas, setSoloNuevas] = useState(false);
  const [orden, setOrden] = useState<OrdenCorcho>('nuevas_puntaje');
  /** IDs que eran "Nueva" al cargar: se mantienen en la sesión (D14). */
  const [nuevasSesion, setNuevasSesion] = useState<Set<string>>(() => new Set());
  const vistasEnCurso = useRef<Set<string>>(new Set());
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const [estadoDialog, setEstadoDialog] = useState<{
    idea: IdeaCorcho;
    estado: EstadoIdeaCorcho;
  } | null>(null);
  const [comentarioEstado, setComentarioEstado] = useState('');
  const [savingEstado, setSavingEstado] = useState(false);

  const nombresPorUserId = useMemo(() => {
    const map: Record<string, string> = {};
    miembros.forEach((m) => {
      map[m.userId] = m.nombre;
    });
    return map;
  }, [miembros]);

  const colorPorUserId = useMemo(() => {
    const map: Record<string, string> = {};
    miembros.forEach((m) => {
      map[m.userId] = m.color;
    });
    return map;
  }, [miembros]);

  const load = useCallback(
    async (opts?: { silent?: boolean; preserveNuevasSesion?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [list, team] = await Promise.all([
          getIdeasCorcho(),
          getMiembrosEquipo(),
        ]);
        setIdeas(list);
        setMiembros(team);
        if (!opts?.preserveNuevasSesion) {
          const nuevas = new Set(
            list
              .filter((i) => esIdeaNuevaParaMi(i, viewerUserId))
              .map((i) => i.id),
          );
          setNuevasSesion(nuevas);
          onNuevasChange?.(nuevas.size);
        } else {
          onNuevasChange?.(
            list.filter((i) => esIdeaNuevaParaMi(i, viewerUserId)).length,
          );
        }
      } catch (err) {
        toast({
          title: 'No se pudo cargar el corcho',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [toast, viewerUserId, onNuevasChange],
  );

  useEffect(() => {
    if (!viewerUserId) return;
    void load();
  }, [viewerUserId, load]);

  useEffect(() => {
    const schedule = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        realtimeTimerRef.current = null;
        void load({ silent: true, preserveNuevasSesion: true });
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel('corcho-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas_corcho' },
        schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas_corcho_votos' },
        schedule,
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const visibles = useMemo(() => {
    const filtradas = filtrarIdeasCorcho(ideas, {
      viewerUserId,
      autorUserId: filtroAutor,
      estado: filtroEstado,
      soloNuevas,
    });
    return ordenarIdeasCorcho(filtradas, viewerUserId, orden);
  }, [ideas, viewerUserId, filtroAutor, filtroEstado, soloNuevas, orden]);

  const abrirCrear = () => {
    setEditId(null);
    setTitulo('');
    setDescripcion('');
    setDialogOpen(true);
  };

  const abrirEditar = (idea: IdeaCorcho) => {
    setEditId(idea.id);
    setTitulo(idea.titulo);
    setDescripcion(idea.descripcion || '');
    setDialogOpen(true);
  };

  const guardarIdea = async () => {
    const t = titulo.trim();
    if (!t) {
      toast({ title: 'Poné un título', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await actualizarIdeaCorcho({
          id: editId,
          titulo: t,
          descripcion,
        });
        toast({ title: 'Idea actualizada' });
      } else {
        const created = await crearIdeaCorcho({ titulo: t, descripcion });
        const destinatarios = miembros
          .filter((m) => m.userId !== viewerUserId)
          .map((m) => m.userId);
        const autorNombre =
          nombresPorUserId[viewerUserId] ||
          user?.user_metadata?.nombre ||
          'Alguien';
        notifyIdeaNueva({
          autorNombre,
          ideaId: created.id,
          destinatarioUserIds: destinatarios,
        });
        toast({ title: 'Idea pinchada en el corcho' });
      }
      setDialogOpen(false);
      await load({ silent: true, preserveNuevasSesion: true });
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBorrar = async (idea: IdeaCorcho) => {
    if (!window.confirm(`¿Borrar “${idea.titulo}”?`)) return;
    try {
      await borrarIdeaCorcho(idea.id);
      setNuevasSesion((prev) => {
        const next = new Set(prev);
        next.delete(idea.id);
        return next;
      });
      await load({ silent: true, preserveNuevasSesion: true });
      toast({ title: 'Idea borrada' });
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const handleVotar = async (idea: IdeaCorcho, click: ValorVotoCorcho) => {
    const actual =
      (idea.votos.find((v) => v.userId === viewerUserId)?.valor as
        | ValorVotoCorcho
        | undefined) ?? null;
    const next = siguienteVoto(actual, click);
    setVotingId(idea.id);
    try {
      await setVotoIdeaCorcho(idea.id, next);
      setIdeas((prev) =>
        prev.map((i) => {
          if (i.id !== idea.id) return i;
          const sinMio = i.votos.filter((v) => v.userId !== viewerUserId);
          const votos =
            next == null
              ? sinMio
              : [...sinMio, { userId: viewerUserId, valor: next }];
          return { ...i, votos };
        }),
      );
    } catch (err) {
      toast({
        title: 'No se pudo votar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setVotingId(null);
    }
  };

  const handleMarcarVista = async (ideaId: string) => {
    if (vistasEnCurso.current.has(ideaId)) return;
    vistasEnCurso.current.add(ideaId);
    try {
      await marcarIdeaCorchoVista(ideaId);
      // No sacamos "Nueva" de la sesión; solo bajamos el contador del menú.
      onNuevasChange?.(
        Math.max(
          0,
          ideas.filter(
            (i) =>
              esIdeaNuevaParaMi(i, viewerUserId) &&
              i.id !== ideaId &&
              !vistasEnCurso.current.has(i.id),
          ).length,
        ),
      );
    } catch {
      vistasEnCurso.current.delete(ideaId);
    }
  };

  const confirmarEstado = async () => {
    if (!estadoDialog) return;
    setSavingEstado(true);
    try {
      const updated = await cambiarEstadoIdeaCorcho({
        id: estadoDialog.idea.id,
        estado: estadoDialog.estado,
        comentarioEstado,
      });
      if (
        estadoDialog.estado === 'aprobada' ||
        estadoDialog.estado === 'descartada'
      ) {
        notifyIdeaEstado({
          estado: estadoDialog.estado,
          ideaId: updated.id,
          autorUserId: updated.autorUserId,
        });
      }
      setEstadoDialog(null);
      setComentarioEstado('');
      await load({ silent: true, preserveNuevasSesion: true });
      toast({
        title:
          estadoDialog.estado === 'aprobada'
            ? 'Idea aprobada'
            : estadoDialog.estado === 'descartada'
              ? 'Idea descartada'
              : 'Volvió a propuesta',
      });
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSavingEstado(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando el corcho…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={abrirCrear} className="gap-1.5">
          <Pin className="h-4 w-4" />
          Pinchar una idea
        </Button>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={orden === 'nuevas_puntaje' ? 'secondary' : 'ghost'}
            onClick={() => setOrden('nuevas_puntaje')}
          >
            Nuevas / votos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={orden === 'recientes' ? 'secondary' : 'ghost'}
            onClick={() => setOrden('recientes')}
          >
            Más recientes
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Persona:</span>
        <button
          type="button"
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs',
            !filtroAutor
              ? 'border-white/30 bg-white/10 text-white'
              : 'border-white/10 text-muted-foreground hover:border-white/20',
          )}
          onClick={() => setFiltroAutor(null)}
        >
          Todas
        </button>
        {miembros.map((m) => (
          <button
            key={m.userId}
            type="button"
            title={m.nombre}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs',
              filtroAutor === m.userId
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/10 text-muted-foreground hover:border-white/20',
            )}
            onClick={() =>
              setFiltroAutor((prev) => (prev === m.userId ? null : m.userId))
            }
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            {m.nombre.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Estado:</span>
        {ESTADOS.map((e) => (
          <Button
            key={e.value}
            type="button"
            size="sm"
            variant={filtroEstado === e.value ? 'secondary' : 'ghost'}
            className="h-7"
            onClick={() => setFiltroEstado(e.value)}
          >
            {e.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={soloNuevas ? 'secondary' : 'ghost'}
          className="h-7"
          onClick={() => setSoloNuevas((v) => !v)}
        >
          Solo nuevas
        </Button>
      </div>

      <div
        className="min-h-[420px] rounded-2xl border border-white/10 p-4 sm:p-6"
        style={{
          backgroundColor: '#6b3f2a',
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, rgba(0,0,0,0.18) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 70%, rgba(0,0,0,0.22) 0%, transparent 45%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0,0,0,0.03) 2px,
              rgba(0,0,0,0.03) 3px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 3px,
              rgba(255,255,255,0.02) 3px,
              rgba(255,255,255,0.02) 4px
            )
          `,
        }}
      >
        {visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-amber-50/80">
            <Pin className="h-8 w-8 opacity-60" />
            <p className="text-sm">Todavía no hay ideas acá.</p>
            <p className="text-xs opacity-70">Pinchá la primera idea del equipo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((idea) => {
              const miVoto =
                (idea.votos.find((v) => v.userId === viewerUserId)
                  ?.valor as ValorVotoCorcho | undefined) ?? null;
              return (
                <IdeaCorchoCard
                  key={idea.id}
                  idea={idea}
                  viewerUserId={viewerUserId}
                  autorNombre={nombresPorUserId[idea.autorUserId] || 'Alguien'}
                  autorColor={colorPorUserId[idea.autorUserId] || '#9CA3AF'}
                  mostrarNueva={nuevasSesion.has(idea.id)}
                  nombresPorUserId={nombresPorUserId}
                  esAdmin={esAdmin}
                  miVoto={miVoto}
                  voting={votingId === idea.id}
                  onVotar={(v) => void handleVotar(idea, v)}
                  onMarcarVista={() => void handleMarcarVista(idea.id)}
                  onEditar={() => abrirEditar(idea)}
                  onBorrar={() => void handleBorrar(idea)}
                  onAprobar={() => {
                    setComentarioEstado('');
                    setEstadoDialog({ idea, estado: 'aprobada' });
                  }}
                  onDescartar={() => {
                    setComentarioEstado('');
                    setEstadoDialog({ idea, estado: 'descartada' });
                  }}
                  onVolverPropuesta={() => {
                    setComentarioEstado('');
                    setEstadoDialog({ idea, estado: 'propuesta' });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? 'Editar idea' : 'Pinchar una idea'}
            </DialogTitle>
            <DialogDescription>
              Ideas para mejorar la empresa. Cada uno tiene su color en el corcho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="corcho-titulo">Título</Label>
              <Input
                id="corcho-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="¿Qué se te ocurre?"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="corcho-desc">Descripción (opcional)</Label>
              <Textarea
                id="corcho-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={4}
                placeholder="Contá un poco más…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void guardarIdea()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editId ? 'Guardar' : 'Pinchar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!estadoDialog}
        onOpenChange={(open) => {
          if (!open) setEstadoDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {estadoDialog?.estado === 'aprobada'
                ? 'Aprobar idea'
                : estadoDialog?.estado === 'descartada'
                  ? 'Descartar idea'
                  : 'Volver a propuesta'}
            </DialogTitle>
            <DialogDescription>
              {estadoDialog?.idea.titulo}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="corcho-comentario">Comentario (opcional)</Label>
            <Textarea
              id="corcho-comentario"
              value={comentarioEstado}
              onChange={(e) => setComentarioEstado(e.target.value)}
              rows={3}
              placeholder="Por qué se aprueba o descarta…"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEstadoDialog(null)}
              disabled={savingEstado}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmarEstado()}
              disabled={savingEstado}
            >
              {savingEstado ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
