import { useEffect, useState, type ReactNode } from 'react'
import './temaClaro.css'
import {
  BarChart3,
  ChevronDown,
  Factory,
  Package,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PanelStock, useStockPendiente } from './PanelStock'
import { AreaAdministracion } from './area/AreaAdministracion'
import { AreaEquipo } from './area/AreaEquipo'
import { AreaLogistica } from './area/AreaLogistica'
import { AreaProduccion } from './area/AreaProduccion'
import { AreaVentas } from './area/AreaVentas'
import { pesos } from './area/areaUi'
import {
  useCobros,
  useColaFabricacion,
  useEnvios,
  useMesEnPedidos,
  usePedidosDeHoy,
} from './area/datos'

/**
 * Columna del modo escritorio: Stock y los paneles de área en acordeón, uno arriba del otro.
 * Se abre uno y los otros quedan como encabezado con su número clave (misma lógica que la
 * tarjeta de perfil). Abre en el área del perfil; recuerda el último abierto en este navegador.
 *
 * Los bloques salen de `BLOQUES` (id, título, ícono, número clave y contenido compacto): es la
 * base para que más adelante cada uno elija y ordene los suyos.
 */

export type BloqueId =
  'stock' | 'produccion' | 'ventas' | 'logistica' | 'administracion' | 'equipo'

type Bloque = {
  id: BloqueId
  titulo: string
  icono: LucideIcon
  soloDueno?: boolean
}

export const BLOQUES: Bloque[] = [
  { id: 'stock', titulo: 'Stock pendiente', icono: Package },
  { id: 'produccion', titulo: 'Producción', icono: Factory },
  { id: 'ventas', titulo: 'Ventas', icono: Wallet },
  { id: 'logistica', titulo: 'Logística', icono: Truck },
  {
    id: 'administracion',
    titulo: 'Administración',
    icono: BarChart3,
    soloDueno: true,
  },
  { id: 'equipo', titulo: 'Equipo', icono: Users },
]

// Mismo material que la barra lateral y la barra de objetivos (negro, borde fino).
const MATERIAL = 'rounded-[28px] border bg-card/95 shadow-2xl'
const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
/** Alto del encabezado de cada bloque (py-3 + ícono de 32px). */
const ALTO_ENCABEZADO = 56
const CLAVE = 'home_nueva_acordeon_v1'

/* Número clave de cada bloque (va en el encabezado, abierto o cerrado). */
function Clave({
  valor,
  texto,
  alerta,
}: {
  valor: ReactNode
  texto: string
  alerta?: boolean
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          'text-[15px] font-semibold tabular-nums',
          alerta && 'text-[#f6a33d]'
        )}
      >
        {valor}
      </span>
      <span className="text-[11.5px] text-white/40">{texto}</span>
    </span>
  )
}
function ClaveProduccion() {
  const c = useColaFabricacion()
  return <Clave valor={c.total} texto="por hacer" />
}
function ClaveVentas() {
  const c = useCobros()
  return <Clave valor={pesos(c.porCobrar)} texto="por cobrar" />
}
function ClaveLogistica() {
  const { porEtapa } = useEnvios()
  const err = porEtapa.get('ERROR_ETIQUETA')?.length ?? 0
  return err ? (
    <Clave valor={err} texto={err === 1 ? 'error' : 'errores'} alerta />
  ) : (
    <Clave valor={porEtapa.get('enviar')?.length ?? 0} texto="para enviar" />
  )
}
function ClaveAdministracion() {
  const m = useMesEnPedidos()
  return <Clave valor={pesos(m.cargado)} texto="este mes" />
}
function ClaveEquipo() {
  const h = usePedidosDeHoy()
  return <Clave valor={h.length} texto="pedidos hoy" />
}

