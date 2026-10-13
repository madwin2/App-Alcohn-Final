import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { cn } from '@/lib/utils/cn';
import {
  colaAutoguardadoVacia,
  encolarAutoguardado,
  flushAutoguardado,
  notaVacia,
  respuestaAutoguardadoVigente,
  type EstadoColaAutoguardado,
  type PatchAutoguardado,
} from '@/lib/equipo/autoguardado';
import { filtrarYOrdenarNotas } from '@/lib/equipo/notasPersonales';
import { renderCentroChatMarkdown } from '@/lib/centro/markdown';
import {
  actualizarNotaPersonal,
  borrarNotaPersonal,
  crearNotaPersonal,
  getNotasPersonales,
  type NotaPersonal,
} from '@/lib/supabase/services/equipoNotas.service';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function AnotacionesTab() {
  const { toast } = useToast();
  const [notas, setNotas] = useState<NotaPersonal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [fijada, setFijada] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colaRef = useRef<EstadoColaAutoguardado>(colaAutoguardadoVacia());
  const selectedIdRef = useRef<string | null>(null);
  const editorRef = useRef({ titulo: '', contenido: '', fijada: false });

  selectedIdRef.current = selectedId;
  editorRef.current = { titulo, contenido, fijada };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getNotasPersonales();
      setNotas(list);
      if (list.length === 0) {
        setSelectedId(null);
      } else if (!selectedIdRef.current || !list.some((n) => n.id === selectedIdRef.current)) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      toast({
        title: 'No se pudieron cargar las anotaciones',
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

  const lista = useMemo(
    () =>
      filtrarYOrdenarNotas(
        notas.map((n) => ({
          id: n.id,
          titulo: n.titulo,
          contenido: n.contenido,
          fijada: n.fijada,
          updatedAt: n.updatedAt,
        })),
        busqueda,
      ),
    [notas, busqueda],
  );

  // Solo al cambiar de nota: no pisar el editor cuando vuelve un persist.
  useEffect(() => {
    const n = notas.find((x) => x.id === selectedId);
    if (!n) {
      setTitulo('');
      setContenido('');
      setFijada(false);
      setSaveState('idle');
      return;
    }
    setTitulo(n.titulo);
    setContenido(n.contenido);
    setFijada(n.fijada);
    setSaveState('saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo selectedId
  }, [selectedId]);

  const persist = useCallback(
    async (id: string, patch: PatchAutoguardado, version: number) => {
      setSaveState('saving');
      try {
        const updated = await actualizarNotaPersonal({
          id,
          titulo: patch.titulo,
          contenido: patch.contenido,
          fijada: patch.fijada,
        });
        setNotas((prev) => prev.map((n) => (n.id === id ? updated : n)));
        if (respuestaAutoguardadoVigente(colaRef.current, id, version)) {
          setSaveState('saved');
        }
      } catch (err) {
        if (respuestaAutoguardadoVigente(colaRef.current, id, version)) {
          setSaveState('error');
        }
        toast({
          title: 'Error al guardar · Reintentar',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const flushPendiente = useCallback(
    (id?: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const { estado, enviado } = flushAutoguardado(colaRef.current, id);
      colaRef.current = estado;
      if (enviado) {
        void persist(enviado.id, enviado.patch, enviado.version);
      }
    },
    [persist],
  );

  const scheduleSave = useCallback(
    (id: string, patch: PatchAutoguardado) => {
      colaRef.current = encolarAutoguardado(colaRef.current, id, patch);
      setSaveState('pending');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const { estado, enviado } = flushAutoguardado(colaRef.current, id);
        colaRef.current = estado;
        if (enviado) void persist(enviado.id, enviado.patch, enviado.version);
      }, 800);
    },
    [persist],
  );

  const borrarSiVacia = useCallback(
    async (id: string, tituloNota: string, contenidoNota: string) => {
      if (!notaVacia(tituloNota, contenidoNota)) return false;
      try {
        await borrarNotaPersonal(id);
        setNotas((prev) => prev.filter((n) => n.id !== id));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const selectNota = useCallback(
    async (nextId: string | null) => {
      const prevId = selectedIdRef.current;
      if (prevId && prevId !== nextId) {
        flushPendiente(prevId);
        const draft = editorRef.current;
        const borrada = await borrarSiVacia(prevId, draft.titulo, draft.contenido);
        if (borrada && nextId === prevId) {
          setSelectedId(null);
          return;
        }
      }
      setSelectedId(nextId);
    },
    [borrarSiVacia, flushPendiente],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPendiente();
    };
    const onPageHide = () => flushPendiente();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flushPendiente();
    };
  }, [flushPendiente]);

  const handleFieldChange = (
    field: 'titulo' | 'contenido' | 'fijada',
    value: string | boolean,
  ) => {
    if (!selectedId) return;
    const next = {
      titulo: field === 'titulo' ? (value as string) : titulo,
      contenido: field === 'contenido' ? (value as string) : contenido,
      fijada: field === 'fijada' ? (value as boolean) : fijada,
    };
    if (field === 'titulo') setTitulo(next.titulo);
    if (field === 'contenido') setContenido(next.contenido);
    if (field === 'fijada') setFijada(next.fijada);
    scheduleSave(selectedId, next);
  };

  const handleRetry = () => {
    if (!selectedId) return;
    scheduleSave(selectedId, { titulo, contenido, fijada });
  };

  const handleNueva = async () => {
    await selectNota(null);
    flushPendiente();
    try {
      const creada = await crearNotaPersonal();
      setNotas((prev) => [creada, ...prev]);
      setSelectedId(creada.id);
      setTitulo('');
      setContenido('');
      setFijada(false);
      setSaveState('saved');
    } catch (err) {
      toast({
        title: 'No se pudo crear la anotación',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const solicitarBorrar = () => {
    if (!selectedId) return;
    setConfirmarBorrar(true);
  };

  const ejecutarBorrar = () => {
    const id = selectedId;
    if (!id) return;
    flushPendiente(id);
    void (async () => {
      try {
        await borrarNotaPersonal(id);
        const rest = notas.filter((x) => x.id !== id);
        setNotas(rest);
        setSelectedId(rest[0]?.id ?? null);
        toast({ title: 'Anotación borrada' });
      } catch (err) {
        toast({
          title: 'No se pudo borrar',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      }
    })();
  };

  const labelBorrarAnotacion = useMemo(() => {
    if (!selectedId) return '';
    const n = notas.find((x) => x.id === selectedId);
    return n?.titulo?.trim() || 'Sin título';
  }, [notas, selectedId]);

  const previewHtml = useMemo(
    () => (contenido.trim() ? renderCentroChatMarkdown(contenido) : ''),
    [contenido],
  );

  const saveLabel =
    saveState === 'pending' || saveState === 'saving'
      ? 'Guardando…'
      : saveState === 'saved'
        ? 'Guardado'
        : saveState === 'error'
          ? 'Error al guardar · Reintentar'
          : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando anotaciones…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-3.5" />
        Solo vos ves tus anotaciones, ni siquiera el admin.
      </p>

      <div className="grid gap-4 lg:h-[calc(100vh-330px)] lg:min-h-[520px] lg:grid-cols-[320px_1fr] 2xl:grid-cols-[380px_1fr]">
        <div className="flex min-h-0 flex-col rounded-3xl bg-white/[0.035] p-3">
          <div className="flex gap-2 p-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Buscar…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="h-9 w-full rounded-full bg-white/[0.05] pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:bg-white/[0.08]"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06] hover:bg-white/[0.1]"
              onClick={() => void handleNueva()}
              title="Nueva anotación"
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nueva anotación</span>
            </Button>
          </div>

          <ul className="mt-2 max-h-[360px] flex-1 space-y-0.5 overflow-y-auto lg:max-h-none">
            {lista.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                {notas.length === 0 ? 'Todavía no hay anotaciones.' : 'Nada coincide con la búsqueda.'}
              </li>
            ) : (
              lista.map((n) => {
                const full = notas.find((x) => x.id === n.id);
                const label = n.titulo.trim() || 'Sin título';
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void selectNota(n.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors',
                        selectedId === n.id
                          ? 'bg-white/[0.09] text-foreground'
                          : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                      )}
                    >
                      {full?.fijada ? (
                        <Pin className="mt-1 h-3 w-3 shrink-0 text-[#f6c46b]" />
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <span className="line-clamp-2">{label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="flex min-h-[420px] min-w-0 flex-col rounded-3xl bg-white/[0.035] p-5 sm:p-6">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <p>Creá una anotación para empezar.</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full bg-white/[0.06] hover:bg-white/[0.1]"
                onClick={() => void handleNueva()}
              >
                Nueva anotación
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  value={titulo}
                  onChange={(e) => handleFieldChange('titulo', e.target.value)}
                  placeholder="Título"
                  className="h-10 min-w-[160px] flex-1 bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  title={fijada ? 'Desfijar' : 'Fijar arriba'}
                  onClick={() => handleFieldChange('fijada', !fijada)}
                >
                  {fijada ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  title={preview ? 'Editar' : 'Vista previa'}
                  onClick={() => setPreview((p) => !p)}
                >
                  {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={solicitarBorrar}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {saveLabel ? (
                  <button
                    type="button"
                    disabled={saveState !== 'error'}
                    onClick={handleRetry}
                    className={cn(
                      'px-1 text-xs',
                      saveState === 'error'
                        ? 'cursor-pointer text-destructive underline-offset-2 hover:underline'
                        : 'text-muted-foreground',
                    )}
                  >
                    {saveLabel}
                  </button>
                ) : null}
              </div>

              {preview ? (
                <div
                  className="prose prose-invert prose-sm max-w-none flex-1 overflow-y-auto rounded-2xl bg-black/20 p-4"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground">Vacío</p>' }}
                />
              ) : (
                <Textarea
                  value={contenido}
                  onChange={(e) => handleFieldChange('contenido', e.target.value)}
                  placeholder="Escribí en Markdown…"
                  className="min-h-[280px] flex-1 resize-none rounded-2xl border-0 bg-black/20 p-4 font-mono text-sm leading-relaxed focus-visible:ring-1 focus-visible:ring-white/15 focus-visible:ring-offset-0"
                />
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmarBorrar}
        onOpenChange={setConfirmarBorrar}
        title="Borrar anotación"
        description={`¿Borrar la anotación “${labelBorrarAnotacion}”?`}
        confirmLabel="Borrar"
        variant="destructive"
        onConfirm={ejecutarBorrar}
      />
    </div>
  );
}
