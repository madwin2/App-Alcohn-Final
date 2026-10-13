import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin';
import { cn } from '@/lib/utils/cn';
import { BotonIcono, CAMPO, DIALOGO, Estado, Etiqueta, Panel, PanelTitle, type Tono } from '@/components/perfil/perfilUi';
import { parseOrderDateLocal } from '@/lib/utils/format';
import {
  labelEstadoObjetivo,
  particionarObjetivos,
  siguienteEstadoObjetivo,
  type EstadoObjetivo,
  type TipoObjetivo,
} from '@/lib/equipo/crecimiento';
import {
  actualizarObjetivo,
  borrarObjetivo,
  crearObjetivo,
  getMisObjetivos,
  type ObjetivoPersonal,
} from '@/lib/supabase/services/equipoObjetivos.service';

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

function fmtFechaKey(key: string): string {
  try {
    return parseOrderDateLocal(key).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return key;
  }
}

const ESTADO_TONO: Record<EstadoObjetivo, Tono> = {
  pendiente: 'neutro',
  en_curso: 'aviso',
  logrado: 'ok',
  abandonado: 'neutro',
};

type FormState = {
  id: string | null;
  tipo: TipoObjetivo;
  titulo: string;
  descripcion: string;
  estado: EstadoObjetivo;
  fechaObjetivo: Date | undefined;
};

const emptyForm = (tipo: TipoObjetivo): FormState => ({
  id: null,
  tipo,
  titulo: '',
  descripcion: '',
  estado: 'pendiente',
  fechaObjetivo: undefined,
});

