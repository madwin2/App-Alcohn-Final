import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import { renderCentroChatMarkdown } from '@/lib/centro/markdown';
import {
  emojiTipoFeedback,
  labelTipoFeedback,
  type TipoFeedback,
} from '@/lib/equipo/feedback';
import { notifyFeedbackNuevo } from '@/lib/notificaciones/events';
import {
  actualizarFeedback,
  borrarFeedback,
  crearFeedback,
  getFeedbackDeUsuario,
  type FeedbackEquipo,
} from '@/lib/supabase/services/equipoFeedback.service';
import {
  getObjetivosDeUsuario,
  type ObjetivoPersonal,
} from '@/lib/supabase/services/equipoObjetivos.service';
import { CrecimientoTab } from '@/components/perfil/CrecimientoTab';
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';

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

interface EquipoFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfil: PerfilEquipo;
  autorNombre: string;
}

type FormState = {
  id: string | null;
  tipo: TipoFeedback;
  titulo: string;
  texto: string;
};

const emptyForm = (): FormState => ({
  id: null,
  tipo: 'felicitacion',
  titulo: '',
  texto: '',
});

export function EquipoFeedbackDialog({
  open,
  onOpenChange,
  perfil,
  autorNombre,
}: EquipoFeedbackDialogProps) {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState<FeedbackEquipo[]>([]);
  const [objetivos, setObjetivos] = useState<ObjetivoPersonal[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fb, obj] = await Promise.all([
        getFeedbackDeUsuario(perfil.userId),
        getObjetivosDeUsuario(perfil.userId),
      ]);
      setFeedback(fb);
      setObjetivos(obj);
    } catch (err) {
      toast({
        title: 'No se pudo cargar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [perfil.userId, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const openNuevo = () => {
    setForm(emptyForm());
    setPreview(false);
    setFormOpen(true);
  };

  const openEdit = (f: FeedbackEquipo) => {
    setForm({
      id: f.id,
      tipo: f.tipo,
      titulo: f.titulo ?? '',
      texto: f.texto,
    });
    setPreview(false);
    setFormOpen(true);
  };

  const handleSave = async () => {
    const texto = form.texto.trim();
    if (!texto) {
      toast({ title: 'Escribí el texto', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        const updated = await actualizarFeedback({
          id: form.id,
          tipo: form.tipo,
          titulo: form.titulo,
          texto,
        });
        setFeedback((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        toast({ title: 'Feedback actualizado' });
      } else {
        const created = await crearFeedback({
          paraUserId: perfil.userId,
          tipo: form.tipo,
          titulo: form.titulo,
          texto,
        });
        setFeedback((prev) => [created, ...prev]);
        const autorCorto = autorNombre.split(/\s+/)[0] || autorNombre;
        notifyFeedbackNuevo({
          autorNombre: autorCorto,
          tipo: form.tipo,
          destinatarioUserId: perfil.userId,
          feedbackId: created.id,
        });
        toast({ title: 'Feedback enviado', description: `${perfil.nombre} recibe un aviso.` });
      }
      setFormOpen(false);
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

  const handleBorrar = async (f: FeedbackEquipo) => {
    if (!window.confirm('¿Borrar este feedback?')) return;
    try {
      await borrarFeedback(f.id);
      setFeedback((prev) => prev.filter((x) => x.id !== f.id));
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const previewHtml = preview && form.texto.trim() ? renderCentroChatMarkdown(form.texto) : '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Feedback y crecimiento — {perfil.nombre}</DialogTitle>
            <DialogDescription>
              Dejá felicitaciones, mejoras o correcciones. Abajo ves sus objetivos (solo lectura).
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <div className="space-y-6 py-1">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Feedback</h3>
                  <Button type="button" size="sm" className="gap-1.5" onClick={openNuevo}>
                    <Plus className="h-3.5 w-3.5" />
                    Dejar feedback
                  </Button>
                </div>
                {feedback.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Todavía no le dejaste feedback.</p>
                ) : (
                  <ul className="space-y-2">
                    {feedback.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {emojiTipoFeedback(f.tipo)} {labelTipoFeedback(f.tipo)} ·{' '}
                              {fmtFecha(f.createdAt)}
                              {f.leidoAt ? '' : ' · Sin leer'}
                            </p>
                            <p className="mt-1 font-medium text-white">
                              {f.titulo?.trim() || labelTipoFeedback(f.tipo)}
                            </p>
                            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{f.texto}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(f)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => void handleBorrar(f)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2 border-t border-white/10 pt-4">
                <h3 className="text-sm font-semibold text-white">Sus objetivos (solo lectura)</h3>
                <CrecimientoTab readOnly items={objetivos} />
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.id ? 'Editar feedback' : `Dejar feedback a ${perfil.nombre}`}
            </DialogTitle>
            <DialogDescription>
              La persona recibe un aviso con el tipo (no el texto completo).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoFeedback }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="felicitacion">🎉 Felicitación</SelectItem>
                  <SelectItem value="mejora">💡 Mejora</SelectItem>
                  <SelectItem value="correccion">🔧 Corrección</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título (opcional)</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ej.: Gran trabajo con los envíos"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Texto (Markdown)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setPreview((p) => !p)}
                >
                  {preview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {preview ? 'Editar' : 'Vista previa'}
                </Button>
              </div>
              {preview ? (
                <div
                  className={cn(
                    'prose prose-invert prose-sm min-h-[120px] max-w-none rounded-md border border-white/10 bg-black/20 px-3 py-2',
                  )}
                  dangerouslySetInnerHTML={{
                    __html: previewHtml || '<p class="text-muted-foreground">Vacío</p>',
                  }}
                />
              ) : (
                <Textarea
                  value={form.texto}
                  onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
                  className="min-h-[120px] font-mono text-xs"
                  placeholder="Escribí el mensaje…"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : form.id ? 'Guardar' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
