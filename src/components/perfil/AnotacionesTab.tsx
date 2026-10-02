import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef({ titulo: '', contenido: '', fijada: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getNotasPersonales();
      setNotas(list);
      if (list.length === 0) {
        setSelectedId(null);
      } else if (!selectedId || !list.some((n) => n.id === selectedId)) {
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
  }, [selectedId, toast]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const n = notas.find((x) => x.id === selectedId);
    if (!n) {
      setTitulo('');
      setContenido('');
      setFijada(false);
      draftRef.current = { titulo: '', contenido: '', fijada: false };
      return;
    }
    setTitulo(n.titulo);
    setContenido(n.contenido);
    setFijada(n.fijada);
    draftRef.current = { titulo: n.titulo, contenido: n.contenido, fijada: n.fijada };
    setSaveState('saved');
  }, [selectedId, notas]);

  const persist = useCallback(
    async (id: string, patch: { titulo: string; contenido: string; fijada: boolean }) => {
      setSaveState('saving');
      try {
        const updated = await actualizarNotaPersonal({
          id,
          titulo: patch.titulo,
          contenido: patch.contenido,
          fijada: patch.fijada,
        });
        setNotas((prev) => prev.map((n) => (n.id === id ? updated : n)));
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        toast({
          title: 'No se pudo guardar',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const scheduleSave = useCallback(
    (id: string, patch: { titulo: string; contenido: string; fijada: boolean }) => {
      draftRef.current = patch;
      setSaveState('pending');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persist(id, patch);
      }, 800);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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

  const handleNueva = async () => {
    try {
      const creada = await crearNotaPersonal();
      setNotas((prev) => [creada, ...prev]);
      setSelectedId(creada.id);
      setSaveState('saved');
    } catch (err) {
      toast({
        title: 'No se pudo crear la anotación',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const handleBorrar = async () => {
    if (!selectedId) return;
    const n = notas.find((x) => x.id === selectedId);
    const label = n?.titulo?.trim() || 'Sin título';
    if (!window.confirm(`¿Borrar la anotación “${label}”?`)) return;
    try {
      await borrarNotaPersonal(selectedId);
      const rest = notas.filter((x) => x.id !== selectedId);
      setNotas(rest);
      setSelectedId(rest[0]?.id ?? null);
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const previewHtml = useMemo(
    () => (contenido.trim() ? renderCentroChatMarkdown(contenido) : ''),
    [contenido],
  );

  const saveLabel =
    saveState === 'pending'
      ? 'Guardando…'
      : saveState === 'saving'
        ? 'Guardando…'
        : saveState === 'saved'
          ? 'Guardado'
          : saveState === 'error'
            ? 'Error al guardar'
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
                      onClick={() => setSelectedId(n.id)}
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
                  onClick={() => void handleBorrar()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {saveLabel ? (
                  <span
                    className={cn(
                      'text-[10px] uppercase tracking-wide',
                      saveState === 'error' ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {saveLabel}
                  </span>
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
    </div>
  );
}
