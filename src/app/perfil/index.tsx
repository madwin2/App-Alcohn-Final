import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { Loader2 } from 'lucide-react'

import { AppMain } from '@/components/layout/AppMain'

import { Toaster } from '@/components/ui/toaster'

import { Tabs, TabsContent } from '@/components/ui/tabs'

import {
  Aviso,
  Insignia,
  PillTab,
  PillTabsList,
} from '@/components/perfil/perfilUi'

import { PerfilHeader } from '@/components/perfil/PerfilHeader'

import { PerfilNoActivoMensaje } from '@/components/perfil/PerfilNoActivoMensaje'

import { InicioPerfilTab } from '@/components/perfil/InicioPerfilTab'

import { EquipoTab } from '@/components/perfil/EquipoTab'

import { CalendarioTab } from '@/components/perfil/CalendarioTab'

import { TareasTab } from '@/components/perfil/TareasTab'

import {
  LoMioTab,
  sanitizeLoMioSub,
  type LoMioSubtab,
} from '@/components/perfil/LoMioTab'

import { MisNumerosTab } from '@/components/perfil/MisNumerosTab'

import { useAuth } from '@/lib/hooks/useAuth'

import { useEquipoRol } from '@/lib/hooks/useEquipoRol'

import {
  getMiembrosEquipo,
  getMiPerfil,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service'

import {
  getDatosSaldoVacaciones,
  hayFeriadosNacionales,
} from '@/lib/supabase/services/equipoCalendario.service'

import { contarMiFeedbackNoLeido } from '@/lib/supabase/services/equipoFeedback.service'

import { saldoVacaciones } from '@/lib/equipo/vacaciones'

import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'

const TAB_STORAGE_KEY = 'perfil_tab_v2'

const TABS_BASE = ['dia', 'tareas', 'lo-mio', 'numeros'] as const

const LEGACY_LO_MIO = [
  'anotaciones',
  'necesidades',
  'crecimiento',
  'feedback',
] as const

function tabsValidas(esAdmin: boolean): Set<string> {
  const s = new Set<string>(TABS_BASE)

  if (esAdmin) s.add('equipo')

  return s
}

export type PerfilTabParse = {
  tab: string
  sub?: LoMioSubtab
  redirectCorcho?: boolean
}

/** Mapea ?tab= viejos (notificaciones) a la estructura nueva (UX-11). */

export function parsePerfilTabQuery(
  rawTab: string | null | undefined,

  rawSub: string | null | undefined,

  esAdmin: boolean
): PerfilTabParse {
  const t = rawTab || ''

  if (t === 'ideas') return { tab: 'dia', redirectCorcho: true }

  if (t === 'inicio' || t === 'calendario') return { tab: 'dia' }

  if (LEGACY_LO_MIO.includes(t as (typeof LEGACY_LO_MIO)[number])) {
    return { tab: 'lo-mio', sub: sanitizeLoMioSub(t) }
  }

  if (t === 'lo-mio') {
    return { tab: 'lo-mio', sub: sanitizeLoMioSub(rawSub) }
  }

  const safe = tabsValidas(esAdmin).has(t) ? t : 'dia'

  return { tab: safe }
}

function sanitizeTab(raw: string | null | undefined, esAdmin: boolean): string {
  return parsePerfilTabQuery(raw, null, esAdmin).tab
}

function readStoredTab(esAdmin: boolean): string {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY)

    if (stored) return sanitizeTab(stored, esAdmin)

    const legacy = localStorage.getItem('perfil_tab')

    return sanitizeTab(legacy, esAdmin)
  } catch {
    return 'dia'
  }
}

function writeStoredTab(tab: string): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // ignore quota / private mode
  }
}

