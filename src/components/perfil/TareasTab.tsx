import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { toastConDeshacer } from '@/components/ui/toastDeshacer'
import { ConfirmDialog } from '@/components/programas/ConfirmDialog'
import { cn } from '@/lib/utils/cn'
import { BotonIcono, Panel, PanelTitle, Vacio } from '@/components/perfil/perfilUi'
import { describirFrecuencia } from '@/lib/equipo/tareasRecurrentes'
import { addDaysToKey } from '@/lib/equipo/fechas'
import { ocurrenciasPendientes } from '@/lib/equipo/tareasAgenda'
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'
import {
  actualizarTareaRecurrente,
  borrarTareaRecurrente,
  crearTareaRecurrente,
  getRegistrosTareas,
  getTareasRecurrentes,
  pausarTareaRecurrente,
  reordenarTareasRecurrentes,
  type TareaRecurrente,
  type TareaRegistro,
} from '@/lib/supabase/services/equipoTareas.service'
import {
  getAusenciasDeUsuario,
  getFeriados,
} from '@/lib/supabase/services/equipoCalendario.service'
import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin'
import {
  TareaRecurrenteDialog,
  type TareaRecurrenteFormValue,
} from '@/components/perfil/TareaRecurrenteDialog'

function fechaUnicaTarea(t: TareaRecurrente): string {
  return t.fecha ?? t.semanaInicio ?? ''
}

function tareaToAgenda(t: TareaRecurrente) {
  return {
    id: t.id,
    titulo: t.titulo,
    frecuencia: t.frecuencia,
    diasSemana: t.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
    diaMes: t.diaMes,
    semanaInicio: t.semanaInicio,
    fecha: t.fecha,
    activa: t.activa,
    creadaEl: t.createdAt.slice(0, 10),
  }
}

function SortableTareaRow({
  tarea,
  canEdit,
  creadoPorLabel,
  onEdit,
  onPause,
  onDelete,
}: {
  tarea: TareaRecurrente
  canEdit: boolean
  creadoPorLabel: string | null
  onEdit: () => void
  onPause: () => void
  onDelete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tarea.id,
    disabled: !canEdit || !tarea.activa,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-2 rounded-2xl bg-white/[0.03] py-2.5 pl-2 pr-2.5',
        !tarea.activa && 'opacity-55',
        isDragging && 'relative z-10 bg-white/[0.08] shadow-xl'
      )}
    >
      {canEdit && tarea.activa ? (
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="mt-0.5 w-6 shrink-0" />
      )}

      <div className="min-w-0 flex-1 py-0.5">
        <p className={cn('text-sm text-foreground', !tarea.activa && 'line-through')}>
          {tarea.titulo}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {describirFrecuencia({
            frecuencia: tarea.frecuencia,
            diasSemana: tarea.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
            diaMes: tarea.diaMes,
            semanaInicio: tarea.semanaInicio,
            fecha: tarea.fecha,
          })}
          {creadoPorLabel ? (
            <span className="text-[#f6c46b]/90"> · sumada por {creadoPorLabel}</span>
          ) : null}
        </p>
        {tarea.descripcion ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
            {tarea.descripcion}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
        <BotonIcono label={tarea.activa ? 'Pausar' : 'Reactivar'} onClick={onPause}>
          {tarea.activa ? <Pause /> : <Play />}
        </BotonIcono>
        {canEdit ? (
          <>
            <BotonIcono label="Editar" onClick={onEdit}>
              <Pencil />
            </BotonIcono>
            <BotonIcono label="Borrar" peligro onClick={onDelete}>
              <Trash2 />
            </BotonIcono>
          </>
        ) : null}
      </div>
    </div>
  )
}

export interface TareasTabProps {
  /** Dueño de las tareas. */
  userId: string
  personaNombre: string
  /** Usuario logueado. */
  viewerUserId: string
  esAdmin: boolean
  /** Nombres de creadores (userId → nombre corto). */
  nombresPorUserId?: Record<string, string>
  /** Si true, el admin está gestionando tareas de otra persona (muestra "Sumar tarea"). */
  modoAdmin?: boolean
  /** Tras crear una tarea para otro (notificación). */
  onTareaAsignada?: (tarea: TareaRecurrente) => void
  /** Cambia al llegar desde una notificación estando ya en la pestaña (EQ-R21). */
  refreshKey?: number
}