export function ColumnaAcordeon({
  userId,
  area,
  esDueno,
  bloques,
  className,
  style,
}: {
  userId: string | null | undefined
  area: string | null | undefined
  esDueno: boolean
  /** Bloques a mostrar (Personalizar); sin esto, todos. */
  bloques?: BloqueId[]
  className?: string
  style?: React.CSSProperties
}) {
  const stock = useStockPendiente(userId)
  const faltan = (stock.entradas ?? []).reduce(
    (s, e) => s + e.payload.shortage,
    0
  )
  const visibles = BLOQUES.filter(
    b => (!b.soloDueno || esDueno) && (!bloques || bloques.includes(b.id))
  )

  const [abierto, setAbierto] = useState<BloqueId>(() => {
    try {
      const g = localStorage.getItem(CLAVE) as BloqueId | null
      if (g && visibles.some(b => b.id === g)) return g
    } catch {
      // ignore
    }
    return (visibles.find(b => b.id === area)?.id ?? 'stock') as BloqueId
  })
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, abierto)
    } catch {
      // ignore
    }
  }, [abierto])

  // Los cuerpos se arman una vez (el abierto enseguida; los demás cuando el navegador está libre) y
  // quedan montados: abrir o cerrar solo anima el alto, sin armar gráficos en medio de la
  // animación (eso era lo que la trababa). El que se cierra se achica con su contenido.
  const [preparados, setPreparados] = useState(false)
  useEffect(() => {
    const listo = () => setPreparados(true)
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(listo, { timeout: 1500 })
      return () => window.cancelIdleCallback(id)
    }
    const t = window.setTimeout(listo, 600)
    return () => window.clearTimeout(t)
  }, [])
  // Si el bloque abierto se apagó en Personalizar, se abre el primero que quede.
  useEffect(() => {
    if (visibles.length && !visibles.some(b => b.id === abierto))
      setAbierto(visibles[0].id)
  }, [visibles, abierto])
  const abrir = (id: BloqueId) => {
    if (id !== abierto) setAbierto(id)
  }

  const clave = (id: BloqueId) => {
    switch (id) {
      case 'stock':
        return stock.entradas === null ? null : faltan ? (
          <Clave valor={faltan} texto="faltan" alerta />
        ) : (
          <Clave valor="Al día" texto="" />
        )
      case 'produccion':
        return <ClaveProduccion />
      case 'ventas':
        return <ClaveVentas />
      case 'logistica':
        return <ClaveLogistica />
      case 'administracion':
        return <ClaveAdministracion />
      case 'equipo':
        return <ClaveEquipo />
    }
  }

  const cuerpo = (id: BloqueId) => {
    switch (id) {
      case 'stock':
        return (
          <PanelStock
            userId={userId}
            datos={stock}
            embebido
            className="h-full"
          />
        )
      case 'produccion':
        return <AreaProduccion variante="compacto" />
      case 'ventas':
        return <AreaVentas variante="compacto" />
      case 'logistica':
        return <AreaLogistica variante="compacto" />
      case 'administracion':
        return <AreaAdministracion variante="compacto" />
      case 'equipo':
        return <AreaEquipo variante="compacto" />
    }
  }

  return (
    <div
      className={cn(
        MATERIAL,
        'flex min-h-0 flex-col overflow-hidden p-2 text-white',
        className
      )}
      style={style}
    >
      {visibles.map((b, i) => {
        const esAbierto = abierto === b.id
        const conCuerpo = esAbierto || preparados
        const Icono = b.icono
        return (
          <div
            key={b.id}
            className={cn(
              // contain: lo que pasa adentro no obliga a recalcular el resto de la columna.
              'flex min-h-0 flex-col overflow-hidden rounded-[22px] transition-[flex-grow,background-color] [contain:layout_paint]',
              EASE,
              // El abierto va en blanco (su contenido pasa a tinta oscura, ver temaClaro.css).
              esAbierto ? 'tema-claro bg-white' : '',
              i > 0 && !esAbierto && abierto !== visibles[i - 1]?.id
                ? 'border-t border-white/[0.05]'
                : ''
            )}
            // Base del alto del encabezado: el abierto crece desde ahí y el que se cierra vuelve a
            // ese alto (con su contenido recortado), los dos con la misma curva.
            style={{ flex: `${esAbierto ? 1 : 0} 1 ${ALTO_ENCABEZADO}px` }}
          >
            <button
              type="button"
              onClick={() => abrir(b.id)}
              aria-expanded={esAbierto}
              className="group flex w-full shrink-0 items-center gap-3 px-4 py-3 text-left outline-none"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors duration-500',
                  esAbierto
                    ? 'bg-[#e06b17]/20 text-[#f6a33d]'
                    : 'bg-white/[0.05] text-white/45 group-hover:text-white/80'
                )}
              >
                <Icono className="size-4" strokeWidth={1.75} />
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13.5px] transition-colors duration-500',
                  esAbierto ? 'text-white' : 'text-white/70'
                )}
              >
                {b.titulo}
              </span>
              {clave(b.id)}
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-white/30 transition-[transform,color]',
                  EASE,
                  esAbierto && 'rotate-180'
                )}
              />
            </button>
            {conCuerpo ? (
              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto px-4 pb-4 transition-[opacity,transform] [contain:layout_paint] [scrollbar-width:thin]',
                  esAbierto
                    ? 'entrada-suave opacity-100 delay-100 duration-500'
                    : 'pointer-events-none -translate-y-1 opacity-0 duration-200'
                )}
                aria-hidden={!esAbierto}
                // inert: lo plegado no recibe foco ni clicks.
                {...((!esAbierto ? { inert: '' } : {}) as object)}
              >
                {cuerpo(b.id)}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
