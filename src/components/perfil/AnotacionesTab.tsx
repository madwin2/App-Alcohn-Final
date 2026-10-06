import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      <p className="text-xs text-muted-foreground">🔒 Solo vos ves tus anotaciones.</p>

      <div className="flex flex-col gap-4 lg:flex-row lg:min-h-[420px]">
        <div className="flex w-full flex-col gap-2 lg:w-[280px] lg:shrink-0">
          <div className="flex gap-2">
            <Input
              placeholder="Buscar…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-9 text-sm"
            />
            <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => void handleNueva()}>
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nueva anotación</span>
            </Button>
          </div>

          <ul className="max-h-[360px] flex-1 overflow-y-auto rounded-xl border border-white/10">
            {lista.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
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
                        'flex w-full items-start gap-2 border-b border-white/[0.06] px-3 py-2.5 text-left text-xs transition-colors last:border-0',
                        selectedId === n.id ? 'bg-white/10 text-white' : 'text-muted-foreground hover:bg-white/[0.04]',
                      )}
                    >
                      {full?.fijada ? (
                        <Pin className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/90" />
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <span className="line-clamp-2 font-medium">{label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="flex min-h-[320px] flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.02] p-4">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <p>Creá una anotación para empezar.</p>
              <Button type="button" size="sm" onClick={() => void handleNueva()}>
                Nueva anotación
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                  value={titulo}
                  onChange={(e) => handleFieldChange('titulo', e.target.value)}
                  placeholder="Título"
                  className="h-9 flex-1 min-w-[160px] text-sm font-medium"
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
                      'text-[10px] uppercase tracking-wide',
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
                  className="prose prose-invert prose-sm max-w-none flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-3"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground">Vacío</p>' }}
                />
              ) : (
                <Textarea
                  value={contenido}
                  onChange={(e) => handleFieldChange('contenido', e.target.value)}
                  placeholder="Escribí en Markdown…"
                  className="min-h-[280px] flex-1 resize-y font-mono text-sm"
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
