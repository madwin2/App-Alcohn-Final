import { useCallback, useEffect, useMemo, useState } from 'react'
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'
import { addDaysToKey, eachDateKey, weekdayOfKey } from '@/lib/equipo/fechas'
import { cumpleaniosEnAnio } from '@/lib/equipo/cumpleanios'
import { rangoGrillaMes } from '@/lib/equipo/calendarioEquipo'
import {
  ocurrenciasPendientes,
  type OcurrenciaAgenda,
} from '@/lib/equipo/tareasAgenda'
import {
  getMiembrosEquipo,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service'
import {
  getAusencias,
  getAusenciasDeUsuario,
  getFeriados,
} from '@/lib/supabase/services/equipoCalendario.service'
import {
  getRegistrosTareas,
  getTareasRecurrentes,
} from '@/lib/supabase/services/equipoTareas.service'
import { contarMiFeedbackNoLeido } from '@/lib/supabase/services/equipoFeedback.service'
import {
  getMisNumerosSnapshot,
  type MetricCard,
} from '@/lib/supabase/services/equipoNumeros.service'
import {
  getInnovationUserTasks,
  type InnovationUserTask,
} from '@/lib/supabase/services/innovation.service'
import { getApprovedUsers } from '@/lib/supabase/services/auth.service'
import { getUserBarraVideo, getUserProfileImage } from '@/lib/utils/userImages'

/** Un compañero para la fila de avatares (los mismos de la barra de la Home actual). */
export type Companero = {
  id: string
  nombre: string
  foto: string
  /** Video con fondo verde para el hover (chroma key). */
  video: string | null
  /** Hoy no está (vacaciones o cambio de día). */
  ausente: boolean
}

/** Un día en el calendario de la tarjeta. */
export type DiaCalendario = {
  fecha: string
  esHoy: boolean
  feriado: string | null
  /** Mi ausencia ese día (vacaciones o cambio de día). */
  ausencia: 'vacaciones' | 'cambio_dia' | null
  /** Primeros nombres de quienes cumplen años ese día. */
  cumples: string[]
  /** Tareas del perfil pendientes ese día. */
  tareas: number
}

export type MisAusencia = {
  tipo: 'vacaciones' | 'cambio_dia'
  fechaDesde: string
  fechaHasta: string
}

export type DatosBienvenida = {
  hoy: string
  tareasHoy: OcurrenciaAgenda[]
  /** Tareas del perfil ya marcadas como hechas hoy (para el avance del día). */
  hechasHoy: number
  feriados: string[]
  misAusencias: MisAusencia[]
  /** Primeros nombres de quienes faltan hoy (sin contarme). */
  faltanHoy: string[]
  feedbackNoLeido: number
  /** Compañeros con foto (sin contarme), en el orden de la Home actual. */
  equipo: Companero[]
  /** null mientras carga (es la consulta más lenta). */
  numeros: { label: string; metricas: MetricCard[] } | null
  proyectos: InnovationUserTask[]
  /** Días de un rango (inclusive), con sus marcas. */
  dias: (desde: string, hasta: string) => DiaCalendario[]
}

type Crudo = {
  feriados: Array<{ fecha: string; nombre: string }>
  misAusencias: MisAusencia[]
  miembros: PerfilEquipo[]
  ocurrencias: OcurrenciaAgenda[]
  hechasHoy: number
  faltanHoy: string[]
  feedbackNoLeido: number
  equipo: Companero[]
  proyectos: InnovationUserTask[]
}

const primerNombre = (n: string) => n.split(/\s+/)[0] || n

/** Lunes de la semana de `fecha`. */
export function lunesDe(fecha: string): string {
  const wd = weekdayOfKey(fecha) // 0 = domingo
  return addDaysToKey(fecha, -((wd + 6) % 7))
}

/**
 * Datos de la tarjeta de bienvenida de la Home nueva. Usa los mismos servicios que Mi perfil
 * (Mi día, Feedback, Mis números) e Innovación (tareas de proyecto asignadas).
 */
export function useBienvenida(perfil: PerfilEquipo | null) {
  const hoy = todayArgentinaDateKey()
  const [crudo, setCrudo] = useState<Crudo | null>(null)
  const [numeros, setNumeros] = useState<DatosBienvenida['numeros']>(null)

  const load = useCallback(async () => {
    if (!perfil) return
    const anio = Number(hoy.slice(0, 4))

    const [
      feriadosRows,
      ausRows,
      ausHoy,
      tareas,
      miembros,
      feedbackNoLeido,
      proyectosRows,
      aprobados,
    ] = await Promise.all([
      getFeriados({
        desde: `${anio - 1}-01-01`,
        hasta: `${anio + 1}-12-31`,
      }).catch(() => []),
      getAusenciasDeUsuario(perfil.userId).catch(() => []),
      getAusencias({ desde: hoy, hasta: hoy }).catch(() => []),
      getTareasRecurrentes(perfil.userId).catch(() => []),
      getMiembrosEquipo().catch(() => [] as PerfilEquipo[]),
      contarMiFeedbackNoLeido().catch(() => 0),
      getInnovationUserTasks(perfil.userId).catch(
        () => [] as InnovationUserTask[]
      ),
      getApprovedUsers(),
    ])

    const feriados = feriadosRows.map(f => ({
      fecha: f.fecha,
      nombre: f.nombre,
    }))
    const misAusencias: MisAusencia[] = ausRows.map(a => ({
      tipo: a.tipo,
      fechaDesde: a.fechaDesde,
      fechaHasta: a.fechaHasta,
    }))

    const registros = await getRegistrosTareas(tareas.map(t => t.id)).catch(
      () => []
    )
    // Hasta fin del año que viene: alcanza para navegar el calendario por meses.
    const ocurrencias = ocurrenciasPendientes({
      tareas: tareas
        .filter(t => t.activa)
        .map(t => ({
          id: t.id,
          titulo: t.titulo,
          frecuencia: t.frecuencia,
          diasSemana: t.diasSemana as (1 | 2 | 3 | 4 | 5)[] | null,
          diaMes: t.diaMes,
          semanaInicio: t.semanaInicio,
          fecha: t.fecha,
          activa: t.activa,
          creadaEl: t.createdAt.slice(0, 10),
        })),
      registros: registros.map(r => ({
        tareaId: r.tareaId,
        fechaProgramada: r.fechaProgramada,
        estado: r.estado,
        fechaDestino: r.fechaDestino,
      })),
      desde: addDaysToKey(hoy, -45),
      hasta: addDaysToKey(hoy, 120),
      hoy,
      feriados: feriados.map(f => f.fecha),
      misAusencias,
    }).filter(
      o =>
        o.estado !== 'hecha' &&
        o.estado !== 'no_hecha' &&
        o.estado !== 'no_aplica'
    )

    const activos = new Map(
      miembros.filter(m => m.activo).map(m => [m.userId, m])
    )

    setCrudo({
      feriados,
      misAusencias,
      miembros: [...activos.values()],
      ocurrencias,
      hechasHoy: registros.filter(
        r =>
          r.estado === 'hecha' && (r.fechaDestino ?? r.fechaProgramada) === hoy
      ).length,
      faltanHoy: [
        ...new Set(
          ausHoy
            .filter(a => a.userId !== perfil.userId && activos.has(a.userId))
            .map(a => primerNombre(activos.get(a.userId)!.nombre))
        ),
      ],
      feedbackNoLeido,
      equipo: aprobados
        .filter(u => u.id !== perfil.userId)
        .flatMap(u => {
          const foto = getUserProfileImage(u.name)
          return foto
            ? [
                {
                  id: u.id,
                  nombre: u.name,
                  foto,
                  video: getUserBarraVideo(u.name),
                  ausente: ausHoy.some(a => a.userId === u.id),
                },
              ]
            : []
        }),
      proyectos: proyectosRows.filter(
        p =>
          !p.task.isCompleted &&
          p.task.status !== 'Finalizado' &&
          p.task.status !== 'Cancelado'
      ),
    })
  }, [perfil, hoy])

  // Mis números va aparte: es la consulta más pesada y no tiene que frenar al resto.
  useEffect(() => {
    if (!perfil) return
    let vivo = true
    void getMisNumerosSnapshot({
      userId: perfil.userId,
      areaPrincipal: perfil.areaPrincipal,
      periodo: 'mes',
    })
      .then(
        s => vivo && setNumeros({ label: s.labelPeriodo, metricas: s.metricas })
      )
      .catch(() => vivo && setNumeros({ label: '', metricas: [] }))
    return () => {
      vivo = false
    }
  }, [perfil])

  useEffect(() => {
    void load()
  }, [load])

  const dias = useCallback(
    (desde: string, hasta: string): DiaCalendario[] => {
      if (!crudo) return []
      const out: DiaCalendario[] = []
      for (const fecha of eachDateKey(desde, hasta)) {
        const aus = crudo.misAusencias.find(
          a => fecha >= a.fechaDesde && fecha <= a.fechaHasta
        )
        const mmdd = fecha.slice(5)
        out.push({
          fecha,
          esHoy: fecha === hoy,
          feriado: crudo.feriados.find(f => f.fecha === fecha)?.nombre ?? null,
          ausencia: aus?.tipo ?? null,
          cumples: crudo.miembros
            .filter(m => {
              if (!m.fechaNacimiento) return false
              const b = cumpleaniosEnAnio(
                m.fechaNacimiento,
                Number(fecha.slice(0, 4))
              )
              return b
                ? mmdd ===
                    `${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}`
                : false
            })
            .map(m => primerNombre(m.nombre)),
          tareas: crudo.ocurrencias.filter(o => o.fechaVisible === fecha)
            .length,
        })
      }
      return out
    },
    [crudo, hoy]
  )

  const datos = useMemo<DatosBienvenida | null>(
    () =>
      crudo
        ? {
            hoy,
            tareasHoy: crudo.ocurrencias.filter(o => o.fechaVisible === hoy),
            hechasHoy: crudo.hechasHoy,
            feriados: crudo.feriados.map(f => f.fecha),
            misAusencias: crudo.misAusencias,
            faltanHoy: crudo.faltanHoy,
            feedbackNoLeido: crudo.feedbackNoLeido,
            equipo: crudo.equipo,
            numeros,
            proyectos: crudo.proyectos,
            dias,
          }
        : null,
    [crudo, numeros, dias, hoy]
  )

  return { datos, recargar: load }
}

/** Rango de la grilla de un mes (lunes a domingo), a partir de una fecha del mes. */
export function grillaDelMes(fecha: string): { desde: string; hasta: string } {
  return rangoGrillaMes(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)))
}
