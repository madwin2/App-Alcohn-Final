import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  Factory,
  Layers,
  Pin,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  User,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { IconosVidrio } from './IconosVidrio'
import type { AppId } from '../vista'
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service'
import {
  MiniCorcho,
  MiniEconomia,
  MiniEnvios,
  MiniGastos,
  MiniPedidos,
  MiniPerfil,
  MiniProduccion,
  MiniProgramas,
} from './apps'

/**
 * Modo escritorio de la Home nueva: íconos de apps de vidrio líquido sobre el fondo (como un
 * escritorio de PC; el vidrio es el mismo material que el de prueba y refracta la lava real).
 * Un click selecciona, doble click (o Enter) abre una ventana con la versión mini de esa pantalla.
 * Ventanas con los tres botones (cerrar, minimizar, maximizar), se arrastran por la barra de
 * título, se agrandan desde la esquina y la que se toca pasa adelante. "Abrir completo" lleva a
 * la pantalla real.
 */

type App = {
  id: AppId
  titulo: string
  icono: LucideIcon
  ruta: string
  soloDueno?: boolean
  Mini: ComponentType<{ perfil: PerfilEquipo | null }>
}

const APPS: App[] = [
  {
    id: 'pedidos',
    titulo: 'Pedidos',
    icono: ShoppingCart,
    ruta: '/pedidos',
    Mini: MiniPedidos,
  },
  {
    id: 'envios',
    titulo: 'Envíos',
    icono: Truck,
    ruta: '/envios',
    Mini: MiniEnvios,
  },
  {
    id: 'produccion',
    titulo: 'Producción',
    icono: Factory,
    ruta: '/produccion',
    Mini: MiniProduccion,
  },
  {
    id: 'programas',
    titulo: 'Programas',
    icono: Layers,
    ruta: '/programas',
    Mini: MiniProgramas,
  },
  {
    id: 'corcho',
    titulo: 'Corcho',
    icono: Pin,
    ruta: '/corcho',
    Mini: MiniCorcho,
  },
  {
    id: 'perfil',
    titulo: 'Mi perfil',
    icono: User,
    ruta: '/perfil',
    Mini: MiniPerfil,
  },
  {
    id: 'economia',
    titulo: 'Economía',
    icono: TrendingUp,
    ruta: '/economia',
    soloDueno: true,
    Mini: MiniEconomia,
  },
  {
    id: 'gastos',
    titulo: 'Gastos',
    icono: Receipt,
    ruta: '/gastos',
    soloDueno: true,
    Mini: MiniGastos,
  },
]

type Ventana = {
  id: AppId
  x: number
  y: number
  w: number
  h: number
  z: number
  minimizada: boolean
  maximizada: boolean
  /** Centro del ícono de la app (coordenadas del escritorio): la ventana nace, se minimiza y
   *  se cierra hacia ahí. */
  ox: number
  oy: number
  cerrando: boolean
}

const MIN_W = 440
/** Lado de cada ícono de vidrio (tamaño de ícono de escritorio). */
const TAM_ICONO = 60
const MIN_H = 320

