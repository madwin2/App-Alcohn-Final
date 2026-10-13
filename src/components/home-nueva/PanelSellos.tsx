import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Camera,
  Flame,
  PenTool,
  Sparkles,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useOrdersState } from '@/lib/hooks/useOrders'
import { ordenCuentaComoVenta } from '@/lib/pedidos/tipoPedido'
import type {
  FabricationState,
  Order,
  OrderItem,
  ShippingState,
} from '@/lib/types'

/**
 * Sellos de la Home nueva: cinco cuadrados con el conteo de sellos en cada condición. Al tocar
 * uno se expande solo hacia los costados (alto fijo; abajo van otros paneles): los otros se pliegan
 * y los sellos aparecen en fila horizontal. Al cerrarlo vuelven los cinco.
 *
 * Condiciones (sobre los pedidos de `OrdersProvider`, por sello):
 * - Prioritarios: prioritario o con fecha límite, hasta `Seguimiento enviado` (dueño 2026-10-08).
 *   Una Prueba ya Hecha no cuenta.
 * - Para enviar: misma cola que la Home actual (Hecho + Transferido + Sin envío; no Prueba).
 * - Foto pendiente: cola "Enviar foto" de la Home actual (Hecho + Señado; solo ventas).
 * - Especiales: todavía sin definir (pregunta abierta; cuenta hasta `Seguimiento enviado`).
 * - Para vectorizar: mismo criterio que Vectorización → Pendientes (sello en Sin hacer, con
 *   archivo base y sin preview del vector).
 */

/** Mismo traslúcido que la tarjeta de perfil. */
// Mismo material que la barra lateral y la barra de objetivos (negro, borde fino).
const MATERIAL = 'rounded-[28px] border bg-card/95 shadow-2xl'
const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
const CURVA = 'cubic-bezier(0.22,1,0.36,1)'
const ALTO_CUADRADO = 150

type Clave = 'prioritarios' | 'enviar' | 'foto' | 'especiales' | 'vectorizar'

type Fila = {
  id: string
  diseno: string
  cliente: string
  prioritario: boolean
  limite: string | null
  creado: string
  thumb: string | null
  esVector: boolean
  fabricacion: FabricationState
  envio: ShippingState
}

type Grupo = {
  clave: Clave
  titulo: string
  icono: LucideIcon
  filas: Fila[] | null // null = sin definir
  vacio: string
}

function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasHasta(fecha: string, hoy: string) {
  const a = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))
  const b = Date.UTC(
    +fecha.slice(0, 4),
    +fecha.slice(5, 7) - 1,
    +fecha.slice(8, 10)
  )
  return Math.round((b - a) / 86400000)
}

function aFila(order: Order, item: OrderItem): Fila {
  return {
    id: item.id,
    diseno: item.designName || 'Sin nombre',
    cliente:
      `${order.customer.firstName ?? ''} ${order.customer.lastName ?? ''}`.trim() ||
      'Sin cliente',
    prioritario: item.isPriority,
    limite: order.deadlineAt ? order.deadlineAt.slice(0, 10) : null,
    creado: order.createdAt ?? order.orderDate ?? '',
    thumb: item.files?.vectorPreviewUrl || item.files?.baseUrl || null,
    esVector: Boolean(item.files?.vectorPreviewUrl),
    fabricacion: item.fabricationState,
    envio: item.shippingState,
  }
}

/** Con fecha límite primero (vencidos arriba), después del más viejo al más nuevo. */
function ordenar(filas: Fila[]) {
  return filas.sort((a, b) => {
    if (a.limite && b.limite) return a.limite.localeCompare(b.limite)
    if (a.limite) return -1
    if (b.limite) return 1
    return a.creado.localeCompare(b.creado)
  })
}