export default function PerfilPage() {
  const { user } = useAuth()

  const location = useLocation()

  const navigate = useNavigate()

  const { esAdmin, loading: rolLoading, refresh } = useEquipoRol()

  const [searchParams, setSearchParams] = useSearchParams()

  const [perfil, setPerfil] = useState<PerfilEquipo | null>(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)

  const [saldo, setSaldo] = useState<{
    disponiblesHoy: number

    planificados: number
  } | null>(null)

  const [nombresPorUserId, setNombresPorUserId] = useState<
    Record<string, string>
  >({})

  const [feedbackNoLeido, setFeedbackNoLeido] = useState(0)

  const [refreshKey, setRefreshKey] = useState(0)

  const tabFromUrl = searchParams.get('tab')

  const subFromUrl = searchParams.get('sub')

  const parsedInitial = parsePerfilTabQuery(tabFromUrl, subFromUrl, false)

  const [tab, setTab] = useState(
    () => parsedInitial.tab || readStoredTab(false)
  )

  const [loMioSub, setLoMioSub] = useState<LoMioSubtab>(
    () => parsedInitial.sub ?? 'anotaciones'
  )

  useEffect(() => {
    const parsed = parsePerfilTabQuery(
      tabFromUrl || readStoredTab(esAdmin),

      subFromUrl,

      esAdmin
    )

    if (parsed.redirectCorcho) {
      navigate('/corcho', { replace: true })

      return
    }

    if (parsed.tab !== tab) setTab(parsed.tab)

    if (parsed.sub && parsed.sub !== loMioSub) setLoMioSub(parsed.sub)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl, subFromUrl, esAdmin, navigate])

  const [navKey, setNavKey] = useState(0)

  const navInternaRef = useRef(false)

  const primerKeyRef = useRef(true)

  useEffect(() => {
    if (primerKeyRef.current) {
      primerKeyRef.current = false

      return
    }

    if (navInternaRef.current) {
      navInternaRef.current = false

      return
    }

    setNavKey(k => k + 1)

    setRefreshKey(k => k + 1)
  }, [location.key])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !perfil?.activo) return

      setRefreshKey(k => k + 1)

      void contarMiFeedbackNoLeido()
        .then(setFeedbackNoLeido)

        .catch(() => undefined)
    }

    document.addEventListener('visibilitychange', onVis)

    return () => document.removeEventListener('visibilitychange', onVis)
  }, [perfil?.activo])

  const loadSaldo = useCallback(async (p: PerfilEquipo) => {
    if (p.vacacionesSinLimite) {
      setSaldo(null)

      return
    }

    try {
      const hoy = todayArgentinaDateKey()

      const { ausencias, feriados } = await getDatosSaldoVacaciones([p.userId])

      const s = saldoVacaciones({
        saldoBase: p.vacacionesSaldoBase,

        saldoBaseFecha: p.vacacionesSaldoBaseFecha,

        diasAnuales: p.diasVacacionesAnuales,

        ausencias: ausencias.map(a => ({
          tipo: a.tipo,

          fechaDesde: a.fechaDesde,

          fechaHasta: a.fechaHasta,

          fechaRecupero: a.fechaRecupero,
        })),

        feriados: feriados.map(f => f.fecha),

        hoy,
      })

      setSaldo({
        disponiblesHoy: s.disponiblesHoy,

        planificados: s.planificados,
      })
    } catch {
      setSaldo(null)
    }
  }, [])

  const [aniosSinFeriados, setAniosSinFeriados] = useState<number[]>([])

  const loadFeriadosFaltantes = useCallback(async () => {
    try {
      const anio = Number(todayArgentinaDateKey().slice(0, 4))

      const anios = [anio, anio + 1]

      const hay = await Promise.all(anios.map(y => hayFeriadosNacionales(y)))

      setAniosSinFeriados(anios.filter((_, i) => !hay[i]))
    } catch {
      setAniosSinFeriados([])
    }
  }, [])

  useEffect(() => {
    if (esAdmin) void loadFeriadosFaltantes()
    else setAniosSinFeriados([])
  }, [esAdmin, loadFeriadosFaltantes])

  const loadPerfil = useCallback(async () => {
    if (!user?.id) {
      setPerfil(null)

      setLoading(false)

      return
    }

    setLoading(true)

    setError(null)

    try {
      const p = await getMiPerfil(user.id)

      setPerfil(p)

      if (p) void loadSaldo(p)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo cargar el perfil'
      )

      setPerfil(null)
    } finally {
      setLoading(false)
    }
  }, [user?.id, loadSaldo])

  useEffect(() => {
    void loadPerfil()
  }, [loadPerfil])

  useEffect(() => {
    void getMiembrosEquipo({ incluirInactivos: true })
      .then(m => {
        const map: Record<string, string> = {}

        m.forEach(x => {
          map[x.userId] = x.nombre
        })

        setNombresPorUserId(map)
      })

      .catch(() => {
        /* nombres opcionales */
      })
  }, [])

  useEffect(() => {
    if (!perfil?.activo) {
      setFeedbackNoLeido(0)

      return
    }

    void contarMiFeedbackNoLeido()
      .then(setFeedbackNoLeido)

      .catch(() => setFeedbackNoLeido(0))
  }, [perfil?.activo, perfil?.userId])

  const handleTabChange = (value: string, sub?: string) => {
    const safe = sanitizeTab(value, esAdmin)

    if (safe === 'equipo' && !esAdmin) return

    setTab(safe)

    writeStoredTab(safe)

    const nextSub = safe === 'lo-mio' ? sanitizeLoMioSub(sub ?? loMioSub) : null

    if (nextSub) setLoMioSub(nextSub)

    const next = new URLSearchParams(searchParams)

    if (safe === 'dia') next.delete('tab')
    else next.set('tab', safe)

    if (nextSub) next.set('sub', nextSub)
    else next.delete('sub')

    navInternaRef.current = true

    setSearchParams(next, { replace: true })
  }

  const handleLoMioSubChange = (sub: LoMioSubtab) => {
    setLoMioSub(sub)

    const next = new URLSearchParams(searchParams)

    next.set('tab', 'lo-mio')

    next.set('sub', sub)

    navInternaRef.current = true

    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!rolLoading && !esAdmin && tab === 'equipo') {
      handleTabChange('dia')
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin, rolLoading, tab])

  const busy = loading || rolLoading

  const saldoHeader = useMemo(() => {
    if (!perfil || perfil.vacacionesSinLimite) return null

    return saldo
  }, [perfil, saldo])

  return (
    <AppMain>
      <Toaster />

      <div className="w-full max-w-[1920px] space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {busy ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando tu perfil…
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-white/[0.035] px-5 py-12 text-center">
            <p className="text-sm text-red-400">{error}</p>

            <button
              type="button"

              className="mt-3 text-xs underline text-muted-foreground"

              onClick={() => void loadPerfil()}
            >
              Reintentar
            </button>
          </div>
        ) : !perfil || !perfil.activo ? (
          <PerfilNoActivoMensaje perfil={perfil} contexto="perfil" />
        ) : (
          <>
            <PerfilHeader perfil={perfil} saldoVacaciones={saldoHeader} />

            {esAdmin && aniosSinFeriados.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/[0.035] px-5 py-3">
                <Aviso>
                  Faltan los feriados nacionales de{' '}
                  {aniosSinFeriados.join(' y ')}: el saldo de vacaciones puede
                  cambiar cuando se importen.
                </Aviso>

                <button
                  type="button"

                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"

                  onClick={() => handleTabChange('equipo')}
                >
                  Importar en Equipo
                </button>
              </div>
            ) : null}

            <Tabs value={tab} onValueChange={v => handleTabChange(v)}>
              <PillTabsList>
                <PillTab value="dia">Mi día</PillTab>

                <PillTab value="tareas">Tareas</PillTab>

                <PillTab value="lo-mio">
                  Lo mío
                  <Insignia n={feedbackNoLeido} />
                </PillTab>

                <PillTab value="numeros">Mis números</PillTab>

                {esAdmin ? <PillTab value="equipo">Equipo</PillTab> : null}
              </PillTabsList>

              <TabsContent value="dia" className="mt-5 space-y-4">
                <InicioPerfilTab
                  perfil={perfil}

                  esAdmin={esAdmin}

                  saldo={saldoHeader}

                  feedbackNoLeido={feedbackNoLeido}

                  refreshKey={refreshKey}

                  onGoTab={handleTabChange}

                  onAusenciasChanged={() => {
                    void loadSaldo(perfil)
                  }}
                />

                <CalendarioTab
                  perfil={perfil}

                  esAdmin={esAdmin}

                  saldoDias={saldoHeader?.disponiblesHoy ?? null}

                  vacacionesSinLimite={perfil.vacacionesSinLimite}

                  onAusenciasChanged={() => {
                    void loadSaldo(perfil)
                  }}
                />
              </TabsContent>

              <TabsContent value="tareas" className="mt-5">
                {user?.id ? (
                  <TareasTab
                    userId={perfil.userId}

                    personaNombre={perfil.nombre}

                    viewerUserId={user.id}

                    esAdmin={esAdmin}

                    nombresPorUserId={nombresPorUserId}

                    refreshKey={navKey}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="lo-mio" className="mt-5">
                <LoMioTab
                  sub={loMioSub}

                  onSubChange={handleLoMioSubChange}

                  personaNombre={perfil.nombre}

                  refreshKey={navKey}

                  feedbackNoLeido={feedbackNoLeido}

                  onUnreadChange={setFeedbackNoLeido}
                />
              </TabsContent>

              <TabsContent value="numeros" className="mt-5">
                <MisNumerosTab
                  userId={perfil.userId}
                  areaPrincipal={perfil.areaPrincipal}
                />
              </TabsContent>

              {esAdmin ? (
                <TabsContent value="equipo" className="mt-5">
                  <EquipoTab
                    onFeriadosChanged={() => {
                      void loadFeriadosFaltantes()

                      void loadSaldo(perfil)
                    }}

                    onChanged={() => {
                      void loadPerfil()

                      void refresh()
                    }}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </>
        )}
      </div>
    </AppMain>
  )
}