export function Escritorio({
  perfil,
  esDueno,
  apps: elegidas,
  className,
}: {
  perfil: PerfilEquipo | null
  esDueno: boolean
  /** Apps a mostrar (Personalizar); sin esto, todas las que correspondan. */
  apps?: AppId[]
  className?: string
}) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const apps = APPS.filter(
    a => (!a.soloDueno || esDueno) && (!elegidas || elegidas.includes(a.id))
  )
  const [seleccion, setSeleccion] = useState<AppId | null>(null)
  const [encima, setEncima] = useState<AppId | null>(null)
  const [ventanas, setVentanas] = useState<Ventana[]>([])
  const zTop = useRef(10)

  const traerAdelante = useCallback((id: AppId) => {
    zTop.current += 1
    const z = zTop.current
    setVentanas(vs =>
      vs.map(v => (v.id === id ? { ...v, z, minimizada: false } : v))
    )
  }, [])

  const abrir = useCallback(
    (id: AppId) => {
      setVentanas(vs => {
        // Si se estaba cerrando, vuelve.
        if (vs.some(v => v.id === id))
          return vs.map(v => (v.id === id ? { ...v, cerrando: false } : v))
        const r = ref.current?.getBoundingClientRect()
        const ancho = r?.width ?? 1000
        const alto = r?.height ?? 600
        const w = Math.max(MIN_W, Math.min(760, ancho * 0.72))
        const h = Math.max(MIN_H, Math.min(520, alto * 0.86))
        const n = vs.length
        const icono = ref.current
          ?.querySelector<HTMLElement>(`[data-app="${id}"]`)
          ?.getBoundingClientRect()
        const ox =
          icono && r ? icono.left + icono.width / 2 - r.left : ancho / 2
        const oy = icono && r ? icono.top + icono.height / 2 - r.top : alto / 2
        zTop.current += 1
        return [
          ...vs,
          {
            id,
            // Centradas en el escritorio, en cascada.
            x: Math.max(0, Math.min(ancho - w, (ancho - w) / 2 + n * 28)),
            y: Math.max(0, Math.min(alto - h, (alto - h) / 2 + n * 24)),
            w,
            h,
            z: zTop.current,
            minimizada: false,
            // Doble click abre la ventana ya maximizada (al restaurarla queda centrada).
            maximizada: true,
            ox,
            oy,
            cerrando: false,
          },
        ]
      })
      traerAdelante(id)
    },
    [traerAdelante]
  )

  // Se encoge hacia su ícono y después se saca.
  const cerrar = (id: AppId) => {
    setVentanas(vs => vs.map(v => (v.id === id ? { ...v, cerrando: true } : v)))
    window.setTimeout(
      () => setVentanas(vs => vs.filter(v => v.id !== id || !v.cerrando)),
      320
    )
  }
  const actualizar = (id: AppId, cambio: Partial<Ventana>) =>
    setVentanas(vs => vs.map(v => (v.id === id ? { ...v, ...cambio } : v)))

  // Enter abre el seleccionado; Escape lo deselecciona.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!seleccion) return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (e.key === 'Enter') abrir(seleccion)
      if (e.key === 'Escape') setSeleccion(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seleccion, abrir])

  return (
    <div
      ref={ref}
      className={cn(
        'relative min-h-0 overflow-hidden rounded-[28px]',
        className
      )}
      onPointerDown={e => {
        if (e.target === e.currentTarget) setSeleccion(null)
      }}
    >
      {/* Vidrio líquido de los íconos (un solo canvas detrás de todos) */}
      <IconosVidrio contenedor={ref} />

      {/* Íconos de vidrio como en un escritorio de PC: arrancan arriba a la izquierda y se acomodan
          en columnas. Solo el símbolo; el nombre aparece al pasar el mouse. Hover: el vidrio crece
          con un rebote y el borde se enciende. */}
      <div
        className="grid h-full auto-cols-max grid-flow-col content-start justify-start gap-x-7 gap-y-9 px-6 py-5"
        style={{
          gridTemplateRows: `repeat(auto-fill, ${TAM_ICONO}px)`,
        }}
        onPointerDown={e => {
          if (e.target === e.currentTarget) setSeleccion(null)
        }}
      >
        {apps.map(a => {
          const Icono = a.icono
          const v = ventanas.find(x => x.id === a.id)
          const sel = seleccion === a.id
          const brilla = sel || encima === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setSeleccion(a.id)}
              onDoubleClick={() => abrir(a.id)}
              onPointerEnter={() => setEncima(a.id)}
              onPointerLeave={() => setEncima(e => (e === a.id ? null : e))}
              aria-label={`Abrir ${a.titulo} (doble click)`}
              data-app={a.id}
              className="group relative flex select-none flex-col items-center outline-none"
            >
              <span
                data-vidrio
                data-brillo={brilla ? '1' : '0'}
                className="relative flex items-center justify-center rounded-[30%] transition-transform duration-[450ms] ease-[cubic-bezier(0.34,1.3,0.64,1)] group-hover:-translate-y-[2px] group-hover:scale-[1.06] group-active:translate-y-0 group-active:scale-[0.94] group-active:duration-150"
                style={{
                  width: TAM_ICONO,
                  aspectRatio: '1 / 1',
                }}
              >
                <Icono
                  className="size-[42%] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-transform duration-[450ms] ease-[cubic-bezier(0.34,1.3,0.64,1)] group-hover:scale-105"
                  strokeWidth={1.75}
                />
              </span>
              {/* Nombre: aparece al pasar el mouse o si está seleccionado */}
              <span
                className={cn(
                  'pointer-events-none absolute -bottom-8 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] text-white transition-[opacity,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]',
                  sel ? 'bg-[#e06b17]/80' : '',
                  brilla
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-1 opacity-0'
                )}
              >
                {a.titulo}
              </span>
              {/* Puntito: la app tiene una ventana abierta o minimizada */}
              <span
                className={cn(
                  'absolute -bottom-2.5 size-1.5 rounded-full transition-[opacity,background-color] duration-300',
                  brilla ? 'opacity-0' : 'opacity-100',
                  v
                    ? v.minimizada
                      ? 'bg-white/40'
                      : 'bg-white/90'
                    : 'bg-transparent'
                )}
              />
            </button>
          )
        })}
      </div>

      {/* Ventanas */}
      {ventanas.map(v => {
        const app = apps.find(a => a.id === v.id)
        // La app se apagó en Personalizar: su ventana no se muestra.
        if (!app) return null
        return (
          <VentanaPC
            key={v.id}
            app={app}
            v={v}
            contenedor={ref}
            onFoco={() => traerAdelante(v.id)}
            onCerrar={() => cerrar(v.id)}
            onCambio={c => actualizar(v.id, c)}
            onCompleto={() => navigate(app.ruta)}
          >
            <app.Mini perfil={perfil} />
          </VentanaPC>
        )
      })}
    </div>
  )
}

