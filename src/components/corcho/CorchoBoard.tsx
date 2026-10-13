import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownUp, ChevronDown, FilterX, Loader2, Pin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  mergeNuevasSesion,
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
  borrarComentarioIdeaCorcho,
  borrarIdeaCorcho,
  cambiarEstadoIdeaCorcho,
  crearComentarioIdeaCorcho,
  crearIdeaCorcho,
  getIdeasCorcho,
  marcarIdeaCorchoVista,
  setVotoIdeaCorcho,
  type EstadoIdeaCorcho,
  type IdeaCorcho,
} from '@/lib/supabase/services/equipoCorcho.service';
import {
  notifyIdeaComentario,
  notifyIdeaEstado,
  notifyIdeaNueva,
} from '@/lib/notificaciones/events';
import { supabase } from '@/lib/supabase/client';
import { IdeaCorchoCard } from '@/components/corcho/IdeaCorchoCard';
import { IdeaCorchoDialog } from '@/components/corcho/IdeaCorchoDialog';
import {
  AvatarPersona,
  BOTON_TINTA,
  CAMPO_PAPEL,
  Chinche,
  ConfirmPapel,
  DIALOGO_PAPEL,
  colorPapel,
} from '@/components/corcho/corchoUi';
import {
  CORCHO_MOCK_IDEAS,
  CORCHO_MOCK_MIEMBROS,
  CORCHO_MOCK_VIEWER,
} from '@/lib/equipo/corchoMock';

const REALTIME_DEBOUNCE_MS = 400;

/** "Activas" por defecto: las descartadas se esconden (POL-078). */
const FILTRO_ESTADO_DEFAULT: FiltroEstadoCorcho = 'activas';

const ESTADOS: { value: FiltroEstadoCorcho; label: string }[] = [
  { value: 'activas', label: 'Activas' },
  { value: 'propuesta', label: 'Propuestas' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'descartada', label: 'Descartadas' },
  { value: 'todas', label: 'Todas' },
];

const ORDENES: { valor: OrdenCorcho; label: string }[] = [
  { valor: 'nuevas_puntaje', label: 'Nuevas y más votadas' },
  { valor: 'recientes', label: 'Más recientes' },
];

