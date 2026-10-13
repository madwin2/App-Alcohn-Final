import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import type { AreaPrincipalEquipo } from '@/lib/supabase/services/equipo.service'
import { AreaAdministracion } from './area/AreaAdministracion'
import { AreaEquipo } from './area/AreaEquipo'
import { AreaLogistica } from './area/AreaLogistica'
import { AreaProduccion } from './area/AreaProduccion'
import { AreaVentas } from './area/AreaVentas'

/**
 * Panel de área de la Home nueva: lo que cada área tiene que mover hoy. Abre en el área principal
 * del perfil y recuerda la última pestaña elegida (en este navegador). Administración tiene
 * montos: solo la ve el dueño (mismo criterio que Economía).
 */

export type Pestana =
  'produccion' | 'ventas' | 'logistica' | 'administracion' | 'equipo'

const PESTANAS: Array<{ clave: Pestana; texto: string; soloDueno?: boolean }> =
  [
    { clave: 'produccion', texto: 'Producción' },
    { clave: 'ventas', texto: 'Ventas' },
    { clave: 'logistica', texto: 'Logística' },
    { clave: 'administracion', texto: 'Administración', soloDueno: true },
    { clave: 'equipo', texto: 'Equipo' },
  ]

const CLAVE_GUARDADA = 'home_nueva_area_v1'
// Mismo material que la barra lateral y la barra de objetivos (negro, borde fino).
const MATERIAL = 'rounded-[28px] border bg-card/95 shadow-2xl'
const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

function inicial(
  area: AreaPrincipalEquipo | null | undefined,
  esDueno: boolean
): Pestana {
  try {
    const g = localStorage.getItem(CLAVE_GUARDADA) as Pestana | null
    if (
      g &&
      PESTANAS.some(p => p.clave === g) &&
      (g !== 'administracion' || esDueno)
    )
      return g
  } catch {
    // sin almacenamiento: seguimos con el área del perfil
  }
  if (area === 'administracion') return esDueno ? 'administracion' : 'equipo'
  return area ?? 'equipo'
}

export function PanelArea({
  area,
  esDueno,
  areas,
  className,
}: {
  area: AreaPrincipalEquipo | null | undefined
  esDueno: boolean
  /** Pestañas a mostrar (Personalizar); sin esto, todas las que correspondan. */
  areas?: Pestana[]
  className?: string
}) {
  const visibles = PESTANAS.filter(
    p => (!p.soloDueno || esDueno) && (!areas || areas.includes(p.clave))
  )
  const [pestana, setPestana] = useState<Pestana>(() => inicial(area, esDueno))
  // El perfil llega después del primer render: si no se eligió una pestaña a mano, se acomoda.
  const elegidaAMano = useRef(false)
  useEffect(() => {
    if (!elegidaAMano.current) setPestana(inicial(area, esDueno))
  }, [area, esDueno])
  // Si la pestaña elegida se apagó en Personalizar, se muestra la primera que quede.
  const actual: Pestana = visibles.some(p => p.clave === pestana)
    ? pestana
    : (visibles[0]?.clave ?? pestana)
  const i = Math.max(
    0,
    visibles.findIndex(p => p.clave === actual)
  )

  // Hacia qué lado se movió la pestaña: el contenido nuevo entra desde ese lado.
  const anterior = useRef(i)
  const desde = i === anterior.current ? 0 : i > anterior.current ? 1 : -1
  useEffect(() => {
    anterior.current = i
  }, [i])

  const elegir = (p: Pestana) => {
    elegidaAMano.current = true
    setPestana(p)
    try {
      localStorage.setItem(CLAVE_GUARDADA, p)
    } catch {
      // ignore
    }
  }

  return (
    <section
      className={cn(
        MATERIAL,
        'flex min-h-0 min-w-0 flex-col p-3 text-white',
        className
      )}
    >
      {/* Pestañas con indicador que se desliza */}
      <div className="relative mb-3 flex shrink-0 rounded-full bg-white/[0.04] p-1 text-[13px]">
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-1 left-1 rounded-full bg-white/[0.1] transition-transform',
            EASE
          )}
          style={{
            width: `calc((100% - 8px) / ${visibles.length})`,
            transform: `translateX(${i * 100}%)`,
          }}
        />
        {visibles.map(p => (
          <button
            key={p.clave}
            type="button"
            onClick={() => elegir(p.clave)}
            className={cn(
              'relative z-10 min-w-0 flex-1 truncate rounded-full py-1.5 transition-colors',
              actual === p.clave
                ? 'text-white duration-500'
                : 'text-white/45 duration-200 hover:text-white/75'
            )}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {/* Contenido: al cambiar de pestaña entra deslizándose desde el lado de la pestaña nueva */}
      <div
        key={actual}
        className="entrada-lado min-h-0 flex-1"
        style={{ '--desde': desde } as React.CSSProperties}
      >
        {actual === 'produccion' ? <AreaProduccion /> : null}
        {actual === 'ventas' ? <AreaVentas /> : null}
        {actual === 'logistica' ? <AreaLogistica /> : null}
        {actual === 'administracion' && esDueno ? <AreaAdministracion /> : null}
        {actual === 'equipo' ? <AreaEquipo /> : null}
      </div>
    </section>
  )
}
