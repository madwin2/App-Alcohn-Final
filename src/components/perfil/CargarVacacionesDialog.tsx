import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Aviso, CAMPO, DIALOGO } from '@/components/perfil/perfilUi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { parseOrderDateLocal } from '@/lib/utils/format'
import { contarDiasHabiles } from '@/lib/equipo/diasHabiles'
import { previewCargaVacaciones } from '@/lib/equipo/vacaciones'
import { solapamientosVacaciones } from '@/lib/equipo/calendarioEquipo'
import {
  aniosDelRango,
  ausenciasPropiasSuperpuestas,
  fechaNoPermitidaParaNoAdmin,
} from '@/lib/equipo/ausenciasValidacion'
import {
  getAusencias,
  getDatosSaldoVacaciones,
  getFeriados,
  hayFeriadosNacionales,
  type AusenciaEquipo,
} from '@/lib/supabase/services/equipoCalendario.service'
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service'
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'

function dateToKey(d: Date | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function keyToDate(key: string | null | undefined): Date | undefined {
  if (!key) return undefined
  const d = parseOrderDateLocal(key)
  return Number.isNaN(d.getTime()) ? undefined : d
}

interface CargarVacacionesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  perfil: PerfilEquipo
  miembros: PerfilEquipo[]
  /** Fallback opcional; el diálogo refetcha al elegir rango. */
  ausencias?: AusenciaEquipo[]
  feriadosKeys?: string[]
  hoy?: string
  saving?: boolean
  esAdmin?: boolean
  adminNombre?: string
  initial?: {
    id: string
    fechaDesde: string
    fechaHasta: string
    nota: string | null
  } | null
  /** Al crear (sin `initial`): preseleccionar desde. */
  fechaInicial?: string
  /** Al crear: rango completo (p. ej. arrastre en calendario). */
  rangoInicial?: { desde: string; hasta: string }
  onConfirm: (input: {
    fechaDesde: string
    fechaHasta: string
    nota: string | null
  }) => Promise<void>
}