function useGrupos(): Grupo[] {
  const { operationalOrders } = useOrdersState()
  const pedidos = useDeferredValue(operationalOrders)

  return useMemo(() => {
    const prioritarios: Fila[] = []
    const enviar: Fila[] = []
    const foto: Fila[] = []
    const vectorizar: Fila[] = []
    for (const order of pedidos) {
      for (const item of order.items) {
        const hecho = item.fabricationState === 'HECHO'
        if (
          (item.isPriority || order.deadlineAt) &&
          item.shippingState !== 'SEGUIMIENTO_ENVIADO' &&
          !(order.orderType === 'PRUEBA' && hecho)
        )
          prioritarios.push(aFila(order, item))
        if (
          order.orderType !== 'PRUEBA' &&
          hecho &&
          item.saleState === 'TRANSFERIDO' &&
          item.shippingState === 'SIN_ENVIO'
        )
          enviar.push(aFila(order, item))
        if (ordenCuentaComoVenta(order) && hecho && item.saleState === 'SEÑADO')
          foto.push(aFila(order, item))
        const esSello =
          (item.itemType ??
            (item.stampType === 'ABC' ? 'ABECEDARIO' : 'SELLO')) === 'SELLO'
        if (
          esSello &&
          item.fabricationState === 'SIN_HACER' &&
          item.files?.baseUrl &&
          !item.files?.vectorPreviewUrl
        )
          vectorizar.push(aFila(order, item))
      }
    }
    return [
      {
        clave: 'prioritarios',
        titulo: 'Prioritarios',
        icono: Flame,
        filas: ordenar(prioritarios),
        vacio:
          'No hay sellos prioritarios ni con fecha límite pendientes de envío.',
      },
      {
        clave: 'enviar',
        titulo: 'Para enviar',
        icono: Truck,
        filas: ordenar(enviar),
        vacio: 'No hay sellos hechos y pagos esperando el envío.',
      },
      {
        clave: 'foto',
        titulo: 'Foto pendiente',
        icono: Camera,
        filas: ordenar(foto),
        vacio: 'No hay sellos hechos esperando que se mande la foto.',
      },
      {
        clave: 'especiales',
        titulo: 'Especiales',
        icono: Sparkles,
        filas: null,
        vacio: 'Todavía no está definido qué cuenta como pedido especial.',
      },
      {
        clave: 'vectorizar',
        titulo: 'Para vectorizar',
        icono: PenTool,
        filas: ordenar(vectorizar),
        vacio: 'No hay sellos esperando el vector.',
      },
    ]
  }, [pedidos])
}

/** Dato chico debajo del número de cada cuadrado. */
function detalle(g: Grupo, hoy: string): string | null {
  if (!g.filas) return 'Sin definir'
  const vencidos = g.filas.filter(f => f.limite && f.limite < hoy).length
  if (vencidos) return vencidos === 1 ? '1 vencido' : `${vencidos} vencidos`
  const prio = g.filas.filter(f => f.prioritario).length
  if (g.clave !== 'prioritarios' && prio)
    return prio === 1 ? '1 prioritario' : `${prio} prioritarios`
  const conFecha = g.filas.filter(f => f.limite).length
  if (conFecha)
    return conFecha === 1
      ? '1 con fecha límite'
      : `${conFecha} con fecha límite`
  return null
}

export function PanelSellos({
  className,
  cuadrados,
}: {
  className?: string
  /** Cuáles mostrar (Personalizar); sin esto, todos. */
  cuadrados?: Clave[]
}) {
  const todos = useGrupos()
  const grupos = cuadrados
    ? todos.filter(g => cuadrados.includes(g.clave))
    : todos
  const [abierto, setAbierto] = useState<Clave | null>(null)
  // Si se apaga el que estaba abierto, se cierra.
  useEffect(() => {
    if (abierto && cuadrados && !cuadrados.includes(abierto)) setAbierto(null)
  }, [abierto, cuadrados])
  const hoy = hoyLocal()

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  // Alto fijo: al abrir uno solo crece hacia los costados (abajo van otros paneles).
  return (
    <div
      className={cn('flex w-full', className)}
      style={{ height: ALTO_CUADRADO }}
    >
      {grupos.map((g, i) => {
        const esAbierto = abierto === g.clave
        const oculto = abierto !== null && !esAbierto
        return (
          <div
            key={g.clave}
            className={cn(
              'h-full min-w-0 overflow-hidden',
              oculto && 'pointer-events-none'
            )}
            style={{
              flex: esAbierto ? '1 1 100%' : oculto ? '0 0 0px' : '1 1 0px',
              marginLeft: i === 0 || oculto || esAbierto ? 0 : 12,
              // Los que se van se desvanecen rápido y un poco hacia atrás; al volver, aparecen
              // cuando ya tienen lugar (con retraso), así nunca se ven aplastados.
              opacity: oculto ? 0 : 1,
              transform: oculto ? 'scale(0.96)' : 'none',
              transition: `flex 500ms ${CURVA}, margin 500ms ${CURVA}, opacity ${
                oculto
                  ? '180ms ease-out 0ms'
                  : `320ms ease-out ${abierto === null ? 160 : 0}ms`
              }, transform 500ms ${CURVA}`,
            }}
          >
            <Cuadrado
              orden={i}
              grupo={g}
              hoy={hoy}
              abierto={esAbierto}
              onAbrir={() => setAbierto(g.clave)}
              onCerrar={() => setAbierto(null)}
            />
          </div>
        )
      })}
    </div>
  )
}

