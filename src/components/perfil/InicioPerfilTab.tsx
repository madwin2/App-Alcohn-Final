import { useCallback, useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'

import { Cake, Loader2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { AccionesTarea } from '@/components/perfil/AccionesTarea'

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

function etiquetaOcurrencia(oc: OcurrenciaAgenda): string {
  if (oc.estado === 'atrasada' && oc.atrasadaDesde) {
    const veces =
      oc.vecesAtrasada && oc.vecesAtrasada > 1
        ? ` (${oc.vecesAtrasada} veces)`
        : ''

    return `${oc.titulo} · atrasada${veces}`
  }

  return oc.titulo
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

  const [vacOpen, setVacOpen] = useState(false)

  const [cambioOpen, setCambioOpen] = useState(false)

  const [tareaOpen, setTareaOpen] = useState(false)

  const [savingTarea, setSavingTarea] = useState(false)

  const [savingAusencia, setSavingAusencia] = useState(false)

  const adminNombre = useNombreAdmin()

  const load = useCallback(async () => {
    setLoading(true)

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
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tu día…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Mi día</h2>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setTareaOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Tarea para hoy
          </Button>
        </div>

        {ocurrenciasHoy.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tenés tareas pendientes para hoy.
          </p>
        ) : (
          <ul className="space-y-3">
            {ocurrenciasHoy.map(oc => (
              <li
                key={`${oc.tareaId}-${oc.fechaProgramada}`}

                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <p
                  className={cn(
                    'text-sm text-white',

                    oc.estado === 'atrasada' && 'text-amber-100'
                  )}
                >
                  {etiquetaOcurrencia(oc)}
                </p>

                <div className="mt-2">
                  <AccionesTarea
                    ocurrencia={oc}

                    feriados={feriados.map(x => x.fecha)}

                    misAusencias={misAusenciasAgenda}

                    onChanged={load}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setVacOpen(true)}
          >
            Vacaciones
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setCambioOpen(true)}
          >
            Cambio de día
          </Button>

          <Button
            type="button"

            size="sm"

            variant="secondary"

            onClick={() => onGoTab('lo-mio', 'necesidades')}
          >
            Pedir algo
          </Button>

          <Button type="button" size="sm" variant="secondary" asChild>
            <Link to="/corcho?pinchar=1">Pinchar una idea</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Hoy no están
          </p>

          {!diaLaboral.esLaborable ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {diaLaboral.mensaje}
            </p>
          ) : faltanHoy.length === 0 ? (
            <p className="mt-1 text-sm text-white">Todos en la oficina</p>
          ) : (
            <p className="mt-1 text-sm text-white">
              {faltanHoy

                .map(f => {
                  const corto = f.nombre.split(/\s+/)[0]

                  return f.motivo === 'cambio_dia'
                    ? `${corto} (cambio de día)`
                    : corto
                })

                .join(', ')}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Vacaciones
          </p>

          <p className="mt-1 text-sm text-white">
            {saldo
              ? `${saldo.disponiblesHoy} días · ${saldo.planificados} planificados`
              : perfil.vacacionesSinLimite
                ? 'Sin límite'
                : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 sm:col-span-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Cake className="h-3 w-3" />
            Cumpleaños
          </p>

          {cumples.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Nada en los próximos 14 días.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {cumples.map(c => (
                <li
                  key={`${c.nombre}-${c.fecha}`}

                  className={cn(c.esHoy && 'font-medium text-amber-200')}
                >
                  {c.esHoy ? '🎂 ' : ''}

                  {c.nombre.split(/\s+/)[0]}

                  {c.esHoy ? ' · ¡Hoy!' : c.etiqueta ? ` · ${c.etiqueta}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Corcho
          </p>

          <p className="mt-1 text-sm text-white">
            {ideasNuevas > 0 ? `${ideasNuevas} ideas nuevas` : 'Al día'}
          </p>

          <Button
            type="button"
            variant="link"
            className="mt-1 h-auto px-0 text-xs"
            asChild
          >
            <Link to="/corcho?soloNuevas=1">Ver corcho</Link>
          </Button>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Feedback
          </p>

          <p className="mt-1 text-sm text-white">
            {feedbackNoLeido > 0
              ? `${feedbackNoLeido} sin leer`
              : 'Nada pendiente'}
          </p>

          {feedbackNoLeido > 0 ? (
            <Button
              type="button"

              variant="link"

              className="mt-1 h-auto px-0 text-xs"

              onClick={() => onGoTab('lo-mio', 'feedback')}
            >
              Abrir
            </Button>
          ) : null}
        </div>

        {esAdmin ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Equipo
            </p>

            <Button
              type="button"

              variant="link"

              className="mt-1 h-auto px-0 text-xs"

              onClick={() => onGoTab('equipo')}
            >
              Gestionar equipo
            </Button>
          </div>
        ) : null}
      </section>

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