export function CargarVacacionesDialog({
  open,
  onOpenChange,
  perfil,
  miembros,
  ausencias: ausenciasProp = [],
  feriadosKeys: feriadosProp = [],
  hoy = todayArgentinaDateKey(),
  saving,
  esAdmin = false,
  adminNombre = 'el admin',
  initial = null,
  fechaInicial,
  rangoInicial,
  onConfirm,
}: CargarVacacionesDialogProps) {
  const [desde, setDesde] = useState<Date | undefined>()
  const [hasta, setHasta] = useState<Date | undefined>()
  const [nota, setNota] = useState('')
  const [ausencias, setAusencias] = useState<AusenciaEquipo[]>(ausenciasProp)
  const [feriadosKeys, setFeriadosKeys] = useState<string[]>(feriadosProp)
  const [calculando, setCalculando] = useState(false)
  const [aniosSinFeriados, setAniosSinFeriados] = useState<number[]>([])

  useEffect(() => {
    if (!open) return
    if (initial) {
      setDesde(keyToDate(initial.fechaDesde))
      setHasta(keyToDate(initial.fechaHasta))
      setNota(initial.nota ?? '')
    } else if (rangoInicial) {
      setDesde(keyToDate(rangoInicial.desde))
      setHasta(keyToDate(rangoInicial.hasta))
      setNota('')
    } else if (fechaInicial) {
      setDesde(keyToDate(fechaInicial))
      setHasta(keyToDate(fechaInicial))
      setNota('')
    } else {
      setDesde(undefined)
      setHasta(undefined)
      setNota('')
    }
  }, [open, initial, fechaInicial, rangoInicial])

  const desdeKey = dateToKey(desde)
  const hastaKey = dateToKey(hasta)

  useEffect(() => {
    if (!open || !desdeKey || !hastaKey || hastaKey < desdeKey) {
      setAniosSinFeriados([])
      return
    }
    let cancelled = false
    setCalculando(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [rangoAus, rangoFer, saldoDatos, ...hayFlags] =
            await Promise.all([
              getAusencias({ desde: desdeKey, hasta: hastaKey }),
              getFeriados({ desde: desdeKey, hasta: hastaKey }),
              getDatosSaldoVacaciones([perfil.userId]),
              ...aniosDelRango(desdeKey, hastaKey).map(y =>
                hayFeriadosNacionales(y).then(ok => ({ y, ok }))
              ),
            ])
          if (cancelled) return
          const byId = new Map<string, AusenciaEquipo>()
          for (const a of [...saldoDatos.ausencias, ...rangoAus])
            byId.set(a.id, a)
          setAusencias(Array.from(byId.values()))
          const ferSet = new Set([
            ...saldoDatos.feriados.map(f => f.fecha),
            ...rangoFer.map(f => f.fecha),
          ])
          setFeriadosKeys(Array.from(ferSet))
          setAniosSinFeriados(
            (hayFlags as Array<{ y: number; ok: boolean }>)
              .filter(x => !x.ok)
              .map(x => x.y)
          )
        } catch {
          if (!cancelled) {
            setAusencias(ausenciasProp)
            setFeriadosKeys(feriadosProp)
          }
        } finally {
          if (!cancelled) setCalculando(false)
        }
      })()
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, desdeKey, hastaKey, perfil.userId, ausenciasProp, feriadosProp])

  const ausenciasParaPreview = useMemo(
    () =>
      ausencias.filter(
        a => a.userId === perfil.userId && (!initial || a.id !== initial.id)
      ),
    [ausencias, perfil.userId, initial]
  )

  const fechaPasadaBloqueada =
    !esAdmin &&
    ((!!desdeKey && fechaNoPermitidaParaNoAdmin(desdeKey, hoy)) ||
      (!!hastaKey && fechaNoPermitidaParaNoAdmin(hastaKey, hoy)))

  const superposicionPropia = useMemo(() => {
    if (!desdeKey || !hastaKey || hastaKey < desdeKey) return false
    return (
      ausenciasPropiasSuperpuestas(
        desdeKey,
        hastaKey,
        ausencias
          .filter(a => a.userId === perfil.userId)
          .map(a => ({
            id: a.id,
            tipo: a.tipo,
            fechaDesde: a.fechaDesde,
            fechaHasta: a.fechaHasta,
          })),
        initial?.id
      ).length > 0
    )
  }, [desdeKey, hastaKey, ausencias, perfil.userId, initial?.id])

  const bloquearFechaPasada = useMemo(() => {
    if (esAdmin) return undefined
    return (d: Date) => {
      const k = dateToKey(d)
      return !!k && fechaNoPermitidaParaNoAdmin(k, hoy)
    }
  }, [esAdmin, hoy])

  const preview = useMemo(() => {
    if (!desdeKey || !hastaKey || hastaKey < desdeKey) return null
    if (perfil.vacacionesSinLimite) {
      return {
        diasHabiles: contarDiasHabiles(desdeKey, hastaKey, feriadosKeys),
        teQuedarian: null as number | null,
      }
    }
    const p = previewCargaVacaciones(
      {
        saldoBase: perfil.vacacionesSaldoBase,
        saldoBaseFecha: perfil.vacacionesSaldoBaseFecha,
        diasAnuales: perfil.diasVacacionesAnuales,
        ausencias: ausenciasParaPreview.map(a => ({
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
        feriados: feriadosKeys,
        hoy,
      },
      desdeKey,
      hastaKey
    )
    return { diasHabiles: p.diasHabiles, teQuedarian: p.teQuedarian }
  }, [desdeKey, hastaKey, perfil, ausenciasParaPreview, feriadosKeys, hoy])

  const solapes = useMemo(() => {
    if (!desdeKey || !hastaKey || hastaKey < desdeKey) return []
    return solapamientosVacaciones({
      fechaDesde: desdeKey,
      fechaHasta: hastaKey,
      excluirUserId: perfil.userId,
      personas: miembros.map(m => ({
        userId: m.userId,
        nombre: m.nombre,
        color: m.color,
        fechaNacimiento: m.fechaNacimiento,
      })),
      ausencias: ausencias
        .filter(a => !initial || a.id !== initial.id)
        .map(a => ({
          id: a.id,
          userId: a.userId,
          tipo: a.tipo,
          fechaDesde: a.fechaDesde,
          fechaHasta: a.fechaHasta,
          fechaRecupero: a.fechaRecupero,
        })),
    })
  }, [desdeKey, hastaKey, perfil.userId, miembros, ausencias, initial])

  const rangoInvalido = !!desdeKey && !!hastaKey && hastaKey < desdeKey

  const bloqueado =
    !!saving ||
    calculando ||
    !desdeKey ||
    !hastaKey ||
    rangoInvalido ||
    fechaPasadaBloqueada ||
    superposicionPropia ||
    (preview != null && preview.diasHabiles === 0)

  const handleDesdeChange = (d: Date | undefined) => {
    setDesde(d)
    const dk = dateToKey(d)
    if (!dk) return
    const hk = dateToKey(hasta)
    if (!hk || hk < dk) {
      setHasta(d)
    }
  }

  const handleSave = async () => {
    if (bloqueado || !desdeKey || !hastaKey) return
    await onConfirm({
      fechaDesde: desdeKey,
      fechaHasta: hastaKey,
      nota: nota.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOGO, 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Editar vacaciones' : 'Cargar vacaciones'}
          </DialogTitle>
          <DialogDescription>
            {perfil.nombre}: elegí el rango. Se cargan directo, sin aprobación.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <div className={CAMPO}>
                <DatePicker
                  date={desde}
                  onDateChange={handleDesdeChange}
                  placeholder="Desde"
                  isDateDisabled={bloquearFechaPasada}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <div className={CAMPO}>
                <DatePicker
                  date={hasta}
                  onDateChange={setHasta}
                  placeholder="Hasta"
                  isDateDisabled={bloquearFechaPasada}
                />
              </div>
            </div>
          </div>

          {rangoInvalido ? (
            <Aviso tono="mal">
              «Hasta» no puede ser anterior a «Desde». Ajustá el rango para
              continuar.
            </Aviso>
          ) : null}

          {fechaPasadaBloqueada ? (
            <Aviso>Para hoy o días que ya pasaron, pedíselo a {adminNombre}.</Aviso>
          ) : null}

          {superposicionPropia ? (
            <Aviso tono="mal">
              Ya tenés cargado algo esos días
              {esAdmin ? ` (${perfil.nombre.split(/\s+/)[0]})` : ''}.
            </Aviso>
          ) : null}

          {preview && preview.diasHabiles === 0 ? (
            <Aviso tono="mal">Ese rango no tiene días hábiles.</Aviso>
          ) : null}

          {aniosSinFeriados.length > 0 ? (
            <Aviso>
              Todavía no están cargados los feriados de{' '}
              {aniosSinFeriados.join(', ')}; el número puede cambiar.
            </Aviso>
          ) : null}

          {calculando ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Calculando días…
            </p>
          ) : preview && preview.diasHabiles > 0 ? (
            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-white/[0.04] px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">Días hábiles</p>
                <p className="text-2xl font-semibold tabular-nums tracking-tight">
                  {preview.diasHabiles}
                </p>
              </div>
              {preview.teQuedarian != null ? (
                <div>
                  <p className="text-xs text-muted-foreground">Te quedarían</p>
                  <p
                    className={cn(
                      'text-2xl font-semibold tabular-nums tracking-tight',
                      preview.teQuedarian < 0 && 'text-amber-400'
                    )}
                  >
                    {preview.teQuedarian}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {preview && preview.teQuedarian != null && preview.teQuedarian < 0 ? (
            <Aviso>Te pasás del saldo. Podés cargarlo igual.</Aviso>
          ) : null}

          {solapes.length > 0 ? (
            <Aviso tono="neutro" className="text-muted-foreground">
              {solapes
                .map(s => {
                  const d0 = `${s.fechaDesde.slice(8, 10)}/${s.fechaDesde.slice(5, 7)}`
                  const d1 = `${s.fechaHasta.slice(8, 10)}/${s.fechaHasta.slice(5, 7)}`
                  return `${s.nombre} también está de vacaciones del ${d0} al ${d1}`
                })
                .join('. ')}
              .
            </Aviso>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="vac-nota">Nota (opcional)</Label>
            <Input
              id="vac-nota"
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Sin motivo obligatorio"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={!!saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={bloqueado}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : initial ? (
              'Guardar'
            ) : (
              'Cargar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