function Cuadrado({
  orden,
  grupo: g,
  hoy,
  abierto,
  onAbrir,
  onCerrar,
}: {
  orden: number
  grupo: Grupo
  hoy: string
  abierto: boolean
  onAbrir: () => void
  onCerrar: () => void
}) {
  const Icono = g.icono
  const n = g.filas?.length
  const dato = detalle(g, hoy)
  const alerta = Boolean(g.filas?.some(f => f.limite && f.limite < hoy))

  return (
    <div
      className={cn(MATERIAL, 'entrada relative flex h-full text-white')}
      style={{ '--i': orden + 1 } as React.CSSProperties}
    >
      {/* Resumen: en el cuadrado es todo el botón; abierto, queda a la izquierda */}
      <button
        type="button"
        onClick={abierto ? undefined : onAbrir}
        tabIndex={abierto ? -1 : 0}
        aria-expanded={abierto}
        className={cn(
          'group flex h-full shrink-0 flex-col rounded-[28px] px-6 py-5 text-left outline-none transition-[width,background-color]',
          EASE,
          abierto
            ? 'w-[190px] cursor-default'
            : 'w-full hover:bg-white/[0.025] focus-visible:bg-white/[0.04]'
        )}
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="truncate text-[13px] text-white/55">{g.titulo}</span>
          <Icono
            className={cn(
              'size-4 shrink-0 transition-[color,transform]',
              EASE,
              abierto
                ? 'text-[#e06b17]'
                : 'text-white/30 group-hover:-translate-y-0.5 group-hover:text-[#e06b17]'
            )}
            strokeWidth={1.75}
          />
        </span>
        <span
          className={cn(
            'mt-auto text-[40px] font-semibold leading-none tabular-nums',
            n == null && 'text-white/30'
          )}
        >
          {n ?? '—'}
        </span>
        <span
          className={cn(
            'mt-2 flex h-4 items-center gap-1.5 truncate text-[12px]',
            alerta ? 'text-white/80' : 'text-white/40'
          )}
        >
          {alerta ? (
            <span className="size-1.5 shrink-0 rounded-full bg-[#f6a33d] shadow-[0_0_8px_rgba(246,163,61,0.9)]" />
          ) : null}
          {dato}
        </span>
      </button>

      {/* Sellos en fila horizontal (solo abierto; entran con un fundido al terminar de abrirse) */}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-stretch transition-opacity',
          abierto
            ? 'opacity-100 delay-150 duration-300'
            : 'pointer-events-none opacity-0 duration-150'
        )}
      >
        {abierto ? (
          <>
            <span aria-hidden className="my-5 w-px shrink-0 bg-white/[0.06]" />
            {!g.filas || g.filas.length === 0 ? (
              <div className="flex flex-1 items-center px-6 text-[13px] text-white/45">
                {g.vacio}
              </div>
            ) : (
              <ul
                onWheel={e => {
                  // La rueda vertical también recorre la fila.
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX))
                    e.currentTarget.scrollLeft += e.deltaY
                }}
                className="entrada-lista flex min-w-0 flex-1 gap-2.5 overflow-x-auto py-4 pl-4 pr-14 [scrollbar-width:thin]"
              >
                {g.filas.map(f => (
                  <TarjetaSello key={f.id} f={f} hoy={hoy} clave={g.clave} />
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/40 text-white/55 backdrop-blur transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              <X className="size-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fila de sello                                                        */
/* ------------------------------------------------------------------ */

const FABRICACION: Record<FabricationState, string> = {
  SIN_HACER: 'Sin hacer',
  PROGRAMADO: 'Programado',
  HACIENDO: 'Haciendo',
  VERIFICAR: 'Verificar',
  RETOCAR: 'Retocar',
  REHACER: 'Rehacer',
  HECHO: 'Hecho',
}

const ENVIO: Partial<Record<ShippingState, string>> = {
  SIN_ENVIO: 'Sin envío',
  HACER_ETIQUETA: 'Hacer etiqueta',
  ERROR_ETIQUETA: 'Error de etiqueta',
  ETIQUETA_LISTA: 'Etiqueta lista',
  DESPACHADO: 'Despachado',
}

function textoLimite(
  limite: string | null,
  hoy: string
): { texto: string; urgente: boolean } | null {
  if (!limite) return null
  const d = diasHasta(limite, hoy)
  const texto =
    d < 0
      ? d === -1
        ? 'Venció ayer'
        : `Venció hace ${-d} días`
      : d === 0
        ? 'Vence hoy'
        : d === 1
          ? 'Vence mañana'
          : `Vence en ${d} días`
  return { texto, urgente: d <= 1 }
}

function fechaCorta(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Un sello como tarjetita de la fila horizontal. */
function TarjetaSello({
  f,
  hoy,
  clave,
}: {
  f: Fila
  hoy: string
  clave: Clave
}) {
  const lim = textoLimite(f.limite, hoy)
  // Etapa: 0 = en fabricación, 1 = hecho (por enviar), 2 = despachado (falta el seguimiento).
  const etapa = f.envio === 'DESPACHADO' ? 2 : f.fabricacion === 'HECHO' ? 1 : 0
  const estado: ReactNode =
    clave === 'prioritarios' ? (
      <>
        <span className="truncate">
          {etapa === 0
            ? FABRICACION[f.fabricacion]
            : (ENVIO[f.envio] ?? 'Hecho')}
        </span>
        <Etapas etapa={etapa} />
      </>
    ) : (
      <span className="truncate">Pedido del {fechaCorta(f.creado)}</span>
    )

  return (
    <li className="flex w-[240px] shrink-0 flex-col justify-between rounded-2xl bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg',
            f.esVector ? 'bg-[#F5F5F3]' : 'bg-white/[0.06]'
          )}
        >
          {f.thumb ? (
            <img
              src={f.thumb}
              alt=""
              loading="lazy"
              className="size-full object-contain p-1"
              draggable={false}
            />
          ) : (
            <span className="text-[11px] text-white/30">—</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px]">
            <span className="truncate">{f.diseno}</span>
            {f.prioritario ? (
              <Flame
                className="size-3 shrink-0 text-[#e06b17]"
                aria-label="Prioritario"
              />
            ) : null}
          </p>
          <p className="truncate text-[12px] text-white/45">{f.cliente}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={cn(
            'shrink-0 tabular-nums',
            lim
              ? lim.urgente
                ? 'font-semibold text-[#f6a33d]'
                : 'text-white/70'
              : 'text-white/35'
          )}
        >
          {lim?.texto ?? 'Sin fecha límite'}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-white/45">
          {estado}
        </span>
      </div>
    </li>
  )
}

/** Tres rayitas: fabricación · hecho · despachado. */
function Etapas({ etapa }: { etapa: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={cn(
            'h-1 rounded-full',
            i <= etapa
              ? 'w-3 bg-gradient-to-r from-[#e06b17] to-[#f6a33d]'
              : 'w-1.5 bg-white/15'
          )}
        />
      ))}
    </span>
  )
}
