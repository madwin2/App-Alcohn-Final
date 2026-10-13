import { useCallback, useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'

import {
  ArrowUpRight,
  Cake,
  PackagePlus,
  Loader2,
  Palmtree,
  Pin,
  Plus,
  Repeat,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

import { AccionesTarea } from '@/components/perfil/AccionesTarea'

import { AccionRapida, Estado, Panel } from '@/components/perfil/perfilUi'

import { CargarVacacionesDialog } from '@/components/perfil/CargarVacacionesDialog'

import { CambioDiaDialog } from '@/components/perfil/CambioDiaDialog'

import {
  TareaRecurrenteDialog,
  type TareaRecurrenteFormValue,
} from '@/components/perfil/TareaRecurrenteDialog'

import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'

import { addDaysToKey } from '@/lib/equipo/fechas'

import {
  ocurrenciasPendientes,
  type OcurrenciaAgenda,
} from '@/lib/equipo/tareasAgenda'

import {
  cartelDiaLaboral,
  quienesFaltanHoy,
} from '@/lib/equipo/calendarioEquipo'

import {
  esCumpleaniosHoy,
  formatearCumpleaniosSinAnio,
  proximoCumpleanios,
} from '@/lib/equipo/cumpleanios'

import { cn } from '@/lib/utils/cn'

import {
  getMiembrosEquipo,
  getUsuariosSinPerfil,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service'

import {
  crearCambioDia,
  crearVacaciones,
  getAusencias,
  getAusenciasDeUsuario,
  getFeriados,
} from '@/lib/supabase/services/equipoCalendario.service'

import { notifyVacacionesCargadas } from '@/lib/notificaciones/events'

import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin'

import {
  crearTareaRecurrente,
  getRegistrosTareas,
  getTareasRecurrentes,
} from '@/lib/supabase/services/equipoTareas.service'

import { contarIdeasCorchoNuevas } from '@/lib/supabase/services/equipoCorcho.service'

import { useToast } from '@/components/ui/use-toast'

interface InicioPerfilTabProps {
  perfil: PerfilEquipo

  esAdmin: boolean

  saldo: { disponiblesHoy: number; planificados: number } | null

  feedbackNoLeido: number

  refreshKey?: number

  onGoTab: (tab: string, sub?: string) => void

  onAusenciasChanged?: () => void
}

function tareaToAgenda(
  t: Awaited<ReturnType<typeof getTareasRecurrentes>>[number]
) {
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

function etiquetaAtraso(oc: OcurrenciaAgenda): string {
  const veces =
    oc.vecesAtrasada && oc.vecesAtrasada > 1 ? ` (${oc.vecesAtrasada} veces)` : ''

  return `Atrasada${veces}`
}

function fechaLargaHoy(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00`)

  if (Number.isNaN(d.getTime())) return hoy

  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function InicioPerfilTab({
  perfil,

  esAdmin,

  saldo,

  feedbackNoLeido,

  refreshKey = 0,

  onGoTab,

  onAusenciasChanged,
}: InicioPerfilTabProps) {
  const { toast } = useToast()

  const hoy = todayArgentinaDateKey()

  const [loading, setLoading] = useState(true)

  const [miembros, setMiembros] = useState<PerfilEquipo[]>([])

  const [feriados, setFeriados] = useState<
    Array<{ fecha: string; nombre: string }>
  >([])

  const [misAusenciasAgenda, setMisAusenciasAgenda] = useState<
    Array<{
      tipo: 'vacaciones' | 'cambio_dia'
      fechaDesde: string
      fechaHasta: string
    }>
  >([])

  const [ocurrenciasHoy, setOcurrenciasHoy] = useState<OcurrenciaAgenda[]>([])

  const [faltanHoy, setFaltanHoy] = useState<
    Array<{
      userId: string
      nombre: string
      motivo: 'vacaciones' | 'cambio_dia'
    }>
  >([])

  const [cumples, setCumples] = useState<
    Array<{
      nombre: string
      fecha: string
      esHoy: boolean
      etiqueta: string | null
    }>
  >([])

  const [ideasNuevas, setIdeasNuevas] = useState(0)

  const [sinPerfil, setSinPerfil] = useState(0)

  const [vacOpen, setVacOpen] = useState(false)

  const [cambioOpen, setCambioOpen] = useState(false)

  const [tareaOpen, setTareaOpen] = useState(false)

  const [savingTarea, setSavingTarea] = useState(false)

  const [savingAusencia, setSavingAusencia] = useState(false)

  const adminNombre = useNombreAdmin()

  // El spinner solo en la primera carga; las recargas (volver a la pestaña) son silenciosas.
  const load = useCallback(async () => {

    try {
      const anio = Number(hoy.slice(0, 4))

      const [m, f, ausHoy, misAus, tareas, ideasCount] = await Promise.all([
        getMiembrosEquipo(),

        getFeriados({ desde: `${anio - 1}-01-01`, hasta: `${anio + 1}-12-31` }),

        getAusencias({ desde: hoy, hasta: hoy }),

        getAusenciasDeUsuario(perfil.userId),

        getTareasRecurrentes(perfil.userId),

        contarIdeasCorchoNuevas(),
      ])

      const activos = new Set(m.map(x => x.userId))

      setMiembros(m)

      const feriadosList = f.map(x => ({ fecha: x.fecha, nombre: x.nombre }))

      setFeriados(feriadosList)

      setIdeasNuevas(ideasCount)

      const misAgenda = misAus.map(a => ({
        tipo: a.tipo,

        fechaDesde: a.fechaDesde,

        fechaHasta: a.fechaHasta,
      }))

      setMisAusenciasAgenda(misAgenda)

      const ids = tareas.map(t => t.id)

      const registros = await getRegistrosTareas(ids)

      const agendaTareas = tareas.filter(t => t.activa).map(tareaToAgenda)

      const feriadosSet = feriadosList.map(x => x.fecha)

      const pendientes = ocurrenciasPendientes({
        tareas: agendaTareas,

        registros: registros.map(r => ({
          tareaId: r.tareaId,

          fechaProgramada: r.fechaProgramada,

          estado: r.estado,

          fechaDestino: r.fechaDestino,
        })),

        desde: addDaysToKey(hoy, -45),

        hasta: hoy,

        hoy,

        feriados: feriadosSet,

        misAusencias: misAgenda,
      }).filter(
        o =>
          o.fechaVisible === hoy &&
          o.estado !== 'hecha' &&
          o.estado !== 'no_hecha' &&
          o.estado !== 'no_aplica'
      )

      setOcurrenciasHoy(pendientes)

      setFaltanHoy(
        quienesFaltanHoy({
          hoy,

          personas: m.map(p => ({
            userId: p.userId,

            nombre: p.nombre,

            color: p.color,

            fechaNacimiento: p.fechaNacimiento,
          })),

          ausencias: ausHoy

            .filter(a => activos.has(a.userId) && a.userId !== perfil.userId)

            .map(a => ({
              id: a.id,

              userId: a.userId,

              tipo: a.tipo,

              fechaDesde: a.fechaDesde,

              fechaHasta: a.fechaHasta,

              fechaRecupero: a.fechaRecupero,
            })),
        })
      )

      const hastaCumple = addDaysToKey(hoy, 14)

      const cumpleList: Array<{
        nombre: string
        fecha: string
        esHoy: boolean
        etiqueta: string | null
      }> = []

      for (const p of m.filter(x => activos.has(x.userId))) {
        if (!p.fechaNacimiento) continue

        const prox = proximoCumpleanios(p.fechaNacimiento, hoy)

        if (!prox || prox > hastaCumple) continue

        cumpleList.push({
          nombre: p.nombre,

          fecha: prox,

          esHoy: esCumpleaniosHoy(p.fechaNacimiento, hoy),

          etiqueta: formatearCumpleaniosSinAnio(p.fechaNacimiento),
        })
      }

      cumpleList.sort((a, b) => a.fecha.localeCompare(b.fecha))

      setCumples(cumpleList)
    } catch {
      /* best-effort */
    } finally {
      setLoading(false)
    }
  }, [perfil.userId, hoy])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    if (!esAdmin) return

    void getUsuariosSinPerfil()
      .then(u => setSinPerfil(u.length))

      .catch(() => setSinPerfil(0))
  }, [esAdmin, refreshKey])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }

    document.addEventListener('visibilitychange', onVis)

    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const diaLaboral = useMemo(
    () => cartelDiaLaboral(hoy, feriados),
    [hoy, feriados]
  )

  const handleVacaciones = async (input: {
    fechaDesde: string
    fechaHasta: string
    nota: string | null
  }) => {
    setSavingAusencia(true)
    try {
      const creada = await crearVacaciones({
        userId: perfil.userId,
        ...input,
      })
      const destinatarios = miembros
        .filter(m => m.userId !== perfil.userId && m.activo)
        .map(m => m.userId)
      notifyVacacionesCargadas({
        nombre: perfil.nombre.split(' ')[0] || perfil.nombre,
        fechaDesde: input.fechaDesde,
        fechaHasta: input.fechaHasta,
        destinatarioUserIds: destinatarios,
        ausenciaId: creada.id,
      })
      toast({ title: 'Vacaciones cargadas' })
      setVacOpen(false)
      await load()
      onAusenciasChanged?.()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSavingAusencia(false)
    }
  }

  const handleCambio = async (input: {
    fecha: string
    fechaRecupero: string | null
    nota: string | null
  }) => {
    setSavingAusencia(true)
    try {
      await crearCambioDia({
        userId: perfil.userId,
        ...input,
      })
      toast({ title: 'Cambio de día cargado' })
      setCambioOpen(false)
      await load()
      onAusenciasChanged?.()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSavingAusencia(false)
    }
  }

  const handleSaveTarea = async (value: TareaRecurrenteFormValue) => {
    setSavingTarea(true)

    try {
      await crearTareaRecurrente({
        userId: perfil.userId,
        ...value,
        orden: 999,
      })

      toast({ title: 'Tarea creada' })

      setTareaOpen(false)

      await load()
    } catch (err) {
      toast({
        title: 'No se pudo crear',

        description: err instanceof Error ? err.message : undefined,

        variant: 'destructive',
      })
    } finally {
      setSavingTarea(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tu día…
      </div>
    )
  }

  const primerNombre = (n: string) => n.split(/\s+/)[0] || n

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      {/* ---------- Hoy: tareas + acciones ---------- */}
      <Panel className="flex flex-col xl:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] first-letter:uppercase text-muted-foreground">
              {fechaLargaHoy(hoy)}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {!diaLaboral.esLaborable
                ? diaLaboral.mensaje
                : ocurrenciasHoy.length === 0
                  ? 'Nada pendiente para hoy'
                  : ocurrenciasHoy.length === 1
                    ? '1 tarea para hoy'
                    : `${ocurrenciasHoy.length} tareas para hoy`}
            </h2>
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 rounded-full bg-white/[0.06] px-4 hover:bg-white/[0.1]"
            onClick={() => setTareaOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Tarea para hoy
          </Button>
        </div>

        {ocurrenciasHoy.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {ocurrenciasHoy.map(oc => (
              <li
                key={`${oc.tareaId}-${oc.fechaProgramada}`}
                className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{oc.titulo}</p>
                  {oc.estado === 'atrasada' ? (
                    <Estado tono="aviso" className="mt-1 text-xs text-muted-foreground">
                      {etiquetaAtraso(oc)}
                    </Estado>
                  ) : null}
                </div>

                <AccionesTarea
                  ocurrencia={oc}
                  feriados={feriados.map(x => x.fecha)}
                  misAusencias={misAusenciasAgenda}
                  onChanged={load}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {diaLaboral.esLaborable
              ? 'Lo que agendes para hoy (o lo que quedó atrasado) aparece acá.'
              : 'Si igual querés anotar algo, sumá una tarea.'}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-8">
          <AccionRapida icon={<Palmtree />} onClick={() => setVacOpen(true)}>
            Vacaciones
          </AccionRapida>
          <AccionRapida icon={<Repeat />} onClick={() => setCambioOpen(true)}>
            Cambio de día
          </AccionRapida>
          <AccionRapida icon={<PackagePlus />} onClick={() => onGoTab('lo-mio', 'necesidades')}>
            Pedir algo
          </AccionRapida>
          <Link
            to="/corcho?pinchar=1"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-sm text-foreground/90 transition-colors hover:bg-white/[0.1] hover:text-foreground"
          >
            <Pin className="size-4 text-muted-foreground" />
            Pinchar una idea
          </Link>
        </div>
      </Panel>

      {/* ---------- Resumen del equipo y lo mío ---------- */}
      <Panel className="flex flex-col divide-y divide-white/[0.06] py-1 sm:py-1 xl:col-span-4">
        <div className="grid grid-cols-2 gap-6 py-5">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Hoy no están</p>
            {!diaLaboral.esLaborable ? (
              <p className="mt-1 text-sm text-muted-foreground">No es día laboral</p>
            ) : faltanHoy.length === 0 ? (
              <>
                <p className="mt-1 text-lg font-semibold tracking-tight">Todos</p>
                <p className="text-xs text-muted-foreground">están en la oficina</p>
              </>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {faltanHoy.map(f => (
                  <li key={f.userId} className="text-sm">
                    {primerNombre(f.nombre)}
                    <span className="text-muted-foreground">
                      {f.motivo === 'cambio_dia' ? ' · cambio de día' : ' · vacaciones'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Tus vacaciones</p>
            {saldo ? (
              <>
                <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
                  {saldo.disponiblesHoy} {saldo.disponiblesHoy === 1 ? 'día' : 'días'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {saldo.planificados > 0
                    ? `${saldo.planificados} ya planificados`
                    : 'disponibles'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {perfil.vacacionesSinLimite ? 'Sin límite' : '—'}
              </p>
            )}
          </div>
        </div>

        <div className="py-5">
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Cake className="size-3.5" />
            Cumpleaños
          </p>
          {cumples.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Ninguno en los próximos 14 días.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {cumples.map(c => (
                <li
                  key={`${c.nombre}-${c.fecha}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className={cn(c.esHoy && 'font-medium text-[#f6c46b]')}>
                    {primerNombre(c.nombre)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.esHoy ? '¡Hoy!' : c.etiqueta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="py-3">
          <div className="-mx-2 grid grid-cols-2 gap-2">
          <Link
            to={ideasNuevas > 0 ? '/corcho?soloNuevas=1' : '/corcho'}
            className="group rounded-2xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
          >
            <p className="flex items-center justify-between text-[13px] text-muted-foreground">
              Corcho
              <ArrowUpRight className="size-3.5 opacity-40 transition-opacity group-hover:opacity-80" />
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {ideasNuevas > 0 ? `${ideasNuevas} ideas nuevas` : 'Al día'}
            </p>
          </Link>

          <button
            type="button"
            onClick={() => onGoTab('lo-mio', 'feedback')}
            className="group rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
          >
            <p className="flex items-center justify-between text-[13px] text-muted-foreground">
              Feedback
              <ArrowUpRight className="size-3.5 opacity-40 transition-opacity group-hover:opacity-80" />
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {feedbackNoLeido > 0 ? `${feedbackNoLeido} sin leer` : 'Al día'}
            </p>
          </button>
          </div>
        </div>

        {esAdmin ? (
          <div className="py-3">
          <button
            type="button"
            onClick={() => onGoTab('equipo')}
            className="group -mx-2 block w-[calc(100%+1rem)] rounded-2xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
          >
            <p className="flex items-center justify-between text-[13px] text-muted-foreground">
              Equipo
              <ArrowUpRight className="size-3.5 opacity-40 transition-opacity group-hover:opacity-80" />
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {miembros.length} {miembros.length === 1 ? 'integrante' : 'integrantes'}
            </p>
            {sinPerfil > 0 ? (
              <Estado tono="aviso" className="mt-1 text-xs text-muted-foreground">
                {sinPerfil === 1
                  ? '1 usuario de la app todavía no está en el equipo'
                  : `${sinPerfil} usuarios de la app todavía no están en el equipo`}
              </Estado>
            ) : null}
          </button>
          </div>
        ) : null}
      </Panel>

      <CargarVacacionesDialog
        open={vacOpen}

        onOpenChange={setVacOpen}

        perfil={perfil}

        miembros={miembros}

        feriadosKeys={feriados.map(x => x.fecha)}

        hoy={hoy}

        saving={savingAusencia}

        esAdmin={esAdmin}

        adminNombre={adminNombre}

        onConfirm={handleVacaciones}
      />

      <CambioDiaDialog
        open={cambioOpen}

        onOpenChange={setCambioOpen}

        perfil={perfil}

        hoy={hoy}

        saving={savingAusencia}

        esAdmin={esAdmin}

        adminNombre={adminNombre}

        onConfirm={handleCambio}
      />

      <TareaRecurrenteDialog
        open={tareaOpen}

        onOpenChange={setTareaOpen}

        initial={null}

        fechaInicial={hoy}

        personaNombre={perfil.nombre}

        saving={savingTarea}

        onSave={handleSaveTarea}
      />
    </div>
  )
}
