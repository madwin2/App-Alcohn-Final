import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils/cn';
import {
  describirFrecuencia,
  lunesDeSemana,
  ocurrenciasEnSemana,
} from '@/lib/equipo/tareasRecurrentes';
import { addDaysToKey } from '@/lib/equipo/fechas';
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate';
import {
  actualizarTareaRecurrente,
  borrarTareaRecurrente,
  crearTareaRecurrente,
  getTareasRecurrentes,
  pausarTareaRecurrente,
  reordenarTareasRecurrentes,
  type TareaRecurrente,
} from '@/lib/supabase/services/equipoTareas.service';
import { getFeriados } from '@/lib/supabase/services/equipoCalendario.service';
import {
  TareaRecurrenteDialog,
  type TareaRecurrenteFormValue,
} from '@/components/perfil/TareaRecurrenteDialog';

const DIA_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

function SortableTareaRow({
  tarea,
  canEdit,
  creadoPorLabel,
  onEdit,
  onPause,
  onDelete,
}: {
  tarea: TareaRecurrente;
  canEdit: boolean;
  creadoPorLabel: string | null;
  onEdit: () => void;
  onPause: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarea.id,
    disabled: !canEdit || !tarea.activa,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5',
        !tarea.activa && 'opacity-50',
        isDragging && 'opacity-60 shadow-lg border-primary/40',
      )}
    >
      {canEdit && tarea.activa ? (
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-white/5 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="mt-0.5 w-6" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-medium text-white', !tarea.activa && 'line-through')}>
            {tarea.titulo}
          </p>
          {creadoPorLabel ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
              Sumada por {creadoPorLabel}
            </span>
          ) : null}
          {!tarea.activa ? (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Pausada
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {describirFrecuencia({
            frecuencia: tarea.frecuencia,
            diasSemana: tarea.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
            diaMes: tarea.diaMes,
            semanaInicio: tarea.semanaInicio,
          })}
        </p>
        {tarea.descripcion ? (
          <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2">{tarea.descripcion}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={tarea.activa ? 'Pausar' : 'Reactivar'}
          onClick={onPause}
          aria-label={tarea.activa ? 'Pausar' : 'Reactivar'}
        >
          {tarea.activa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        {canEdit ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              aria-label="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label="Borrar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export interface TareasTabProps {
  /** Dueño de las tareas. */
  userId: string;
  personaNombre: string;
  /** Usuario logueado. */
  viewerUserId: string;
  esAdmin: boolean;
  /** Nombres de creadores (userId → nombre corto). */
  nombresPorUserId?: Record<string, string>;
  /** Si true, el admin está gestionando tareas de otra persona (muestra "Sumar tarea"). */
  modoAdmin?: boolean;
  /** Tras crear una tarea para otro (notificación). */
  onTareaAsignada?: (tarea: TareaRecurrente) => void;
}

export function TareasTab({
  userId,
  personaNombre,
  viewerUserId,
  esAdmin,
  nombresPorUserId = {},
  modoAdmin = false,
  onTareaAsignada,
}: TareasTabProps) {
  const { toast } = useToast();
  const [tareas, setTareas] = useState<TareaRecurrente[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<'lista' | 'semana'>('lista');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<TareaRecurrente | null>(null);
  const [saving, setSaving] = useState(false);

  const hoy = todayArgentinaDateKey();
  const [lunes, setLunes] = useState(() => lunesDeSemana(hoy));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const anio = Number(hoy.slice(0, 4));
      const [t, f] = await Promise.all([
        getTareasRecurrentes(userId),
        getFeriados({ desde: `${anio - 1}-01-01`, hasta: `${anio + 1}-12-31` }),
      ]);
      setTareas(t);
      setFeriados(f.map((x) => x.fecha));
    } catch (err) {
      toast({
        title: 'No se pudieron cargar las tareas',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, hoy, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEditTarea = useCallback(
    (t: TareaRecurrente) => esAdmin || t.userId === viewerUserId,
    [esAdmin, viewerUserId],
  );

  const activas = useMemo(() => tareas.filter((t) => t.activa), [tareas]);
  const pausadas = useMemo(() => tareas.filter((t) => !t.activa), [tareas]);

  const gruposActivas = useMemo(() => {
    const order: Array<'diaria' | 'semanal' | 'quincenal' | 'mensual'> = [
      'diaria',
      'semanal',
      'quincenal',
      'mensual',
    ];
    const labels: Record<string, string> = {
      diaria: 'Diarias',
      semanal: 'Semanales',
      quincenal: 'Cada 15 días',
      mensual: 'Mensuales',
    };
    return order
      .map((f) => ({
        frecuencia: f,
        label: labels[f],
        items: activas.filter((t) => t.frecuencia === f),
      }))
      .filter((g) => g.items.length > 0);
  }, [activas]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeT = activas.find((t) => t.id === String(active.id));
    if (!activeT) return;

    const groupItems = activas.filter((t) => t.frecuencia === activeT.frecuencia);
    const ids = groupItems.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reorderedGroup = arrayMove(groupItems, oldIndex, newIndex);
    const freqOrder: Array<'diaria' | 'semanal' | 'quincenal' | 'mensual'> = [
      'diaria',
      'semanal',
      'quincenal',
      'mensual',
    ];
    const nextActivas = freqOrder.flatMap((f) =>
      f === activeT.frecuencia
        ? reorderedGroup
        : activas.filter((t) => t.frecuencia === f),
    );
    setTareas([...nextActivas, ...pausadas]);

    const editable = nextActivas
      .map((t, index) => ({ id: t.id, orden: index, can: canEditTarea(t) }))
      .filter((x) => x.can)
      .map(({ id, orden }) => ({ id, orden }));
    if (editable.length === 0) return;
    try {
      await reordenarTareasRecurrentes(editable);
    } catch (err) {
      toast({
        title: 'No se pudo reordenar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
      void load();
    }
  };

  const openCreate = () => {
    setEditando(null);
    setDialogOpen(true);
  };

  const openEdit = (t: TareaRecurrente) => {
    setEditando(t);
    setDialogOpen(true);
  };

  const handleSave = async (value: TareaRecurrenteFormValue) => {
    setSaving(true);
    try {
      if (editando) {
        await actualizarTareaRecurrente({ id: editando.id, ...value });
        toast({ title: 'Tarea actualizada' });
      } else {
        const maxOrden = tareas.reduce((m, t) => Math.max(m, t.orden), -1);
        const created = await crearTareaRecurrente({
          userId,
          ...value,
          orden: maxOrden + 1,
        });
        toast({ title: 'Tarea creada' });
        if (modoAdmin && created.userId !== viewerUserId) {
          onTareaAsignada?.(created);
        }
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async (t: TareaRecurrente) => {
    try {
      await pausarTareaRecurrente(t.id, !t.activa);
      toast({ title: t.activa ? 'Tarea pausada' : 'Tarea reactivada' });
      await load();
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (t: TareaRecurrente) => {
    if (!window.confirm(`¿Borrar la tarea “${t.titulo}”?`)) return;
    try {
      await borrarTareaRecurrente(t.id);
      toast({ title: 'Tarea borrada' });
      await load();
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const semanaCols = useMemo(() => {
    return DIA_LABELS.map((label, i) => {
      const fecha = addDaysToKey(lunes, i);
      const items = activas.flatMap((t) => {
        const oc = ocurrenciasEnSemana(
          {
            frecuencia: t.frecuencia,
            diasSemana: t.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
            diaMes: t.diaMes,
            semanaInicio: t.semanaInicio,
            activa: t.activa,
          },
          lunes,
          feriados,
        ).filter((o) => o.fecha === fecha);
        return oc.map((o) => ({ tarea: t, esFeriado: o.esFeriado }));
      });
      return { label, fecha, items };
    });
  }, [lunes, activas, feriados]);

  const creadorLabel = (t: TareaRecurrente): string | null => {
    if (t.creadoPor === t.userId) return null;
    const nombre = nombresPorUserId[t.creadoPor];
    if (!nombre) return 'Julián';
    // Primer nombre
    return nombre.split(/\s+/)[0] || nombre;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tareas…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              vista === 'lista' ? 'bg-white/10 text-white' : 'text-muted-foreground',
            )}
            onClick={() => setVista('lista')}
          >
            Por frecuencia
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              vista === 'semana' ? 'bg-white/10 text-white' : 'text-muted-foreground',
            )}
            onClick={() => setVista('semana')}
          >
            Mi semana
          </button>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {modoAdmin ? 'Sumar tarea' : 'Nueva tarea'}
        </Button>
      </div>

      {vista === 'semana' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLunes(addDaysToKey(lunes, -7))}
            >
              ← Semana
            </Button>
            <p className="text-xs text-muted-foreground">
              {lunes.slice(8).replace('-', '/')} – {addDaysToKey(lunes, 4).slice(8).replace('-', '/')}
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLunes(lunesDeSemana(hoy))}
              >
                Hoy
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLunes(addDaysToKey(lunes, 7))}
              >
                Semana →
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {semanaCols.map((col) => (
              <div
                key={col.fecha}
                className={cn(
                  'rounded-lg border border-white/10 bg-white/[0.02] p-2 min-h-[100px]',
                  col.fecha === hoy && 'border-primary/40',
                )}
              >
                <p className="text-[11px] font-medium text-muted-foreground">
                  {col.label}{' '}
                  <span className="text-white/70">{col.fecha.slice(8)}</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {col.items.length === 0 ? (
                    <li className="text-[10px] text-muted-foreground/60">—</li>
                  ) : (
                    col.items.map(({ tarea, esFeriado }) => (
                      <li
                        key={`${tarea.id}-${col.fecha}`}
                        className={cn(
                          'rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-white',
                          esFeriado && 'opacity-60',
                        )}
                      >
                        {tarea.titulo}
                        {esFeriado ? (
                          <span className="ml-1 text-[9px] text-amber-300">feriado</span>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {activas.length === 0 && pausadas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-muted-foreground">
              Todavía no hay tareas. Creá la primera para anotar lo que hay que hacer cada semana.
            </div>
          ) : (
            <div className="space-y-4">
              {gruposActivas.map((g) => (
                <div key={g.frecuencia} className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </p>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => void handleDragEnd(e)}
                  >
                    <SortableContext
                      items={g.items.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {g.items.map((t) => (
                          <SortableTareaRow
                            key={t.id}
                            tarea={t}
                            canEdit={canEditTarea(t)}
                            creadoPorLabel={creadorLabel(t)}
                            onEdit={() => openEdit(t)}
                            onPause={() => void handlePause(t)}
                            onDelete={() => void handleDelete(t)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ))}
            </div>
          )}

          {pausadas.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Pausadas
              </p>
              {pausadas.map((t) => (
                <SortableTareaRow
                  key={t.id}
                  tarea={t}
                  canEdit={canEditTarea(t)}
                  creadoPorLabel={creadorLabel(t)}
                  onEdit={() => openEdit(t)}
                  onPause={() => void handlePause(t)}
                  onDelete={() => void handleDelete(t)}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      <TareaRecurrenteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editando}
        personaNombre={personaNombre}
        saving={saving}
        onSave={handleSave}
      />
    </div>
  );
}