export function TareasTab({
  userId,
  personaNombre,
  viewerUserId,
  esAdmin,
  nombresPorUserId = {},
  modoAdmin = false,
  onTareaAsignada,
  refreshKey = 0,
}: TareasTabProps) {
  const { toast } = useToast()
  const adminNombre = useNombreAdmin()
  const [tareas, setTareas] = useState<TareaRecurrente[]>([])
  const [registros, setRegistros] = useState<TareaRegistro[]>([])
  const [feriados, setFeriados] = useState<string[]>([])
  const [misAusencias, setMisAusencias] = useState<
    Array<{
      tipo: 'vacaciones' | 'cambio_dia'
      fechaDesde: string
      fechaHasta: string
    }>
  >([])
  const [loading, setLoading] = useState(true)
  const [hechasAbiertas, setHechasAbiertas] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editando, setEditando] = useState<TareaRecurrente | null>(null)
  const [borrarTarea, setBorrarTarea] = useState<TareaRecurrente | null>(null)
  const [saving, setSaving] = useState(false)

  const hoy = todayArgentinaDateKey()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const anio = Number(hoy.slice(0, 4))
      const [t, f, misAus] = await Promise.all([
        getTareasRecurrentes(userId),
        getFeriados({ desde: `${anio - 1}-01-01`, hasta: `${anio + 1}-12-31` }),
        getAusenciasDeUsuario(userId),
      ])
      const regs = await getRegistrosTareas(t.map(x => x.id))
      setTareas(t)
      setRegistros(regs)
      setFeriados(f.map(x => x.fecha))
      setMisAusencias(
        misAus.map(a => ({
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
        }))
      )
    } catch (err) {
      toast({
        title: 'No se pudieron cargar las tareas',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [userId, hoy, toast])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const canEditTarea = useCallback(
    (t: TareaRecurrente) => esAdmin || t.userId === viewerUserId,
    [esAdmin, viewerUserId]
  )

  const activas = useMemo(() => tareas.filter(t => t.activa), [tareas])
  const pausadas = useMemo(() => tareas.filter(t => !t.activa), [tareas])
  const activasRecurrentes = useMemo(
    () => activas.filter(t => t.frecuencia !== 'unica'),
    [activas]
  )
  const activasUnicas = useMemo(
    () => activas.filter(t => t.frecuencia === 'unica'),
    [activas]
  )

  const { unicasProximas, unicasHechas } = useMemo(() => {
    const limiteHechas = addDaysToKey(hoy, -30)
    const limiteVisible = addDaysToKey(hoy, -7)
    const proximas: TareaRecurrente[] = []
    const hechas: TareaRecurrente[] = []
    const regsHecha = new Set(
      registros
        .filter(r => r.estado === 'hecha')
        .map(r => `${r.tareaId}|${r.fechaProgramada}`)
    )

    for (const t of activasUnicas) {
      const f = fechaUnicaTarea(t)
      if (!f) continue
      if (regsHecha.has(`${t.id}|${f}`)) {
        if (f >= limiteHechas) hechas.push(t)
        continue
      }
      if (f >= hoy) {
        proximas.push(t)
        continue
      }
      const pendiente = ocurrenciasPendientes({
        tareas: [tareaToAgenda(t)],
        registros: registros.map(r => ({
          tareaId: r.tareaId,
          fechaProgramada: r.fechaProgramada,
          estado: r.estado,
          fechaDestino: r.fechaDestino,
        })),
        desde: f,
        hasta: hoy,
        hoy,
        feriados,
        misAusencias,
      }).some(
        o =>
          o.estado === 'atrasada' ||
          o.estado === 'pendiente' ||
          o.estado === 'movida'
      )
      if (pendiente || f >= limiteVisible) proximas.push(t)
    }

    hechas.sort((a, b) => fechaUnicaTarea(b).localeCompare(fechaUnicaTarea(a)))
    proximas.sort((a, b) =>
      fechaUnicaTarea(a).localeCompare(fechaUnicaTarea(b))
    )
    return { unicasProximas: proximas, unicasHechas: hechas }
  }, [activasUnicas, registros, hoy, feriados, misAusencias])

  const gruposActivas = useMemo(() => {
    const order: Array<'diaria' | 'semanal' | 'quincenal' | 'mensual'> = [
      'diaria',
      'semanal',
      'quincenal',
      'mensual',
    ]
    const labels: Record<string, string> = {
      diaria: 'Diarias',
      semanal: 'Semanales',
      quincenal: 'Cada 15 días',
      mensual: 'Mensuales',
    }
    return order
      .map(f => ({
        frecuencia: f,
        label: labels[f],
        items: activasRecurrentes.filter(t => t.frecuencia === f),
      }))
      .filter(g => g.items.length > 0)
  }, [activasRecurrentes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeT = activasRecurrentes.find(t => t.id === String(active.id))
    if (!activeT) return

    const groupItems = activasRecurrentes.filter(
      t => t.frecuencia === activeT.frecuencia
    )
    const ids = groupItems.map(t => t.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const reorderedGroup = arrayMove(groupItems, oldIndex, newIndex)
    const freqOrder: Array<'diaria' | 'semanal' | 'quincenal' | 'mensual'> = [
      'diaria',
      'semanal',
      'quincenal',
      'mensual',
    ]
    const nextRecurrentes = freqOrder.flatMap(f =>
      f === activeT.frecuencia
        ? reorderedGroup
        : activasRecurrentes.filter(t => t.frecuencia === f)
    )
    setTareas([...nextRecurrentes, ...activasUnicas, ...pausadas])

    const editable = nextRecurrentes
      .map((t, index) => ({ id: t.id, orden: index, can: canEditTarea(t) }))
      .filter(x => x.can)
      .map(({ id, orden }) => ({ id, orden }))
    if (editable.length === 0) return
    try {
      await reordenarTareasRecurrentes(editable)
    } catch (err) {
      toast({
        title: 'No se pudo reordenar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
      void load()
    }
  }

  const openCreate = () => {
    setEditando(null)
    setDialogOpen(true)
  }

  const openEdit = (t: TareaRecurrente) => {
    setEditando(t)
    setDialogOpen(true)
  }

  const handleSave = async (value: TareaRecurrenteFormValue) => {
    setSaving(true)
    try {
      if (editando) {
        await actualizarTareaRecurrente({ id: editando.id, ...value })
        toast({ title: 'Tarea actualizada' })
      } else {
        const maxOrden = tareas.reduce((m, t) => Math.max(m, t.orden), -1)
        const created = await crearTareaRecurrente({
          userId,
          ...value,
          orden: maxOrden + 1,
        })
        toast({ title: 'Tarea creada' })
        if (modoAdmin && created.userId !== viewerUserId) {
          onTareaAsignada?.(created)
        }
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePause = async (t: TareaRecurrente) => {
    try {
      await pausarTareaRecurrente(t.id, !t.activa)
      toast({ title: t.activa ? 'Tarea pausada' : 'Tarea reactivada' })
      await load()
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const solicitarBorrarTarea = (t: TareaRecurrente) => {
    setBorrarTarea(t)
  }

  const confirmarBorrarTarea = () => {
    const t = borrarTarea
    if (!t) return
    void (async () => {
      const snap = {
        userId: t.userId,
        titulo: t.titulo,
        descripcion: t.descripcion,
        frecuencia: t.frecuencia,
        diasSemana: t.diasSemana,
        diaMes: t.diaMes,
        semanaInicio: t.semanaInicio,
        fecha: t.fecha,
        orden: t.orden,
        activa: t.activa,
      }
      try {
        await borrarTareaRecurrente(t.id)
        toastConDeshacer('Tarea borrada', async () => {
          try {
            const nueva = await crearTareaRecurrente({
              userId: snap.userId,
              titulo: snap.titulo,
              descripcion: snap.descripcion,
              frecuencia: snap.frecuencia,
              diasSemana: snap.diasSemana,
              diaMes: snap.diaMes,
              semanaInicio: snap.semanaInicio,
              fecha: snap.fecha,
              orden: snap.orden,
            })
            if (!snap.activa) {
              await pausarTareaRecurrente(nueva.id, false)
            }
            toast({ title: 'Tarea restaurada' })
            await load()
          } catch (err) {
            toast({
              title: 'No se pudo deshacer',
              description: err instanceof Error ? err.message : undefined,
              variant: 'destructive',
            })
          }
        })
        await load()
      } catch (err) {
        toast({
          title: 'No se pudo borrar',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      }
    })()
  }

  const creadorLabel = (t: TareaRecurrente): string | null => {
    if (t.creadoPor === t.userId) return null
    const nombre = nombresPorUserId[t.creadoPor]
    if (!nombre) return adminNombre
    // Primer nombre
    return nombre.split(/\s+/)[0] || nombre
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tareas…
      </div>
    )
  }

  const fila = (t: TareaRecurrente) => (
    <SortableTareaRow
      key={t.id}
      tarea={t}
      canEdit={canEditTarea(t)}
      creadoPorLabel={creadorLabel(t)}
      onEdit={() => openEdit(t)}
      onPause={() => void handlePause(t)}
      onDelete={() => solicitarBorrarTarea(t)}
    />
  )

  const vacio = activas.length === 0 && pausadas.length === 0

  // En el diálogo del admin (ancho acotado) va todo en una columna.
  const grilla = modoAdmin
    ? 'grid gap-4'
    : 'grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {modoAdmin
            ? `Lo que tiene que hacer ${personaNombre.split(/\s+/)[0]}. Lo que sumes le llega como aviso.`
            : 'Lo que tenés que hacer y cada cuánto. Se marcan como hechas desde Mi día.'}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 gap-1.5 rounded-full bg-white/[0.06] px-4 hover:bg-white/[0.1]"
          onClick={openCreate}
        >
          <Plus className="h-3.5 w-3.5" />
          {modoAdmin ? 'Sumar tarea' : 'Nueva tarea'}
        </Button>
      </div>

      {vacio ? (
        <Vacio
          accion={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full bg-white/[0.06] hover:bg-white/[0.1]"
              onClick={openCreate}
            >
              Crear la primera
            </Button>
          }
        >
          Todavía no hay tareas. Anotá lo que hay que hacer cada día, semana o mes.
        </Vacio>
      ) : (
        <div className={grilla}>
          {unicasProximas.length > 0 ? (
            <Panel>
              <PanelTitle
                title="Un solo día"
                sub={`${unicasProximas.length} ${unicasProximas.length === 1 ? 'próxima' : 'próximas'}`}
              />
              <div className="space-y-1.5">{unicasProximas.map(fila)}</div>
            </Panel>
          ) : null}

          {gruposActivas.map(g => (
            <Panel key={g.frecuencia}>
              <PanelTitle
                title={g.label}
                sub={`${g.items.length} ${g.items.length === 1 ? 'tarea' : 'tareas'} · arrastrá para ordenar`}
              />
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={e => void handleDragEnd(e)}
              >
                <SortableContext
                  items={g.items.map(t => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">{g.items.map(fila)}</div>
                </SortableContext>
              </DndContext>
            </Panel>
          ))}

          {unicasHechas.length > 0 ? (
            <Panel>
              <PanelTitle
                title="Hechas"
                sub="De un solo día, últimos 30 días"
                right={
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setHechasAbiertas(v => !v)}
                  >
                    {hechasAbiertas ? 'Ocultar' : `Ver (${unicasHechas.length})`}
                  </button>
                }
              />
              {hechasAbiertas ? (
                <div className="space-y-1.5">{unicasHechas.map(fila)}</div>
              ) : null}
            </Panel>
          ) : null}

          {pausadas.length > 0 ? (
            <Panel>
              <PanelTitle
                title="Pausadas"
                sub="No aparecen en Mi día hasta que las reactives"
              />
              <div className="space-y-1.5">{pausadas.map(fila)}</div>
            </Panel>
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

      <ConfirmDialog
        open={!!borrarTarea}
        onOpenChange={(open) => {
          if (!open) setBorrarTarea(null)
        }}
        title="Borrar tarea"
        description={
          borrarTarea
            ? `¿Borrar la tarea “${borrarTarea.titulo}”?`
            : ''
        }
        confirmLabel="Borrar"
        variant="destructive"
        onConfirm={confirmarBorrarTarea}
      />
    </div>
  )
}