function ObjetivoCard({
  item,
  readOnly,
  onEdit,
  onAvanzar,
  onBorrar,
}: {
  item: ObjetivoPersonal;
  readOnly?: boolean;
  onEdit?: () => void;
  onAvanzar?: () => void;
  onBorrar?: () => void;
}) {
  const next = siguienteEstadoObjetivo(item.estado);
  return (
    <li className={cn('group rounded-2xl bg-white/[0.03] px-4 py-3 text-sm', item.estado === 'abandonado' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground">{item.titulo}</p>
          {item.descripcion ? (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.descripcion}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Estado tono={ESTADO_TONO[item.estado]} className="text-xs text-muted-foreground">
              {item.estado === 'logrado' && item.logradoAt
                ? `Logrado el ${fmtFecha(item.logradoAt)}`
                : labelEstadoObjetivo(item.estado)}
            </Estado>
            {item.fechaObjetivo && item.estado !== 'logrado' ? (
              <span>Meta: {fmtFechaKey(item.fechaObjetivo)}</span>
            ) : null}
          </div>
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
            {next ? (
              <BotonIcono label={`Pasar a ${labelEstadoObjetivo(next)}`} onClick={onAvanzar}>
                <Check />
              </BotonIcono>
            ) : null}
            <BotonIcono label="Editar" onClick={onEdit}>
              <Pencil />
            </BotonIcono>
            <BotonIcono label="Borrar" peligro onClick={onBorrar}>
              <Trash2 />
            </BotonIcono>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Columna({
  titulo,
  sub,
  tipo,
  activos,
  logrados,
  readOnly,
  onNuevo,
  onEdit,
  onAvanzar,
  onBorrar,
}: {
  titulo: string;
  sub?: string;
  tipo: TipoObjetivo;
  activos: ObjetivoPersonal[];
  logrados: ObjetivoPersonal[];
  readOnly?: boolean;
  onNuevo?: (tipo: TipoObjetivo) => void;
  onEdit?: (o: ObjetivoPersonal) => void;
  onAvanzar?: (o: ObjetivoPersonal) => void;
  onBorrar?: (o: ObjetivoPersonal) => void;
}) {
  return (
    <Panel>
      <PanelTitle
        title={titulo}
        sub={sub}
        right={
          !readOnly && onNuevo ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-full bg-white/[0.06] px-3 hover:bg-white/[0.1]"
              onClick={() => onNuevo(tipo)}
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </Button>
          ) : null
        }
      />
      {activos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay nada acá.</p>
      ) : (
        <ul className="space-y-1.5">
          {activos.map((o) => (
            <ObjetivoCard
              key={o.id}
              item={o}
              readOnly={readOnly}
              onEdit={() => onEdit?.(o)}
              onAvanzar={() => onAvanzar?.(o)}
              onBorrar={() => onBorrar?.(o)}
            />
          ))}
        </ul>
      )}
      {logrados.length > 0 ? (
        <div className="mt-6">
          <Etiqueta>Logrados · {logrados.length}</Etiqueta>
          <ul className="space-y-1.5">
            {logrados.map((o) => (
              <ObjetivoCard
                key={o.id}
                item={o}
                readOnly={readOnly}
                onEdit={() => onEdit?.(o)}
                onBorrar={() => onBorrar?.(o)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

export interface CrecimientoTabProps {
  /** Si se pasa con items, solo lectura (admin viendo a otro). */
  readOnly?: boolean;
  /** Lista ya cargada (admin); si no, carga las propias. */
  items?: ObjetivoPersonal[];
}

export function CrecimientoTab({ readOnly, items: itemsProp }: CrecimientoTabProps) {
  const { toast } = useToast();
  const adminNombre = useNombreAdmin();
  const [items, setItems] = useState<ObjetivoPersonal[]>(itemsProp ?? []);
  const [loading, setLoading] = useState(!itemsProp);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm('objetivo'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (itemsProp) setItems(itemsProp);
  }, [itemsProp]);

  const load = useCallback(async () => {
    if (readOnly && itemsProp) return;
    setLoading(true);
    try {
      setItems(await getMisObjetivos());
    } catch (err) {
      toast({
        title: 'No se pudieron cargar los objetivos',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, readOnly, itemsProp]);

  useEffect(() => {
    if (!itemsProp) void load();
  }, [load, itemsProp]);

  const parts = useMemo(() => particionarObjetivos(items), [items]);

  const openNuevo = (tipo: TipoObjetivo) => {
    setForm(emptyForm(tipo));
    setDialogOpen(true);
  };

  const openEdit = (o: ObjetivoPersonal) => {
    setForm({
      id: o.id,
      tipo: o.tipo,
      titulo: o.titulo,
      descripcion: o.descripcion ?? '',
      estado: o.estado,
      fechaObjetivo: o.fechaObjetivo ? parseOrderDateLocal(o.fechaObjetivo) : undefined,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const titulo = form.titulo.trim();
    if (!titulo) {
      toast({ title: 'Escribí un título', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        const prev = items.find((x) => x.id === form.id);
        const estadoChanged = prev && prev.estado !== form.estado;
        const updated = await actualizarObjetivo({
          id: form.id,
          titulo,
          descripcion: form.descripcion,
          ...(estadoChanged
            ? { estado: form.estado, estadoAnterior: prev.estado }
            : {}),
          fechaObjetivo: dateToKey(form.fechaObjetivo),
        });
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created = await crearObjetivo({
          tipo: form.tipo,
          titulo,
          descripcion: form.descripcion,
          estado: form.estado,
          fechaObjetivo: dateToKey(form.fechaObjetivo),
        });
        setItems((prev) => [created, ...prev]);
      }
      setDialogOpen(false);
      toast({ title: form.id ? 'Guardado' : 'Agregado' });
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

  const handleAvanzar = async (o: ObjetivoPersonal) => {
    const next = siguienteEstadoObjetivo(o.estado);
    if (!next) return;
    try {
      const updated = await actualizarObjetivo({
        id: o.id,
        estado: next,
        estadoAnterior: o.estado,
      });
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      toast({
        title: 'No se pudo actualizar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const handleBorrar = async (o: ObjetivoPersonal) => {
    if (!window.confirm(`¿Borrar “${o.titulo}”?`)) return;
    try {
      await borrarObjetivo(o.id);
      setItems((prev) => prev.filter((x) => x.id !== o.id));
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
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
      {!readOnly ? (
        <p className="text-sm text-muted-foreground">Esto lo ven vos y {adminNombre}.</p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Columna
          titulo="Mis objetivos"
          sub="Lo que querés lograr en tu trabajo"
          tipo="objetivo"
          activos={parts.objetivosActivos as ObjetivoPersonal[]}
          logrados={parts.objetivosLogrados as ObjetivoPersonal[]}
          readOnly={readOnly}
          onNuevo={openNuevo}
          onEdit={openEdit}
          onAvanzar={(o) => void handleAvanzar(o)}
          onBorrar={(o) => void handleBorrar(o)}
        />
        <Columna
          titulo="Quiero aprender"
          sub="Temas, herramientas u oficios"
          tipo="aprender"
          activos={parts.aprenderActivos as ObjetivoPersonal[]}
          logrados={parts.aprenderLogrados as ObjetivoPersonal[]}
          readOnly={readOnly}
          onNuevo={openNuevo}
          onEdit={openEdit}
          onAvanzar={(o) => void handleAvanzar(o)}
          onBorrar={(o) => void handleBorrar(o)}
        />
      </div>

      {!readOnly ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className={cn(DIALOGO, 'sm:max-w-md')}>
            <DialogHeader>
              <DialogTitle>{form.id ? 'Editar' : 'Agregar'}</DialogTitle>
              <DialogDescription>
                {form.tipo === 'aprender' ? 'Algo que querés aprender.' : 'Un objetivo personal.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-1">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ej.: Mejorar en Aspire"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción (opcional)</Label>
                <Textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="min-h-[72px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={form.estado}
                  onValueChange={(v) => setForm((f) => ({ ...f, estado: v as EstadoObjetivo }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="en_curso">En curso</SelectItem>
                    <SelectItem value="logrado">Logrado</SelectItem>
                    <SelectItem value="abandonado">Abandonado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha objetivo (opcional)</Label>
                <div className={CAMPO}>
                  <DatePicker
                    date={form.fechaObjetivo}
                    onDateChange={(d) => setForm((f) => ({ ...f, fechaObjetivo: d }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
