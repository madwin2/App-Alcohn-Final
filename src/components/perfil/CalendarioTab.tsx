import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { CAMPO, DIALOGO, HOJA, Etiqueta, FILA, Panel, PanelTitle } from '@/components/perfil/perfilUi'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/use-toast'
import { toastConDeshacer } from '@/components/ui/toastDeshacer'
import { ConfirmDialog } from '@/components/programas/ConfirmDialog'
import {
  CalendarioEquipo,
  type AgregarMenuAccion,
  type VistaCalendario,
} from '@/components/perfil/CalendarioEquipo'
import { AccionesTarea } from '@/components/perfil/AccionesTarea'
import { ListaAusencias } from '@/components/perfil/ListaAusencias'
import { CargarVacacionesDialog } from '@/components/perfil/CargarVacacionesDialog'
import { CambioDiaDialog } from '@/components/perfil/CambioDiaDialog'
import { AusenciasPersonaDialog } from '@/components/perfil/AusenciasPersonaDialog'
import {
  armarMesCalendario,
  rangoGrillaMes,
  tareaEventoDesdeOcurrencia,
  type DiaCalendario,
  type EventoCalendario,
  type MesCalendario,
} from '@/lib/equipo/calendarioEquipo'
import { addDaysToKey, parseDateOnly, weekdayOfKey } from '@/lib/equipo/fechas'
import {
  describirFrecuencia,
  lunesDeSemana,
} from '@/lib/equipo/tareasRecurrentes'
import {
  ocurrenciasPendientes,
  textoAtrasadaDesde,
  type OcurrenciaAgenda,
  type TareaAgendaDef,
} from '@/lib/equipo/tareasAgenda'
import {
  todayArgentinaDateKey,
  argentinaDateParts,
} from '@/lib/utils/argentinaDate'
import { parseOrderDateLocal } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { notifyVacacionesCargadas } from '@/lib/notificaciones/events'
import {
  avisarVacacionesCambiadas,
  avisarVacacionesCanceladas,
} from '@/lib/notificaciones/vacacionesEquipo'
import { huboCambioDeFechas, puedeEditarAusencia } from '@/lib/equipo/ausencias'
import { contarDiasHabiles } from '@/lib/equipo/diasHabiles'
import { useNombreAdmin } from '@/lib/hooks/useNombreAdmin'
import {
  getMiembrosEquipo,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service'
import {
  borrarAusencia,
  crearCambioDia,
  crearFeriadoEmpresa,
  crearVacaciones,
  actualizarAusencia,
  getAusencias,
  getAusenciasDeUsuario,
  getFeriados,
  type AusenciaEquipo,
  type Feriado,
} from '@/lib/supabase/services/equipoCalendario.service'
import {
  crearTareaRecurrente,
  getRegistrosTareas,
  getTareasRecurrentes,
  type TareaRecurrente,
} from '@/lib/supabase/services/equipoTareas.service'
import {
  TareaRecurrenteDialog,
  type TareaRecurrenteFormValue,
} from '@/components/perfil/TareaRecurrenteDialog'

const LS_MOSTRAR_TAREAS = 'perfil_cal_mostrar_tareas'

function readMostrarTareas(): boolean {
  try {
    const v = localStorage.getItem(LS_MOSTRAR_TAREAS)
    if (v === '0' || v === 'false') return false
    return true
  } catch {
    return true
  }
}

function writeMostrarTareas(v: boolean) {
  try {
    localStorage.setItem(LS_MOSTRAR_TAREAS, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function tituloDia(fecha: string): string {
  const d = parseOrderDateLocal(fecha)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function mergeMeses(meses: MesCalendario[]): Map<string, DiaCalendario> {
  const map = new Map<string, DiaCalendario>()
  for (const mes of meses) {
    for (const dia of mes.dias) map.set(dia.fecha, dia)
  }
  return map
}

function diasEnRango(
  desde: string,
  hasta: string,
  porFecha: Map<string, DiaCalendario>,
  refMonth: number
): DiaCalendario[] {
  const out: DiaCalendario[] = []
  let cur = desde
  while (cur <= hasta) {
    const found = porFecha.get(cur)
    if (found) out.push(found)
    else {
      const wd = weekdayOfKey(cur)
      const parts = parseDateOnly(cur)!
      out.push({
        fecha: cur,
        weekday: wd,
        esFinDeSemana: wd === 0 || wd === 6,
        esOtroMes: parts.m !== refMonth,
        eventos: [],
      })
    }
    cur = addDaysToKey(cur, 1)
  }
  return out
}

function mapTareaAgenda(t: TareaRecurrente): TareaAgendaDef {
  return {
    id: t.id,
    titulo: t.titulo,
    frecuencia: t.frecuencia,
    diasSemana: t.diasSemana as TareaAgendaDef['diasSemana'],
    diaMes: t.diaMes,
    semanaInicio: t.semanaInicio,
    fecha: t.fecha,
    activa: t.activa,
    creadaEl: t.createdAt.slice(0, 10),
  }
}

function ocurrenciasDelDia(
  ocurrencias: OcurrenciaAgenda[],
  fecha: string
): OcurrenciaAgenda[] {
  return ocurrencias.filter(oc => {
    if (oc.estado === 'no_aplica') return oc.fechaProgramada === fecha
    return oc.fechaVisible === fecha
  })
}

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface CalendarioTabProps {
  perfil: PerfilEquipo
  esAdmin: boolean
  onAusenciasChanged?: () => void
  saldoDias?: number | null
  vacacionesSinLimite?: boolean
}

export function CalendarioTab({
  perfil,
  esAdmin,
  onAusenciasChanged,
  saldoDias,
  vacacionesSinLimite,
}: CalendarioTabProps) {
  const { toast } = useToast()
  const adminNombre = useNombreAdmin()
  const hoy = todayArgentinaDateKey()
  const parts = argentinaDateParts()
  const [year, setYear] = useState(parts.year)
  const [month, setMonth] = useState(parts.month)
  const [semanaAnchor, setSemanaAnchor] = useState(hoy)
  const [vista, setVista] = useState<VistaCalendario>('mes')
  const [vistaManual, setVistaManual] = useState(false)
  const [miembros, setMiembros] = useState<PerfilEquipo[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [ausenciasRango, setAusenciasRango] = useState<AusenciaEquipo[]>([])
  const [misAusencias, setMisAusencias] = useState<AusenciaEquipo[]>([])
  const [ausenciasTareas, setAusenciasTareas] = useState<AusenciaEquipo[]>([])
  const [tareas, setTareas] = useState<TareaRecurrente[]>([])
  const [tareasUserId, setTareasUserId] = useState(perfil.userId)
  const [loadingInicial, setLoadingInicial] = useState(true)
  const [loadingSuave, setLoadingSuave] = useState(false)
  const [filtroUserIds, setFiltroUserIds] = useState<string[] | null>(null)
  const [mostrarTareas, setMostrarTareas] = useState(readMostrarTareas)

  const [vacOpen, setVacOpen] = useState(false)
  const [cambioOpen, setCambioOpen] = useState(false)
  const [tareaOpen, setTareaOpen] = useState(false)
  const [ausenciaOtraOpen, setAusenciaOtraOpen] = useState(false)
  const [feriadoEmpresaOpen, setFeriadoEmpresaOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ausenciaABorrar, setAusenciaABorrar] = useState<AusenciaEquipo | null>(
    null
  )

  const [fechaCtx, setFechaCtx] = useState<string | undefined>()
  const [rangoCtx, setRangoCtx] = useState<
    { desde: string; hasta: string } | undefined
  >()

  const [editVac, setEditVac] = useState<{
    id: string
    fechaDesde: string
    fechaHasta: string
    nota: string | null
  } | null>(null)
  const [editCambio, setEditCambio] = useState<{
    id: string
    fecha: string
    fechaRecupero: string | null
    nota: string | null
  } | null>(null)

  const [diaSheet, setDiaSheet] = useState<string | null>(null)
  const [chipPopover, setChipPopover] = useState<{
    ev: EventoCalendario
    fecha: string
  } | null>(null)

  const [fechaEmpresa, setFechaEmpresa] = useState<Date | undefined>()
  const [nombreEmpresa, setNombreEmpresa] = useState('')
  const [savingEmpresa, setSavingEmpresa] = useState(false)

  const target = useMemo(
    () => miembros.find(m => m.userId === perfil.userId) ?? perfil,
    [miembros, perfil]
  )

  useEffect(() => {
    setTareasUserId(perfil.userId)
  }, [perfil.userId])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => {
      if (!vistaManual && mq.matches) setVista('agenda')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [vistaManual])

  const rangoCarga = useMemo(() => {
    if (vista === 'agenda') {
      return { desde: hoy, hasta: addDaysToKey(hoy, 13) }
    }
    if (vista === 'semana') {
      const lunes = lunesDeSemana(semanaAnchor)
      return { desde: addDaysToKey(lunes, -7), hasta: addDaysToKey(lunes, 13) }
    }
    const { desde, hasta } = rangoGrillaMes(year, month)
    return { desde: addDaysToKey(desde, -14), hasta: addDaysToKey(hasta, 14) }
  }, [vista, year, month, semanaAnchor, hoy])

  const load = useCallback(async () => {
    setLoadingSuave(true)
    try {
      const [m, f, aRango, aMias, aTareas, tareasDb] = await Promise.all([
        getMiembrosEquipo(),
        getFeriados({
          desde: `${year - 1}-12-01`,
          hasta: `${year + 1}-01-31`,
        }),
        getAusencias({ desde: rangoCarga.desde, hasta: rangoCarga.hasta }),
        getAusenciasDeUsuario(perfil.userId),
        getAusenciasDeUsuario(tareasUserId),
        getTareasRecurrentes(tareasUserId),
      ])
      const activos = new Set(m.map(x => x.userId))
      setMiembros(m)
      setFeriados(f)
      setAusenciasRango(aRango.filter(a => activos.has(a.userId)))
      setMisAusencias(aMias)
      setAusenciasTareas(aTareas)
      setTareas(tareasDb)
    } catch (err) {
      toast({
        title: 'No se pudo cargar el calendario',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setLoadingSuave(false)
      setLoadingInicial(false)
    }
  }, [
    year,
    rangoCarga.desde,
    rangoCarga.hasta,
    perfil.userId,
    tareasUserId,
    toast,
    hoy,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const feriadosCal = useMemo(
    () =>
      feriados.map(f => ({
        id: f.id,
        fecha: f.fecha,
        nombre: f.nombre,
        origen: f.origen,
      })),
    [feriados]
  )

  const feriadosKeys = useMemo(() => feriados.map(f => f.fecha), [feriados])

  const registrosPromise = useMemo(async () => {
    const ids = tareas.map(t => t.id)
    if (ids.length === 0) return []
    return getRegistrosTareas(ids)
  }, [tareas])

  const [registros, setRegistros] = useState<
    Awaited<ReturnType<typeof getRegistrosTareas>>
  >([])

  useEffect(() => {
    void registrosPromise.then(setRegistros).catch(() => setRegistros([]))
  }, [registrosPromise])

  const ocurrencias = useMemo(() => {
    const tareasAgenda = tareas.map(mapTareaAgenda)
    return ocurrenciasPendientes({
      tareas: tareasAgenda,
      registros: registros.map(r => ({
        tareaId: r.tareaId,
        fechaProgramada: r.fechaProgramada,
        estado: r.estado,
        fechaDestino: r.fechaDestino,
      })),
      desde: rangoCarga.desde,
      hasta: rangoCarga.hasta,
      hoy,
      feriados: feriadosKeys,
      misAusencias: ausenciasTareas.map(a => ({
        tipo: a.tipo,
        fechaDesde: a.fechaDesde,
        fechaHasta: a.fechaHasta,
      })),
    })
  }, [tareas, registros, rangoCarga, hoy, feriadosKeys, ausenciasTareas])

  const ocurrenciaPorClave = useMemo(() => {
    const m = new Map<string, OcurrenciaAgenda>()
    for (const oc of ocurrencias) {
      m.set(`${oc.tareaId}|${oc.fechaProgramada}`, oc)
    }
    return m
  }, [ocurrencias])

  const tareasEventos = useMemo(() => {
    if (!mostrarTareas) return undefined
    return ocurrencias.map(oc => {
      const fecha =
        oc.estado === 'no_aplica' ? oc.fechaProgramada : oc.fechaVisible
      return { fecha, evento: tareaEventoDesdeOcurrencia(oc) }
    })
  }, [ocurrencias, mostrarTareas])

  const mesesArmados = useMemo(() => {
    const meses = new Set<string>()
    meses.add(`${year}-${month}`)
    if (vista === 'semana') {
      const lunes = lunesDeSemana(semanaAnchor)
      for (let i = 0; i < 7; i++) {
        const f = addDaysToKey(lunes, i)
        const p = parseDateOnly(f)
        if (p) meses.add(`${p.y}-${p.m}`)
      }
    }
    if (vista === 'agenda') {
      for (let i = 0; i < 14; i++) {
        const f = addDaysToKey(hoy, i)
        const p = parseDateOnly(f)
        if (p) meses.add(`${p.y}-${p.m}`)
      }
    }
    const personasCal = miembros.map(m => ({
      userId: m.userId,
      nombre: m.nombre,
      color: m.color,
      fechaNacimiento: m.fechaNacimiento,
    }))
    const ausenciasCal = ausenciasRango.map(a => ({
      id: a.id,
      userId: a.userId,
      tipo: a.tipo,
      fechaDesde: a.fechaDesde,
      fechaHasta: a.fechaHasta,
      fechaRecupero: a.fechaRecupero,
    }))
    return Array.from(meses).map(key => {
      const [y, m] = key.split('-').map(Number)
      return armarMesCalendario({
        year: y,
        month: m,
        personas: personasCal,
        ausencias: ausenciasCal,
        feriados: feriadosCal,
        filtroUserIds,
        tareasEventos,
      })
    })
  }, [
    year,
    month,
    vista,
    semanaAnchor,
    hoy,
    miembros,
    ausenciasRango,
    feriadosCal,
    filtroUserIds,
    tareasEventos,
  ])

  const porFecha = useMemo(() => mergeMeses(mesesArmados), [mesesArmados])

  const diasVista = useMemo(() => {
    if (vista === 'mes') {
      return (
        mesesArmados.find(m => m.year === year && m.month === month)?.dias ?? []
      )
    }
    if (vista === 'semana') {
      const lunes = lunesDeSemana(semanaAnchor)
      return diasEnRango(lunes, addDaysToKey(lunes, 6), porFecha, month)
    }
    return diasEnRango(hoy, addDaysToKey(hoy, 13), porFecha, month)
  }, [vista, mesesArmados, year, month, semanaAnchor, hoy, porFecha])

  const goPrev = () => {
    if (vista === 'agenda') return
    if (vista === 'semana') {
      setSemanaAnchor(a => addDaysToKey(lunesDeSemana(a), -7))
      return
    }
    if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else setMonth(m => m - 1)
  }

  const goNext = () => {
    if (vista === 'agenda') return
    if (vista === 'semana') {
      setSemanaAnchor(a => addDaysToKey(lunesDeSemana(a), 7))
      return
    }
    if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else setMonth(m => m + 1)
  }

  const goHoy = () => {
    const p = argentinaDateParts()
    setYear(p.year)
    setMonth(p.month)
    setSemanaAnchor(hoy)
  }

  const handleVistaChange = (v: VistaCalendario) => {
    setVistaManual(true)
    setVista(v)
    if (v === 'semana') setSemanaAnchor(hoy)
  }

  const afterChange = async () => {
    await load()
    onAusenciasChanged?.()
  }

  const abrirAgregar = (
    accion: AgregarMenuAccion,
    fecha?: string,
    rango?: { desde: string; hasta: string }
  ) => {
    setEditVac(null)
    setEditCambio(null)
    setFechaCtx(fecha)
    setRangoCtx(rango)
    switch (accion) {
      case 'tarea':
        setTareaOpen(true)
        break
      case 'vacaciones':
        setVacOpen(true)
        break
      case 'cambio_dia':
        setCambioOpen(true)
        break
      case 'feriado_empresa':
        setFechaEmpresa(fecha ? parseOrderDateLocal(fecha) : undefined)
        setNombreEmpresa('')
        setFeriadoEmpresaOpen(true)
        break
      case 'ausencia_otra':
        setAusenciaOtraOpen(true)
        break
    }
  }

  const handleVacaciones = async (input: {
    fechaDesde: string
    fechaHasta: string
    nota: string | null
  }) => {
    setSaving(true)
    try {
      if (editVac) {
        await actualizarAusencia({
          id: editVac.id,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
          nota: input.nota,
        })
        if (huboCambioDeFechas(editVac, input)) {
          avisarVacacionesCambiadas({
            persona: target,
            miembros,
            ausenciaId: editVac.id,
            fechaDesde: input.fechaDesde,
            fechaHasta: input.fechaHasta,
          })
        }
        toast({ title: 'Vacaciones actualizadas' })
      } else {
        const creada = await crearVacaciones({
          userId: target.userId,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
          nota: input.nota,
        })
        const destinatarios = miembros
          .filter(m => m.userId !== target.userId && m.activo)
          .map(m => m.userId)
        notifyVacacionesCargadas({
          nombre: target.nombre.split(' ')[0] || target.nombre,
          fechaDesde: input.fechaDesde,
          fechaHasta: input.fechaHasta,
          destinatarioUserIds: destinatarios,
          ausenciaId: creada.id,
        })
        toast({ title: 'Vacaciones cargadas' })
      }
      setVacOpen(false)
      setEditVac(null)
      setFechaCtx(undefined)
      setRangoCtx(undefined)
      await afterChange()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCambio = async (input: {
    fecha: string
    fechaRecupero: string | null
    nota: string | null
  }) => {
    setSaving(true)
    try {
      if (editCambio) {
        await actualizarAusencia({
          id: editCambio.id,
          fechaDesde: input.fecha,
          fechaHasta: input.fecha,
          fechaRecupero: input.fechaRecupero,
          nota: input.nota,
        })
        toast({ title: 'Cambio de día actualizado' })
      } else {
        await crearCambioDia({
          userId: target.userId,
          fecha: input.fecha,
          fechaRecupero: input.fechaRecupero,
          nota: input.nota,
        })
        toast({ title: 'Cambio de día cargado' })
      }
      setCambioOpen(false)
      setEditCambio(null)
      setFechaCtx(undefined)
      await afterChange()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const openEditAusencia = (a: AusenciaEquipo) => {
    if (!puedeEditarAusencia(a, perfil.userId, esAdmin, hoy)) return
    if (a.tipo === 'vacaciones') {
      setEditVac({
        id: a.id,
        fechaDesde: a.fechaDesde,
        fechaHasta: a.fechaHasta,
        nota: a.nota,
      })
      setFechaCtx(undefined)
      setRangoCtx(undefined)
      setVacOpen(true)
    } else {
      setEditCambio({
        id: a.id,
        fecha: a.fechaDesde,
        fechaRecupero: a.fechaRecupero,
        nota: a.nota,
      })
      setCambioOpen(true)
    }
  }

  const solicitarBorrarAusencia = (a: AusenciaEquipo) => {
    if (!puedeEditarAusencia(a, perfil.userId, esAdmin, hoy)) return
    setAusenciaABorrar(a)
  }

  const confirmarBorrarAusencia = () => {
    const a = ausenciaABorrar
    if (!a) return
    void (async () => {
      const snap = a
      try {
        await borrarAusencia(snap.id)
        if (snap.tipo === 'vacaciones') {
          avisarVacacionesCanceladas({
            persona: target,
            miembros,
            ausenciaId: snap.id,
            fechaDesde: snap.fechaDesde,
            fechaHasta: snap.fechaHasta,
          })
        }
        toastConDeshacer('Borrado', async () => {
          try {
            if (snap.tipo === 'vacaciones') {
              await crearVacaciones({
                userId: snap.userId,
                fechaDesde: snap.fechaDesde,
                fechaHasta: snap.fechaHasta,
                nota: snap.nota,
              })
            } else {
              await crearCambioDia({
                userId: snap.userId,
                fecha: snap.fechaDesde,
                fechaRecupero: snap.fechaRecupero,
                nota: snap.nota,
              })
            }
            toast({ title: 'Registro restaurado' })
            await afterChange()
          } catch (err) {
            toast({
              title: 'No se pudo deshacer',
              description: err instanceof Error ? err.message : 'Error',
              variant: 'destructive',
            })
          }
        })
        setChipPopover(null)
        await afterChange()
      } catch (err) {
        toast({
          title: 'No se pudo borrar',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        })
      }
    })()
  }

  const handleFeriadoEmpresa = async () => {
    const fecha = dateToKey(fechaEmpresa)
    if (!fecha || !nombreEmpresa.trim()) {
      toast({ title: 'Completá fecha y nombre', variant: 'destructive' })
      return
    }
    setSavingEmpresa(true)
    try {
      await crearFeriadoEmpresa({ fecha, nombre: nombreEmpresa.trim() })
      toast({ title: 'Día de la empresa agregado' })
      setFeriadoEmpresaOpen(false)
      await afterChange()
    } catch (err) {
      toast({
        title: 'No se pudo agregar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      })
    } finally {
      setSavingEmpresa(false)
    }
  }

  const chipAusencia = (ev: EventoCalendario): AusenciaEquipo | null => {
    if (
      ev.kind !== 'vacaciones' &&
      ev.kind !== 'cambio_falta' &&
      ev.kind !== 'cambio_recupero'
    ) {
      return null
    }
    return ausenciasRango.find(a => a.id === ev.ausenciaId) ?? null
  }

  const renderPopoverContenido = () => {
    if (!chipPopover) return null
    const { ev } = chipPopover
    if (
      ev.kind === 'tarea' &&
      ev.tareaId !== '__resumen__' &&
      ev.tareaId !== '__mas__'
    ) {
      const oc =
        ocurrenciaPorClave.get(`${ev.tareaId}|${ev.fechaProgramada}`) ??
        ocurrencias.find(
          o =>
            o.tareaId === ev.tareaId && o.fechaProgramada === ev.fechaProgramada
        )
      if (!oc) return <p className="text-xs text-muted-foreground">Tarea</p>
      return (
        <div className="space-y-3 max-w-xs">
          <div>
            <p className="text-sm font-medium text-white">{oc.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {describirFrecuencia(oc)}
            </p>
            {oc.estado === 'atrasada' && oc.atrasadaDesde ? (
              <p className="text-xs text-amber-400/90">
                Atrasada {textoAtrasadaDesde(oc.atrasadaDesde)}
              </p>
            ) : null}
          </div>
          <AccionesTarea
            ocurrencia={oc}
            feriados={feriadosKeys}
            misAusencias={ausenciasTareas.map(a => ({
              tipo: a.tipo,
              fechaDesde: a.fechaDesde,
              fechaHasta: a.fechaHasta,
            }))}
            onChanged={afterChange}
          />
        </div>
      )
    }
    const aus = chipAusencia(ev)
    if (aus) {
      const habiles =
        aus.tipo === 'vacaciones'
          ? contarDiasHabiles(aus.fechaDesde, aus.fechaHasta, feriadosKeys)
          : null
      return (
        <div className="space-y-2 max-w-xs">
          <p className="text-sm font-medium text-white">
            {miembros.find(m => m.userId === aus.userId)?.nombre ??
              'Integrante'}
          </p>
          <p className="text-xs text-muted-foreground">
            {aus.tipo === 'vacaciones'
              ? `Vacaciones ${aus.fechaDesde} → ${aus.fechaHasta}${
                  habiles != null ? ` · ${habiles} días hábiles` : ''
                }`
              : `Falta ${aus.fechaDesde}${
                  aus.fechaRecupero ? ` · recupero ${aus.fechaRecupero}` : ''
                }`}
          </p>
          {aus.nota ? (
            <p className="text-xs text-muted-foreground">{aus.nota}</p>
          ) : null}
          {puedeEditarAusencia(aus, perfil.userId, esAdmin, hoy) ? (
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openEditAusencia(aus)}
              >
                Editar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => solicitarBorrarAusencia(aus)}
              >
                Borrar
              </Button>
            </div>
          ) : null}
        </div>
      )
    }
    if (ev.kind === 'feriado') {
      return (
        <p className="text-sm text-white">
          {ev.origen === 'nacional' ? '🇦🇷 ' : '🏢 '}
          {ev.nombre}
        </p>
      )
    }
    if (ev.kind === 'cumpleanios') {
      return <p className="text-sm text-white">🎂 Cumple {ev.nombre}</p>
    }
    return null
  }

  const diaSheetData = diaSheet ? porFecha.get(diaSheet) : null
  const tareasDiaSheet = diaSheet
    ? ocurrenciasDelDia(ocurrencias, diaSheet)
    : []

  if (loadingInicial) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando calendario…
      </div>
    )
  }

  const filtroBtn = (activo: boolean) =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-colors',
      activo
        ? 'bg-white/[0.12] text-foreground'
        : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
    )

  return (
    <div className="space-y-4">
      <Panel className="min-w-0">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-medium text-foreground">
              Calendario del equipo
            </h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Vacaciones, cambios de día, feriados, cumpleaños y tus tareas. Arrastrá sobre varios días para cargar vacaciones.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 gap-1.5 rounded-full bg-white/[0.06] px-4 hover:bg-white/[0.1]"
              >
                <Plus className="h-4 w-4" />
                Agregar
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => abrirAgregar('tarea')}>
                Tarea
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => abrirAgregar('vacaciones')}>
                Vacaciones
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => abrirAgregar('cambio_dia')}>
                Cambio de día
              </DropdownMenuItem>
              {esAdmin ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => abrirAgregar('feriado_empresa')}
                  >
                    Día de la empresa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => abrirAgregar('ausencia_otra')}
                  >
                    Ausencia de otra persona
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={filtroBtn(filtroUserIds === null)}
              onClick={() => setFiltroUserIds(null)}
            >
              Todos
            </button>
            <button
              type="button"
              className={filtroBtn(
                filtroUserIds?.length === 1 && filtroUserIds[0] === perfil.userId
              )}
              onClick={() => setFiltroUserIds([perfil.userId])}
            >
              Solo yo
            </button>
            <span className="mx-1 h-4 w-px bg-white/[0.08]" aria-hidden />
            {miembros.map(m => {
              const activo = !!filtroUserIds && filtroUserIds.includes(m.userId)
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    setFiltroUserIds(prev => {
                      if (!prev) return [m.userId]
                      if (prev.includes(m.userId)) {
                        const next = prev.filter(id => id !== m.userId)
                        return next.length === 0 ? null : next
                      }
                      return [...prev, m.userId]
                    })
                  }}
                  className={filtroBtn(activo)}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  {m.nombre.split(' ')[0]}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 rounded accent-[#e0812f]"
                checked={mostrarTareas}
                onChange={e => {
                  setMostrarTareas(e.target.checked)
                  writeMostrarTareas(e.target.checked)
                }}
              />
              Mostrar mis tareas
            </label>
            {esAdmin ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Tareas de
                <select
                  className="h-7 rounded-full bg-white/[0.06] px-3 text-xs text-foreground outline-none"
                  value={tareasUserId}
                  onChange={e => setTareasUserId(e.target.value)}
                >
                  {miembros
                    .filter(m => m.activo)
                    .map(m => (
                      <option
                        key={m.userId}
                        value={m.userId}
                        className="bg-zinc-900"
                      >
                        {m.nombre.split(' ')[0]}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <CalendarioEquipo
          year={year}
          month={month}
          dias={diasVista}
          agendaDias={vista === 'agenda' ? diasVista : undefined}
          hoy={hoy}
          vista={vista}
          onVistaChange={handleVistaChange}
          loadingSuave={loadingSuave}
          mostrarTareas={mostrarTareas}
          esAdmin={esAdmin}
          semanaDesde={
            vista === 'semana' ? lunesDeSemana(semanaAnchor) : undefined
          }
          onDiaClick={fecha => setDiaSheet(fecha)}
          onChipClick={(ev, fecha) => setChipPopover({ ev, fecha })}
          onAgregarMenu={(fecha, accion) => abrirAgregar(accion, fecha)}
          onRangoSeleccionado={(desde, hasta) =>
            abrirAgregar('vacaciones', desde, { desde, hasta })
          }
          onPrev={goPrev}
          onNext={goNext}
          onHoy={goHoy}
        />
      </Panel>

      <Panel>
        <PanelTitle
          title="Mis vacaciones y cambios"
          sub={
            <>
              {vacacionesSinLimite
                ? 'Sin límite de días. '
                : saldoDias != null
                  ? `Te quedan ${saldoDias} ${saldoDias === 1 ? 'día' : 'días'}. `
                  : ''}
              {esAdmin
                ? 'Como admin podés corregir cualquier ausencia (también desde Equipo).'
                : `Podés editar o borrar lo que todavía no empezó; para corregir algo que ya empezó, pedíselo a ${adminNombre}.`}
            </>
          }
        />
        <ListaAusencias
          ausencias={misAusencias}
          viewerUserId={perfil.userId}
          esAdmin={esAdmin}
          hoy={hoy}
          horizontal
          vacioTexto="Todavía no cargaste nada. Usá Agregar o arrastrá sobre los días del calendario."
          onEditar={openEditAusencia}
          onBorrar={solicitarBorrarAusencia}
        />
      </Panel>

      <Dialog
        open={chipPopover !== null}
        onOpenChange={o => {
          if (!o) setChipPopover(null)
        }}
      >
        <DialogContent className={cn(DIALOGO, 'max-w-sm')}>
          {renderPopoverContenido()}
        </DialogContent>
      </Dialog>

      <Sheet
        open={diaSheet !== null}
        onOpenChange={o => !o && setDiaSheet(null)}
      >
        <SheetContent className={cn(HOJA, 'overflow-y-auto sm:max-w-md')}>
          <SheetHeader>
            <SheetTitle className="first-letter:uppercase">
              {diaSheet ? tituloDia(diaSheet) : ''}
            </SheetTitle>
            <SheetDescription>
              Vacaciones, tareas y feriados del día.
            </SheetDescription>
          </SheetHeader>
          {diaSheet && diaSheetData ? (
            <div className="mt-4 space-y-5">
              {mostrarTareas ? (
                <section>
                  <Etiqueta>Tareas</Etiqueta>
                  {tareasDiaSheet.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin tareas este día.
                    </p>
                  ) : (
                    tareasDiaSheet.map(oc => (
                      <div
                        key={`${oc.tareaId}-${oc.fechaProgramada}`}
                        className={cn(FILA, 'mb-2 space-y-2')}
                      >
                        <p className="text-sm text-foreground">
                          {oc.titulo}
                        </p>
                        <AccionesTarea
                          ocurrencia={oc}
                          feriados={feriadosKeys}
                          misAusencias={ausenciasTareas.map(a => ({
                            tipo: a.tipo,
                            fechaDesde: a.fechaDesde,
                            fechaHasta: a.fechaHasta,
                          }))}
                          onChanged={afterChange}
                        />
                      </div>
                    ))
                  )}
                </section>
              ) : null}

              <section>
                <Etiqueta>Equipo</Etiqueta>
                <ul className="space-y-1.5 text-sm">
                  {diaSheetData.eventos
                    .filter(e => e.kind !== 'tarea')
                    .map((ev, i) => (
                      <li key={i}>
                        {ev.kind === 'feriado'
                          ? `${ev.origen === 'nacional' ? '🇦🇷' : '🏢'} ${ev.nombre}`
                          : ev.kind === 'cumpleanios'
                            ? `🎂 ${ev.nombre}`
                            : ev.kind === 'vacaciones'
                              ? `🏖 ${ev.nombre}`
                              : ev.kind === 'cambio_falta'
                                ? `↔ ${ev.nombre} falta`
                                : `↔ ${ev.nombre} recupera`}
                      </li>
                    ))}
                </ul>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full bg-white/[0.06] hover:bg-white/[0.1]"
                  onClick={() => abrirAgregar('tarea', diaSheet)}
                >
                  + Tarea
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full bg-white/[0.06] hover:bg-white/[0.1]"
                  onClick={() => abrirAgregar('cambio_dia', diaSheet)}
                >
                  Tomarme este día
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full bg-white/[0.06] hover:bg-white/[0.1]"
                  onClick={() => abrirAgregar('vacaciones', diaSheet)}
                >
                  Vacaciones desde acá
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <CargarVacacionesDialog
        open={vacOpen}
        onOpenChange={v => {
          setVacOpen(v)
          if (!v) {
            setEditVac(null)
            setFechaCtx(undefined)
            setRangoCtx(undefined)
          }
        }}
        perfil={target}
        miembros={miembros}
        hoy={hoy}
        saving={saving}
        esAdmin={esAdmin}
        adminNombre={adminNombre}
        initial={editVac}
        fechaInicial={editVac ? undefined : fechaCtx}
        rangoInicial={editVac ? undefined : rangoCtx}
        onConfirm={handleVacaciones}
      />
      <CambioDiaDialog
        open={cambioOpen}
        onOpenChange={v => {
          setCambioOpen(v)
          if (!v) {
            setEditCambio(null)
            setFechaCtx(undefined)
          }
        }}
        perfil={target}
        hoy={hoy}
        saving={saving}
        esAdmin={esAdmin}
        adminNombre={adminNombre}
        initial={editCambio}
        fechaInicial={editCambio ? undefined : fechaCtx}
        onConfirm={handleCambio}
      />
      <TareaRecurrenteDialog
        open={tareaOpen}
        onOpenChange={v => {
          setTareaOpen(v)
          if (!v) setFechaCtx(undefined)
        }}
        initial={null}
        personaNombre={
          miembros.find(m => m.userId === tareasUserId)?.nombre ?? perfil.nombre
        }
        saving={saving}
        fechaInicial={fechaCtx}
        onSave={async (value: TareaRecurrenteFormValue) => {
          setSaving(true)
          try {
            await crearTareaRecurrente({
              userId: tareasUserId,
              titulo: value.titulo,
              descripcion: value.descripcion,
              frecuencia: value.frecuencia,
              diasSemana: value.diasSemana,
              diaMes: value.diaMes,
              semanaInicio: value.semanaInicio,
              fecha: value.fecha,
            })
            toast({ title: 'Tarea creada' })
            setTareaOpen(false)
            setFechaCtx(undefined)
            await afterChange()
          } catch (err) {
            toast({
              title: 'No se pudo crear',
              description: err instanceof Error ? err.message : 'Error',
              variant: 'destructive',
            })
          } finally {
            setSaving(false)
          }
        }}
      />
      <AusenciasPersonaDialog
        open={ausenciaOtraOpen}
        onOpenChange={setAusenciaOtraOpen}
        perfil={perfil}
        miembros={miembros}
        adminNombre={adminNombre}
        onChanged={afterChange}
      />

      <Dialog open={feriadoEmpresaOpen} onOpenChange={setFeriadoEmpresaOpen}>
        <DialogContent className={cn(DIALOGO, 'sm:max-w-md')}>
          <DialogHeader>
            <DialogTitle>Día de la empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <div className={CAMPO}>
                <DatePicker date={fechaEmpresa} onDateChange={setFechaEmpresa} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={nombreEmpresa}
                onChange={e => setNombreEmpresa(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeriadoEmpresaOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={savingEmpresa}
              onClick={() => void handleFeriadoEmpresa()}
            >
              {savingEmpresa ? 'Guardando…' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!ausenciaABorrar}
        onOpenChange={open => {
          if (!open) setAusenciaABorrar(null)
        }}
        title="Borrar registro"
        description="¿Borrar este registro de vacaciones o cambio de día?"
        confirmLabel="Borrar"
        variant="destructive"
        onConfirm={confirmarBorrarAusencia}
      />
    </div>
  )
}