function VentanaPC({
  app,
  v,
  contenedor,
  onFoco,
  onCerrar,
  onCambio,
  onCompleto,
  children,
}: {
  app: App
  v: Ventana
  contenedor: React.RefObject<HTMLDivElement>
  onFoco: () => void
  onCerrar: () => void
  onCambio: (c: Partial<Ventana>) => void
  onCompleto: () => void
  children: React.ReactNode
}) {
  const Icono = app.icono
  const gesto = useRef<{
    tipo: 'mover' | 'tamano'
    x: number
    y: number
    v: Ventana
  } | null>(null)
  const [activo, setActivo] = useState(false)

  useEffect(() => {
    if (!activo) return
    const mover = (e: PointerEvent) => {
      const g = gesto.current
      const r = contenedor.current?.getBoundingClientRect()
      if (!g || !r) return
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (g.tipo === 'mover') {
        onCambio({
          x: Math.min(r.width - 80, Math.max(-g.v.w + 120, g.v.x + dx)),
          y: Math.min(r.height - 40, Math.max(0, g.v.y + dy)),
        })
      } else {
        onCambio({
          w: Math.min(r.width - g.v.x, Math.max(MIN_W, g.v.w + dx)),
          h: Math.min(r.height - g.v.y, Math.max(MIN_H, g.v.h + dy)),
        })
      }
    }
    const soltar = () => {
      gesto.current = null
      setActivo(false)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [activo, contenedor, onCambio])

  const empezar = (tipo: 'mover' | 'tamano') => (e: React.PointerEvent) => {
    if (e.button !== 0 || v.maximizada) return
    if ((e.target as HTMLElement).closest('[data-boton]')) return
    e.preventDefault()
    gesto.current = { tipo, x: e.clientX, y: e.clientY, v }
    setActivo(true)
  }

  const izq = v.maximizada ? 0 : v.x
  const arriba = v.maximizada ? 0 : v.y
  const estilo: React.CSSProperties = {
    ...(v.maximizada
      ? { left: 0, top: 0, width: '100%', height: '100%' }
      : { left: v.x, top: v.y, width: v.w, height: v.h }),
    zIndex: v.z,
    // Nace, se minimiza y se cierra desde/hacia su ícono.
    transformOrigin: `${v.ox - izq}px ${v.oy - arriba}px`,
  }
  const escondida = v.minimizada || v.cerrando

  return (
    <div
      onPointerDown={onFoco}
      className={cn(
        'ventana-abre absolute flex flex-col overflow-hidden rounded-[16px] border bg-card/95 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]',
        escondida && 'pointer-events-none scale-[0.2] opacity-0',
        !activo &&
          'transition-[left,top,width,height,opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        !activo && escondida && 'duration-300'
      )}
      style={estilo}
      data-tapa={v.maximizada && !escondida ? '' : undefined}
    >
      {/* Barra de título */}
      <div
        onPointerDown={empezar('mover')}
        onDoubleClick={() => onCambio({ maximizada: !v.maximizada })}
        className={cn(
          'flex h-10 shrink-0 select-none items-center gap-3 border-b border-white/[0.06] bg-white/[0.035] px-3.5',
          !v.maximizada && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <div className="group/semaforo flex items-center gap-2" data-boton>
          <button
            type="button"
            data-boton
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex size-3 items-center justify-center rounded-full bg-[#ff5f57] text-[9px] leading-none text-black/60"
          >
            <span className="opacity-0 group-hover/semaforo:opacity-100">
              ×
            </span>
          </button>
          <button
            type="button"
            data-boton
            onClick={() => onCambio({ minimizada: true })}
            aria-label="Minimizar"
            className="flex size-3 items-center justify-center rounded-full bg-[#febc2e] text-[9px] leading-none text-black/60"
          >
            <span className="opacity-0 group-hover/semaforo:opacity-100">
              −
            </span>
          </button>
          <button
            type="button"
            data-boton
            onClick={() => onCambio({ maximizada: !v.maximizada })}
            aria-label={v.maximizada ? 'Restaurar' : 'Maximizar'}
            className="flex size-3 items-center justify-center rounded-full bg-[#28c840] text-[8px] leading-none text-black/60"
          >
            <span className="opacity-0 group-hover/semaforo:opacity-100">
              +
            </span>
          </button>
        </div>
        <p className="flex min-w-0 flex-1 items-center justify-center gap-2 truncate text-[12.5px] text-white/75">
          <Icono
            className="size-3.5 shrink-0 text-[#f6a33d]"
            strokeWidth={1.8}
          />
          {app.titulo}
        </p>
        <button
          type="button"
          data-boton
          onClick={onCompleto}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Abrir completo
          <ArrowUpRight className="size-3" />
        </button>
      </div>

      {/* Contenido: la versión mini */}
      <div className="min-h-0 flex-1 p-4">{children}</div>

      {/* Agrandar desde la esquina */}
      {!v.maximizada ? (
        <div
          onPointerDown={empezar('tamano')}
          className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
          aria-hidden
        >
          <span className="absolute bottom-1 right-1 size-2 rounded-br-[4px] border-b-2 border-r-2 border-white/25" />
        </div>
      ) : null}
    </div>
  )
}
