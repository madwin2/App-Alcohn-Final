import { useEffect, useMemo, useState } from 'react'
import { Flame, RotateCcw, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { todayArgentinaDateKey } from '@/lib/utils/argentinaDate'
import { getPrograms } from '@/lib/supabase/services/programs.service'
import {
  currentMonthRange,
  getBronceConsumo,
  type BronceConsumoResumen,
} from '@/lib/supabase/services/bronceConsumo.service'
import type { Program, ProgramMachineType } from '@/lib/types'
import { Bloque, Cargando } from './areaUi'
import {
  DESVIOS_FABRICACION,
  ETAPAS_FABRICACION,
  useColaFabricacion,
} from './datos'
import { BarrasH, Flujo, Tip } from './graficos'

/**
 * Producción, en gráfico:
 * - La cola de fabricación como flujo de etapas (Sin hacer → Programado → Haciendo → Verificar);
 *   cuanto más intenso el fondo, más sellos hay en esa etapa. Retocar y Rehacer van aparte.
 * - Las máquinas de hoy como tarjetas: programas y sellos, con luz encendida si están fabricando.
 * - El bronce usado este mes por tipo de planchuela (el disponible no se registra, FR-11).
 */

const MAQUINAS: Array<{ clave: ProgramMachineType; texto: string }> = [
  { clave: 'C', texto: 'Chica' },
  { clave: 'G', texto: 'Grande' },
  { clave: 'XL', texto: 'XL' },
  { clave: 'ABC', texto: 'Abecedario' },
]

function useProgramasDeHoy() {
  const [programas, setProgramas] = useState<Program[] | null>(null)
  useEffect(() => {
    let vivo = true
    void getPrograms()
      .then(p => vivo && setProgramas(p))
      .catch(() => vivo && setProgramas([]))
    return () => {
      vivo = false
    }
  }, [])
  const hoy = todayArgentinaDateKey()
  return useMemo(
    () =>
      programas === null
        ? null
        : programas.filter(
            p =>
              (p.productionDate ?? '').slice(0, 10) === hoy ||
              p.estadoPrograma === 'EN_FABRICACION'
          ),
    [programas, hoy]
  )
}

export function useBronceDelMes() {
  const [bronce, setBronce] = useState<BronceConsumoResumen | null | undefined>(
    undefined
  )
  useEffect(() => {
    let vivo = true
    const { desde, hasta } = currentMonthRange()
    void getBronceConsumo(desde, hasta)
      .then(b => vivo && setBronce(b))
      .catch(() => vivo && setBronce(null))
    return () => {
      vivo = false
    }
  }, [])
  return bronce
}

/** Flujo de la cola + desvíos (Retocar / Rehacer) y prioritarios. */
export function ColaFabricacion({ compacto }: { compacto?: boolean }) {
  const cola = useColaFabricacion()
  return (
    <div className="space-y-3">
      <Flujo
        compacto={compacto}
        etapas={ETAPAS_FABRICACION.map(e => ({
          texto: e.texto,
          n: cola.porEstado.get(e.clave) ?? 0,
        }))}
      />
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          compacto ? 'text-[11px]' : 'text-[12px]'
        )}
      >
        {DESVIOS_FABRICACION.map(d => {
          const n = cola.porEstado.get(d.clave) ?? 0
          const Icono = d.clave === 'REHACER' ? RotateCcw : Wrench
          return (
            <Tip
              key={d.clave}
              texto={`${n} sellos para ${d.texto.toLowerCase()} (vuelven a la cola)`}
            >
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1',
                  n
                    ? 'bg-[#f6a33d]/15 text-white/85'
                    : 'bg-white/[0.04] text-white/35'
                )}
              >
                <Icono className={cn('size-3', n ? 'text-[#f6a33d]' : '')} />
                {d.texto} <b className="font-semibold tabular-nums">{n}</b>
              </span>
            </Tip>
          )
        })}
        {cola.prioritarios ? (
          <span className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-white/70">
            <Flame className="size-3 text-[#e06b17]" />
            <b className="font-semibold tabular-nums">
              {cola.prioritarios}
            </b>{' '}
            prioritarios
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Tarjetas de máquina: programas de hoy, sellos y luz de "fabricando". */
export function MaquinasDeHoy({ compacto }: { compacto?: boolean }) {
  const programas = useProgramasDeHoy()
  if (programas === null) return <Cargando />
  return (
    <div className={cn('grid gap-2', 'grid-cols-4')}>
      {MAQUINAS.map(m => {
        const propios = programas.filter(p => p.machine === m.clave)
        const sellos = propios.reduce((s, p) => s + (p.stampCount ?? 0), 0)
        const fabricando = propios.some(
          p => p.estadoPrograma === 'EN_FABRICACION'
        )
        return (
          <Tip
            key={m.clave}
            className="flex"
            texto={
              propios.length
                ? propios.map(p => (
                    <span key={p.id} className="block">
                      {p.name}
                    </span>
                  ))
                : `Sin programas hoy en la ${m.texto}`
            }
          >
            <div
              className={cn(
                'relative flex flex-1 flex-col rounded-2xl bg-white/[0.04] transition-colors hover:bg-white/[0.06]',
                compacto ? 'p-2.5' : 'p-3.5'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'font-semibold text-white/85',
                    compacto ? 'text-[13px]' : 'text-[15px]'
                  )}
                >
                  {m.clave}
                </span>
                <span className="relative flex size-2.5">
                  {fabricando ? (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f6a33d] opacity-60" />
                  ) : null}
                  <span
                    className={cn(
                      'relative inline-flex size-2.5 rounded-full',
                      fabricando
                        ? 'bg-[#f6a33d]'
                        : propios.length
                          ? 'bg-white/40'
                          : 'bg-white/10'
                    )}
                  />
                </span>
              </div>
              {!compacto ? (
                <span className="text-[11px] text-white/40">{m.texto}</span>
              ) : null}
              <p
                className={cn(
                  'mt-auto font-semibold leading-none tabular-nums',
                  compacto ? 'pt-2 text-[18px]' : 'pt-3 text-[26px]',
                  !sellos && 'text-white/25'
                )}
              >
                {sellos}
              </p>
              <p className="mt-1 truncate text-[11px] text-white/40">
                {propios.length
                  ? `${propios.length} prog. · ${fabricando ? 'fabricando' : 'sellos'}`
                  : 'sin programa'}
              </p>
            </div>
          </Tip>
        )
      })}
    </div>
  )
}

export function BronceDelMes({ compacto }: { compacto?: boolean }) {
  const bronce = useBronceDelMes()
  if (bronce === undefined) return <Cargando />
  if (bronce === null)
    return (
      <p className="text-[12px] text-white/35">No se pudo leer el consumo.</p>
    )
  const filas = bronce.rows.filter(r => r.totalCm > 0)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex items-baseline gap-2">
        <span
          className={cn(
            'font-semibold leading-none tabular-nums',
            compacto ? 'text-[22px]' : 'text-[32px]'
          )}
        >
          {Math.round(bronce.totalCm).toLocaleString('es-AR')}
        </span>
        <span className="text-[12px] text-white/45">
          cm · {bronce.totalSellos.toLocaleString('es-AR')} sellos
        </span>
      </p>
      <div className="mt-4">
        {filas.length ? (
          <BarrasH
            items={filas.map(r => ({
              texto: r.label,
              valor: Math.round(r.totalCm),
              tip: `${r.label}: ${Math.round(r.totalCm)} cm en ${r.sellosCount} sellos`,
            }))}
            formato={n => `${n.toLocaleString('es-AR')} cm`}
          />
        ) : (
          <p className="text-[12px] text-white/35">
            Todavía no se usó bronce este mes.
          </p>
        )}
      </div>
      {!compacto ? (
        <p className="mt-auto pt-3 text-[11px] leading-snug text-white/30">
          Lo consumido. El bronce disponible todavía no se registra en la app.
        </p>
      ) : null}
    </div>
  )
}

export function AreaProduccion({
  variante = 'panel',
}: {
  variante?: 'panel' | 'compacto'
}) {
  const cola = useColaFabricacion()

  if (variante === 'compacto') {
    return (
      <div className="space-y-4">
        <ColaFabricacion compacto />
        <MaquinasDeHoy compacto />
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3">
      <Bloque
        titulo="Cola de fabricación"
        ir="/produccion"
        className="col-span-2"
        derecha={
          <span className="text-[12px] text-white/45">
            <b className="font-semibold tabular-nums text-white">
              {cola.total}
            </b>{' '}
            sellos por hacer
          </span>
        }
      >
        <ColaFabricacion />
      </Bloque>
      <Bloque titulo="Máquinas hoy" ir="/programas">
        <MaquinasDeHoy />
      </Bloque>
      <Bloque titulo="Bronce usado este mes" ir="/stock">
        <BronceDelMes />
      </Bloque>
    </div>
  )
}