/** Columnas del tablero según el ancho (mismos cortes que Tailwind sm/md/lg/xl). */
function useColumnasCorcho(): number {
  const calcular = () => {
    if (typeof window === 'undefined') return 4;
    const w = window.innerWidth;
    if (w >= 1280) return 5;
    if (w >= 1024) return 4;
    if (w >= 768) return 3;
    if (w >= 640) return 2;
    return 1;
  };
  const [columnas, setColumnas] = useState(calcular);
  useEffect(() => {
    const onResize = () => setColumnas(calcular());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return columnas;
}

export interface CorchoBoardProps {
  /** Si cambia, el padre puede refrescar el badge del menú. */
  onNuevasChange?: (count: number) => void;
  /** Muestra ideas de ejemplo (igual que `?demo=1`). */
  demo?: boolean;
}

export function CorchoBoard({ onNuevasChange, demo: demoProp }: CorchoBoardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { esAdmin } = useEquipoRol();
  const [searchParams, setSearchParams] = useSearchParams();
  /** `?demo=1`: corcho con ideas de ejemplo, nada se guarda. */
  const demo = demoProp || searchParams.get('demo') === '1';
  const viewerUserId = demo ? CORCHO_MOCK_VIEWER : (user?.id ?? '');
  const columnas = useColumnasCorcho();

  const [ideas, setIdeas] = useState<IdeaCorcho[]>([]);
  const [miembros, setMiembros] = useState<PerfilEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoCorcho>(FILTRO_ESTADO_DEFAULT);
  const [filtroAutor, setFiltroAutor] = useState<string | null>(null);
  const [soloNuevas, setSoloNuevas] = useState(false);
  const [orden, setOrden] = useState<OrdenCorcho>('nuevas_puntaje');
  /** IDs que eran "Nueva" al cargar: se mantienen en la sesión (D14). */
  const [nuevasSesion, setNuevasSesion] = useState<Set<string>>(() => new Set());
  const vistasEnCurso = useRef<Set<string>>(new Set());
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ids de la lista anterior: sirve para detectar ideas que llegan en vivo (EQ-R12). */
  const idsPrevios = useRef<Set<string>>(new Set());
  const nuevasSesionRef = useRef<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(() => new Set());

  /** Idea abierta en grande (se busca en `ideas` para ver los cambios en vivo). */
  const [ideaAbiertaId, setIdeaAbiertaId] = useState<string | null>(null);
  const [ideaABorrar, setIdeaABorrar] = useState<IdeaCorcho | null>(null);
  const [comentarioABorrar, setComentarioABorrar] = useState<string | null>(null);

  const quitarParams = useCallback(
    (claves: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          claves.forEach((k) => next.delete(k));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Links desde Inicio (`?pinchar=1`, `?soloNuevas=1`): se usan una vez y se limpian,
  // así recargar la página no vuelve a abrir el formulario.
  useEffect(() => {
    const usados: string[] = [];
    if (searchParams.get('soloNuevas') === '1') {
      setSoloNuevas(true);
      usados.push('soloNuevas');
    }
    if (searchParams.get('pinchar') === '1') {
      setEditId(null);
      setDialogOpen(true);
      usados.push('pinchar');
    }
    if (usados.length) quitarParams(usados);
  }, [searchParams, quitarParams]);

  // EQ-R13: se piden también los inactivos para no mostrar "Alguien" en ideas viejas.
  const nombresPorUserId = useMemo(() => {
    const map: Record<string, string> = {};
    miembros.forEach((m) => {
      map[m.userId] = m.activo ? m.nombre : `${m.nombre} (ya no está)`;
    });
    return map;
  }, [miembros]);

  const miembrosActivos = useMemo(() => miembros.filter((m) => m.activo), [miembros]);

  /** Para filtrar por persona: activos + inactivos que dejaron ideas. */
  const miembrosFiltro = useMemo(() => {
    const autores = new Set(ideas.map((i) => i.autorUserId));
    return miembros.filter((m) => m.activo || autores.has(m.userId));
  }, [miembros, ideas]);

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
        const [list, team] = demo
          ? [CORCHO_MOCK_IDEAS, CORCHO_MOCK_MIEMBROS]
          : await Promise.all([
              getIdeasCorcho(),
              getMiembrosEquipo({ incluirInactivos: true }),
            ]);
        setIdeas(list);
        setMiembros(team);
        if (!opts?.preserveNuevasSesion) {
          const nuevas = new Set(
            list
              .filter((i) => esIdeaNuevaParaMi(i, viewerUserId))
              .map((i) => i.id),
          );
          nuevasSesionRef.current = nuevas;
          setNuevasSesion(nuevas);
          onNuevasChange?.(nuevas.size);
        } else {
          // EQ-R12: las ideas que llegan en vivo también muestran "Nueva" y se marcan vistas.
          const merged = mergeNuevasSesion({
            nuevasSesion: nuevasSesionRef.current,
            idsAnteriores: idsPrevios.current,
            ideas: list,
            viewerUserId,
          });
          nuevasSesionRef.current = merged;
          setNuevasSesion(merged);
          onNuevasChange?.(
            list.filter((i) => esIdeaNuevaParaMi(i, viewerUserId)).length,
          );
        }
        idsPrevios.current = new Set(list.map((i) => i.id));
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
    [toast, viewerUserId, onNuevasChange, demo],
  );

  useEffect(() => {
    if (!viewerUserId) return;
    void load();
  }, [viewerUserId, load]);

  useEffect(() => {
    if (demo) return;
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ideas_corcho_comentarios' },
        schedule,
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [load, demo]);

  // `?idea=<id>` (notificaciones, Mis ideas): abre esa idea en grande cuando ya cargó.
  const ideaParam = searchParams.get('idea');
  useEffect(() => {
    if (!ideaParam || loading) return;
    const idea = ideas.find((i) => i.id === ideaParam);
    if (idea) {
      setIdeaAbiertaId(idea.id);
      if (!demo && esIdeaNuevaParaMi(idea, viewerUserId)) {
        void marcarIdeaCorchoVista(idea.id).catch(() => undefined);
      }
    } else {
      toast({ title: 'Esa idea ya no está en el corcho', description: 'Puede que la hayan borrado.' });
    }
    quitarParams(['idea']);
  }, [ideaParam, loading, ideas, toast, quitarParams, demo, viewerUserId]);

  // Filtro, orden y cartel usan las mismas "Nueva" (las de la sesión): así las
  // tarjetas no saltan de lugar cuando otra persona vota y se recarga el tablero.
  const esNuevaSesion = useCallback(
    (idea: IdeaCorcho) => nuevasSesion.has(idea.id),
    [nuevasSesion],
  );

  const visibles = useMemo(() => {
    const filtradas = filtrarIdeasCorcho(ideas, {
      viewerUserId,
      autorUserId: filtroAutor,
      estado: filtroEstado,
      soloNuevas,
      esNueva: esNuevaSesion,
    });
    return ordenarIdeasCorcho(filtradas, viewerUserId, orden, esNuevaSesion);
  }, [ideas, viewerUserId, filtroAutor, filtroEstado, soloNuevas, orden, esNuevaSesion]);

  const hayFiltros = !!filtroAutor || filtroEstado !== FILTRO_ESTADO_DEFAULT || soloNuevas;
  const limpiarFiltros = () => {
    setFiltroAutor(null);
    setFiltroEstado(FILTRO_ESTADO_DEFAULT);
    setSoloNuevas(false);
  };

  const ideaAbierta = useMemo(
    () => (ideaAbiertaId ? (ideas.find((i) => i.id === ideaAbiertaId) ?? null) : null),
    [ideas, ideaAbiertaId],
  );

  const miVotoDe = (idea: IdeaCorcho): ValorVotoCorcho | null =>
    (idea.votos.find((v) => v.userId === viewerUserId)?.valor as ValorVotoCorcho | undefined) ??
    null;

  const abrirCrear = () => {
    // Si venías editando, arranca en blanco; si era un borrador de idea nueva, se conserva.
    if (editId) {
      setTitulo('');
      setDescripcion('');
    }
    setEditId(null);
    setDialogOpen(true);
  };

  const abrirEditar = (idea: IdeaCorcho) => {
    setIdeaAbiertaId(null);
    setEditId(idea.id);
    setTitulo(idea.titulo);
    setDescripcion(idea.descripcion || '');
    setDialogOpen(true);
  };

  const avisarDemo = () =>
    toast({ title: 'Vista de ejemplo', description: 'En el modo demo no se guarda nada.' });

  const guardarIdea = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    if (demo) {
      setDialogOpen(false);
      avisarDemo();
      return;
    }
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
        const destinatarios = miembrosActivos
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
      setEditId(null);
      setTitulo('');
      setDescripcion('');
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

  const solicitarBorrarIdea = (idea: IdeaCorcho) => {
    if (demo) return avisarDemo();
    setIdeaABorrar(idea);
  };

  const confirmarBorrarIdea = () => {
    const idea = ideaABorrar;
    if (!idea) return;
    void (async () => {
      try {
        await borrarIdeaCorcho(idea.id);
        setIdeaAbiertaId((prev) => (prev === idea.id ? null : prev));
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
    })();
  };

  const handleVotar = async (idea: IdeaCorcho, click: ValorVotoCorcho) => {
    if (votingIds.has(idea.id)) return;
    const next = siguienteVoto(miVotoDe(idea), click);
    setVotingIds((prev) => new Set(prev).add(idea.id));
    try {
      if (!demo) await setVotoIdeaCorcho(idea.id, next);
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
      setVotingIds((prev) => {
        const s = new Set(prev);
        s.delete(idea.id);
        return s;
      });
    }
  };

  const handleMarcarVista = async (ideaId: string) => {
    if (demo || vistasEnCurso.current.has(ideaId)) return;
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

  const cambiarEstado = async (
    idea: IdeaCorcho,
    estado: EstadoIdeaCorcho,
    comentarioEstado: string,
  ): Promise<boolean> => {
    if (demo) {
      avisarDemo();
      return true;
    }
    try {
      const updated = await cambiarEstadoIdeaCorcho({ id: idea.id, estado, comentarioEstado });
      if (estado === 'aprobada' || estado === 'descartada') {
        notifyIdeaEstado({
          estado,
          ideaId: updated.id,
          autorUserId: updated.autorUserId,
        });
      }
      await load({ silent: true, preserveNuevasSesion: true });
      toast({
        title:
          estado === 'aprobada'
            ? 'Idea aprobada'
            : estado === 'descartada'
              ? 'Idea descartada'
              : 'Volvió a propuesta',
      });
      return true;
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
      return false;
    }
  };

  const comentar = async (idea: IdeaCorcho, texto: string): Promise<boolean> => {
    try {
      const nuevo = demo
        ? {
            id: `demo-c-${Date.now()}`,
            ideaId: idea.id,
            autorUserId: viewerUserId,
            texto,
            createdAt: new Date().toISOString(),
          }
        : await crearComentarioIdeaCorcho({ ideaId: idea.id, texto });
      setIdeas((prev) =>
        prev.map((i) =>
          i.id === idea.id ? { ...i, comentarios: [...i.comentarios, nuevo] } : i,
        ),
      );
      if (!demo) {
        notifyIdeaComentario({
          autorComentarioNombre: nombresPorUserId[viewerUserId] || 'Alguien',
          autorComentarioUserId: viewerUserId,
          ideaId: idea.id,
          ideaTitulo: idea.titulo,
          autorIdeaUserId: idea.autorUserId,
        });
      }
      return true;
    } catch (err) {
      toast({
        title: 'No se pudo comentar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
      return false;
    }
  };

  const confirmarBorrarComentario = () => {
    const id = comentarioABorrar;
    if (!id) return;
    void (async () => {
      try {
        if (!demo) await borrarComentarioIdeaCorcho(id);
        setIdeas((prev) =>
          prev.map((i) => ({ ...i, comentarios: i.comentarios.filter((c) => c.id !== id) })),
        );
      } catch (err) {
        toast({
          title: 'No se pudo borrar el comentario',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      }
    })();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className={cn(PANEL, 'flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700')}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando el corcho…
        </div>
      </div>
    );
  }

  const nuevasVisibles = visibles.filter((i) => nuevasSesion.has(i.id)).length;

  return (
    <div className="space-y-8">
      <header className={cn(PANEL, 'space-y-3 px-4 py-4 sm:px-5')}>
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="whitespace-nowrap text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
              Corcho de ideas
            </h1>
            <p className="whitespace-nowrap text-sm tabular-nums text-zinc-500">
              {visibles.length} {visibles.length === 1 ? 'idea' : 'ideas'}
              {nuevasVisibles ? (
                <span className="text-zinc-800"> · {nuevasVisibles} {nuevasVisibles === 1 ? 'nueva' : 'nuevas'}</span>
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            onClick={abrirCrear}
            className={cn(BOTON_TINTA, 'h-10 shrink-0 gap-1.5 px-5')}
          >
            <Pin className="h-4 w-4" />
            <span className="hidden sm:inline">Pinchar una idea</span>
            <span className="sm:hidden">Pinchar</span>
          </Button>
        </div>

        {/* Una sola fila de filtros; en pantallas chicas se desliza de costado. */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto border-t border-zinc-900/[0.08] px-4 pt-3 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&>*]:shrink-0">
          <div className="flex items-center gap-1" role="group" aria-label="Filtrar por persona">
            <button
              type="button"
              className={chipClaro(!filtroAutor)}
              onClick={() => setFiltroAutor(null)}
              aria-pressed={!filtroAutor}
            >
              Todos
            </button>
            {miembrosFiltro.map((m) => {
              const activo = filtroAutor === m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  title={nombresPorUserId[m.userId] ?? m.nombre}
                  aria-label={`Ideas de ${nombresPorUserId[m.userId] ?? m.nombre}`}
                  aria-pressed={activo}
                  className={cn(
                    'rounded-full p-0.5 transition',
                    activo && 'ring-2 ring-zinc-950',
                    filtroAutor && !activo && 'opacity-40 hover:opacity-90',
                    !m.activo && 'grayscale',
                  )}
                  onClick={() => setFiltroAutor((prev) => (prev === m.userId ? null : m.userId))}
                >
                  <AvatarPersona nombre={m.nombre} color={m.color} />
                </button>
              );
            })}
          </div>

          <span aria-hidden className="h-5 w-px bg-zinc-900/10" />

          <SegmentadoClaro
            opciones={ESTADOS.map((e) => ({ valor: e.value, label: e.label }))}
            valor={filtroEstado}
            onChange={setFiltroEstado}
          />
          <button
            type="button"
            className={chipClaro(soloNuevas)}
            onClick={() => setSoloNuevas((v) => !v)}
            aria-pressed={soloNuevas}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Solo nuevas
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(chipClaro(false), 'ml-auto')}>
                <ArrowDownUp className="h-3.5 w-3.5" />
                {ORDENES.find((o) => o.valor === orden)?.label}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-xl border-zinc-900/10 bg-[#fffaf0] p-1 text-zinc-800 shadow-[0_12px_30px_-10px_rgba(40,20,5,0.45)]"
            >
              <DropdownMenuRadioGroup value={orden} onValueChange={(v) => setOrden(v as OrdenCorcho)}>
                {ORDENES.map((o) => (
                  <DropdownMenuRadioItem
                    key={o.valor}
                    value={o.valor}
                    className="rounded-lg text-sm focus:bg-zinc-900/[0.06] focus:text-zinc-950"
                  >
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {demo ? (
        <p className="mx-auto w-fit rounded-full bg-zinc-950/80 px-4 py-1.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur">
          Vista de ejemplo · las ideas son de mentira y no se guarda nada
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <div className="flex justify-center py-16">
          {ideas.length === 0 ? (
            <div className={cn(PANEL, 'flex flex-col items-center gap-2 px-10 py-8 text-center')}>
              <Pin className="h-7 w-7 text-zinc-500" />
              <p className="text-sm font-medium text-zinc-800">Todavía no hay ideas en el corcho.</p>
              <p className="text-xs text-zinc-500">Pinchá la primera idea del equipo.</p>
            </div>
          ) : (
            <div className={cn(PANEL, 'flex flex-col items-center gap-3 px-10 py-8 text-center')}>
              <FilterX className="h-7 w-7 text-zinc-500" />
              <p className="text-sm font-medium text-zinc-800">No hay ideas con estos filtros.</p>
              {hayFiltros ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={limpiarFiltros}
                  className="rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        // Columnas tipo corcho real: cada nota debajo de la anterior, sin huecos por filas.
        // Se reparten en orden (1ª columna, 2ª, …) para que se lea de izquierda a derecha.
        <div className="flex items-start gap-5 pb-10 pt-3">
          {Array.from({ length: columnas }, (_, c) => (
            <div key={c} className="flex min-w-0 flex-1 flex-col gap-8">
              {visibles
                .filter((_, i) => i % columnas === c)
                .map((idea) => {
                  const indice = visibles.indexOf(idea);
                  return (
                    <IdeaCorchoCard
                      key={idea.id}
                      indice={indice}
                      idea={idea}
                      viewerUserId={viewerUserId}
                      autorNombre={nombresPorUserId[idea.autorUserId] || 'Alguien'}
                      autorColor={colorPorUserId[idea.autorUserId] || '#9CA3AF'}
                      mostrarNueva={nuevasSesion.has(idea.id)}
                      nombresPorUserId={nombresPorUserId}
                      miVoto={miVotoDe(idea)}
                      voting={votingIds.has(idea.id)}
                      onVotar={(v) => void handleVotar(idea, v)}
                      onMarcarVista={() => void handleMarcarVista(idea.id)}
                      onAbrir={() => setIdeaAbiertaId(idea.id)}
                    />
                  );
                })}
            </div>
          ))}
        </div>
      )}

      <IdeaCorchoDialog
        idea={ideaAbierta}
        onClose={() => setIdeaAbiertaId(null)}
        viewerUserId={viewerUserId}
        esAdmin={esAdmin}
        nombresPorUserId={nombresPorUserId}
        colorPorUserId={colorPorUserId}
        miVoto={ideaAbierta ? miVotoDe(ideaAbierta) : null}
        voting={ideaAbierta ? votingIds.has(ideaAbierta.id) : false}
        onVotar={(v) => ideaAbierta && void handleVotar(ideaAbierta, v)}
        onEditar={() => ideaAbierta && abrirEditar(ideaAbierta)}
        onBorrar={() => ideaAbierta && solicitarBorrarIdea(ideaAbierta)}
        onCambiarEstado={(estado, comentario) =>
          ideaAbierta ? cambiarEstado(ideaAbierta, estado, comentario) : Promise.resolve(false)
        }
        onComentar={(texto) =>
          ideaAbierta ? comentar(ideaAbierta, texto) : Promise.resolve(false)
        }
        onBorrarComentario={setComentarioABorrar}
      />

      {/* Formulario como una nota en blanco, del color de quien escribe. */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent
          className={cn(DIALOGO_PAPEL, 'overflow-visible p-0 sm:max-w-md')}
          style={{ background: colorPapel(colorPorUserId[viewerUserId] || '#9CA3AF', 16) }}
        >
          <Chinche className="!-top-2 scale-125" />
          <form onSubmit={(e) => void guardarIdea(e)} className="space-y-5 px-6 pb-6 pt-7">
            <div className="space-y-1 pr-6">
              <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
                {editId ? 'Editar idea' : 'Pinchar una idea'}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-zinc-600">
                {editId
                  ? 'Se puede editar mientras nadie la votó.'
                  : 'Algo para mejorar la empresa. Le llega un aviso al resto del equipo.'}
              </DialogDescription>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="corcho-titulo" className="text-[13px] text-zinc-700">
                    Título
                  </Label>
                  <span className="text-[11px] tabular-nums text-zinc-400">{titulo.length}/120</span>
                </div>
                <Input
                  id="corcho-titulo"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="¿Qué se te ocurre?"
                  maxLength={120}
                  autoFocus
                  className={cn(CAMPO_PAPEL, 'h-11 text-[15px] font-medium')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="corcho-desc" className="text-[13px] text-zinc-700">
                  Descripción <span className="font-normal text-zinc-400">(opcional)</span>
                </Label>
                <Textarea
                  id="corcho-desc"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={4}
                  placeholder="Contá un poco más: qué problema resuelve, cómo se haría…"
                  className={cn(CAMPO_PAPEL, 'resize-none text-sm leading-relaxed')}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="rounded-full text-zinc-700 hover:bg-zinc-900/[0.06] hover:text-zinc-950"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || !titulo.trim()}
                className={cn(BOTON_TINTA, 'gap-1.5 px-5')}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className="h-4 w-4" />}
                {editId ? 'Guardar' : 'Pinchar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmPapel
        open={!!ideaABorrar}
        onOpenChange={(open) => {
          if (!open) setIdeaABorrar(null);
        }}
        title="¿Borrar la idea?"
        description={
          ideaABorrar
            ? `“${ideaABorrar.titulo}” se borra junto con sus votos y comentarios.`
            : ''
        }
        confirmLabel="Borrar"
        onConfirm={confirmarBorrarIdea}
      />

      <ConfirmPapel
        open={!!comentarioABorrar}
        onOpenChange={(open) => {
          if (!open) setComentarioABorrar(null);
        }}
        title="¿Borrar el comentario?"
        description="No se puede recuperar."
        confirmLabel="Borrar"
        onConfirm={confirmarBorrarComentario}
      />
    </div>
  );
}

/** Vidrio claro sobre el corcho: se lee bien y deja ver la textura. */
const PANEL =
  'rounded-2xl border border-white/60 bg-[#fffaf0]/80 shadow-[0_10px_30px_-12px_rgba(40,20,5,0.45)] backdrop-blur-xl';

function chipClaro(activo: boolean) {
  return cn(
    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors',
    activo
      ? 'bg-zinc-950 text-white shadow-sm'
      : 'text-zinc-700 hover:bg-zinc-900/[0.07] hover:text-zinc-950',
  );
}

function SegmentadoClaro<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-zinc-900/[0.07] p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          aria-pressed={valor === o.valor}
          className={cn(
            'h-7 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors',
            valor === o.valor
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-950',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
