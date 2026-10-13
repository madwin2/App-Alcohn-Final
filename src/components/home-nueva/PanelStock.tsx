import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Boxes,
  Check,
  Hammer,
  Loader2,
  Package,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useSalida } from './movimiento'
import { cn } from '@/lib/utils/cn'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabase/client'
import {
  getDashboardTasksForUser,
  type DashboardTask,
} from '@/lib/supabase/services/dashboard-tasks.service'
import {
  applyStockInboundFromReplenishTask,
  parseStockReplenishTask,
  syncStockReplenishTasksForCurrentUser,
  type StockItemKey,
  type StockReplenishPayload,
} from '@/lib/supabase/services/stock.service'

/**
 * Stock de la Home nueva. Mismo funcionamiento que la sección de stock de la Home actual
 * (`StockReplenishSection`): al entrar se sincronizan las tareas `[STOCK_REPLENISH]` del usuario
 * (insumos de los que es responsable, faltante = demanda de pedidos pendientes − stock), se agrupan
 * por insumo y desde acá se carga el ingreso (`add_stock_inbound`), que cierra la tarea.
 *
 * Una sola tarjeta vertical (mismo traslúcido que el perfil): arriba el resumen "Stock
 * pendiente"; debajo una fila por insumo con faltante. Al tocar una se expande hacia abajo con el
 * detalle y el campo de ingreso, y las otras se pliegan.
 */

// Mismo material que la barra lateral y la barra de objetivos (negro, borde fino).
const MATERIAL = 'rounded-[28px] border bg-card/95 shadow-2xl'
const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

type Entrada = { task: DashboardTask; payload: StockReplenishPayload }

function iconoInsumo(key: StockItemKey): LucideIcon {
  switch (key) {
    case 'CAJA_ABECEDARIO':
    case 'SOPORTE_ABECEDARIO':
      return Boxes
    case 'MANGO_GOLPE':
      return Hammer
    case 'SOLDADOR_100W':
    case 'SOLDADOR_200W':
    case 'SOLDADOR_ADAPTADO_100W':
    case 'SOLDADOR_ADAPTADO_200W':
      return Zap
    default:
      return Package
  }
}

/** Una entrada por insumo (mismo criterio que la Home actual). */
function agruparPorInsumo(entradas: Entrada[]): Entrada[] {
  const porClave = new Map<StockItemKey, Entrada>()
  for (const e of entradas) {
    const prev = porClave.get(e.payload.itemKey)
    if (!prev) {
      porClave.set(e.payload.itemKey, e)
      continue
    }
    const preferir =
      (!e.payload.orderId && prev.payload.orderId) ||
      (Boolean(e.payload.orderId) === Boolean(prev.payload.orderId) &&
        e.payload.shortage > prev.payload.shortage)
    if (preferir) porClave.set(e.payload.itemKey, e)
  }
  return [...porClave.values()].sort((a, b) =>
    a.payload.itemName.localeCompare(b.payload.itemName, 'es')
  )
}

export function useStockPendiente(userId: string | null | undefined) {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null)

  const cargar = useCallback(
    async (sincronizar: boolean) => {
      if (!userId) return
      if (sincronizar)
        await syncStockReplenishTasksForCurrentUser().catch(() => {})
      const tareas = await getDashboardTasksForUser(userId)
      const out: Entrada[] = []
      for (const task of tareas) {
        const payload = parseStockReplenishTask(task.texto)
        if (payload) out.push({ task, payload })
      }
      setEntradas(agruparPorInsumo(out))
    },
    [userId]
  )

  useEffect(() => {
    if (!userId) return
    void cargar(true)
    const canal = supabase
      .channel('stock-home-nueva')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas_dashboard' },
        () => void cargar(false)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [userId, cargar])

  return { entradas, recargar: () => cargar(true) }
}

export function PanelStock({
  userId,
  className,
  style,
  embebido,
  datos,
}: {
  userId: string | null | undefined
  className?: string
  style?: React.CSSProperties
  /** Dentro de otro contenedor (acordeón del escritorio): sin marco propio ni resumen arriba. */
  embebido?: boolean
  /** Datos ya cargados por el contenedor (así no se sincroniza dos veces). */
  datos?: ReturnType<typeof useStockPendiente>
}) {
  const propio = useStockPendiente(datos ? null : userId)
  const { entradas, recargar } = datos ?? propio
  const [abierto, setAbierto] = useState<StockItemKey | null>(null)

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  // Si el insumo abierto se resolvió (ya no falta), se cierra solo.
  useEffect(() => {
    if (
      abierto &&
      entradas &&
      !entradas.some(e => e.payload.itemKey === abierto)
    )
      setAbierto(null)
  }, [abierto, entradas])

  const totales = useMemo(() => {
    let necesarias = 0
    let deposito = 0
    let faltan = 0
    for (const { payload } of entradas ?? []) {
      necesarias += payload.needed
      deposito += payload.stockAlMomento
      faltan += payload.shortage
    }
    return { necesarias, deposito, faltan }
  }, [entradas])

  const alDia = entradas !== null && entradas.length === 0

  return (
    <div
      className={cn(
        !embebido && MATERIAL,
        'flex min-h-0 flex-col overflow-hidden text-white',
        className,
        // Sin faltantes no hace falta la columna entera: mide lo que ocupa el resumen.
        alDia && !embebido && 'flex-none self-start'
      )}
      style={style}
    >
      {/* Resumen arriba (embebido, lo muestra el contenedor) */}
      {embebido ? (
        alDia ? (
          <p className="px-4 py-3 text-[13px] text-white/50">
            El stock está al día.
          </p>
        ) : null
      ) : (
        <div className="shrink-0 px-6 pb-4 pt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-white/55">
              {alDia ? 'Stock' : 'Stock pendiente'}
            </p>
            <Link
              to="/stock"
              className="rounded-full p-1 text-white/30 transition-colors hover:text-white/85"
              aria-label="Gestionar stock"
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {entradas === null ? (
            <div className="mt-3 h-10 w-28 animate-pulse rounded-xl bg-white/[0.05]" />
          ) : alDia ? (
            <p className="mt-3 flex items-center gap-2 text-[20px] font-semibold">
              <span className="size-2 rounded-full bg-white/50" />
              El stock está al día
            </p>
          ) : (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-[40px] font-semibold leading-none tabular-nums">
                  {totales.faltan.toLocaleString('es-AR')}
                </span>
                <span className="text-[13px] text-white/45">faltan</span>
              </p>
              <p className="mt-2 truncate text-[12px] tabular-nums text-white/40">
                {totales.necesarias.toLocaleString('es-AR')} necesarias ·{' '}
                {totales.deposito.toLocaleString('es-AR')} en depósito
              </p>
            </>
          )}
        </div>
      )}

      {/* Insumos en filas: el que se abre se expande hacia abajo y los otros se pliegan */}
      {entradas && entradas.length > 0 ? (
        <>
          {!embebido ? (
            <div className="mx-6 h-px shrink-0 bg-white/[0.06]" />
          ) : null}
          <ul className="entrada-lista min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
            {entradas.map(e => {
              const clave = e.payload.itemKey
              const esAbierto = abierto === clave
              const oculto = abierto !== null && !esAbierto
              return (
                <Plegable key={clave} abierto={!oculto}>
                  <FilaInsumo
                    entrada={e}
                    abierto={esAbierto}
                    onAlternar={() => setAbierto(esAbierto ? null : clave)}
                    onCargado={async () => {
                      setAbierto(null)
                      await recargar()
                    }}
                  />
                </Plegable>
              )
            })}
          </ul>
        </>
      ) : null}
    </div>
  )
}

/** Se pliega/despliega con animación de alto (grid 0fr ↔ 1fr). */
function Plegable({
  abierto,
  children,
}: {
  abierto: boolean
  children: React.ReactNode
}) {
  return (
    <li
      className={cn(
        'grid transition-[grid-template-rows,opacity]',
        EASE,
        abierto ? 'opacity-100' : 'opacity-0'
      )}
      style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}
      aria-hidden={!abierto}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </li>
  )
}

function FilaInsumo({
  entrada: { task, payload },
  abierto,
  onAlternar,
  onCargado,
}: {
  entrada: Entrada
  abierto: boolean
  onAlternar: () => void
  onCargado: () => Promise<void>
}) {
  const Icono = iconoInsumo(payload.itemKey)
  // El detalle sigue montado mientras se pliega, así se cierra con su contenido.
  const [conDetalle] = useSalida(abierto)

  return (
    <div
      className={cn(
        'rounded-2xl transition-colors',
        EASE,
        abierto ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
      )}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="group flex w-full items-center gap-3 px-3 py-3 text-left outline-none"
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] transition-colors',
            abierto
              ? 'text-[#e06b17]'
              : 'text-white/45 group-hover:text-[#e06b17]'
          )}
        >
          <Icono className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{payload.itemName}</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-white/40">
            {payload.orderId ? (
              <>
                <span className="size-1.5 shrink-0 rounded-full bg-[#f6a33d] shadow-[0_0_8px_rgba(246,163,61,0.9)]" />
                <span className="text-white/75">Para un envío</span>
              </>
            ) : (
              `${payload.stockAlMomento} en depósito`
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[24px] font-semibold leading-none tabular-nums">
            {payload.shortage}
          </span>
          <span className="text-[12px] text-white/40">faltan</span>
        </span>
        <X
          className={cn(
            'size-4 shrink-0 text-white/45 transition-[opacity,transform,margin]',
            EASE,
            abierto ? 'opacity-100' : '-ml-4 rotate-90 scale-50 opacity-0'
          )}
          aria-label={abierto ? 'Cerrar' : undefined}
          aria-hidden={!abierto}
        />
      </button>

      {/* Detalle + cargar ingreso (se despliega hacia abajo) */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity]',
          EASE,
          abierto ? 'opacity-100' : 'opacity-0 duration-300'
        )}
        style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          {conDetalle ? (
            <div className="space-y-4 px-3 pb-4 pt-1">
              <div className="grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4">
                <Dato etiqueta="Necesarias" valor={payload.needed} />
                <Dato etiqueta="En depósito" valor={payload.stockAlMomento} />
                <Dato etiqueta="Faltan" valor={payload.shortage} resaltado />
              </div>
              {payload.pedidoEtiqueta ? (
                <p className="text-[12px] leading-snug text-white/45">
                  Para el envío de{' '}
                  <span className="text-white/75">
                    {payload.pedidoEtiqueta}
                  </span>
                </p>
              ) : null}
              <CargarIngreso
                task={task}
                payload={payload}
                onCargado={onCargado}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Dato({
  etiqueta,
  valor,
  resaltado,
}: {
  etiqueta: string
  valor: number
  resaltado?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] text-white/45">{etiqueta}</p>
      <p
        className={cn(
          'mt-1 text-[22px] font-semibold leading-none tabular-nums',
          resaltado ? 'text-[#f6a33d]' : 'text-white'
        )}
      >
        {valor.toLocaleString('es-AR')}
      </p>
    </div>
  )
}

/** Mismo movimiento que la Home actual: suma el stock (`add_stock_inbound`) y cierra la tarea. */
function CargarIngreso({
  task,
  payload,
  onCargado,
}: {
  task: DashboardTask
  payload: StockReplenishPayload
  onCargado: () => Promise<void>
}) {
  const { toast } = useToast()
  const [unidades, setUnidades] = useState(
    payload.shortage > 0 ? String(payload.shortage) : ''
  )
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    const n = Number(unidades.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      toast({
        title: 'Cantidad inválida',
        description: 'Ingresá cuántas unidades entraron al depósito.',
        variant: 'destructive',
      })
      return
    }
    setGuardando(true)
    try {
      await applyStockInboundFromReplenishTask({
        taskId: task.id,
        itemKey: payload.itemKey,
        quantity: n,
      })
      toast({
        title: 'Stock actualizado',
        description: `Se sumaron ${n} unidades de ${payload.itemName}.`,
      })
      await onCargado()
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Probá de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-full bg-white/[0.06] pl-4 pr-1.5 text-[13px] text-white/50 focus-within:ring-2 focus-within:ring-[#e06b17]/50">
        Ingresaron
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={unidades}
          onChange={e => setUnidades(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void guardar()}
          aria-label={`Unidades que ingresaron de ${payload.itemName}`}
          className="h-8 w-16 rounded-full bg-black/40 text-center text-[14px] font-semibold tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </label>
      <button
        type="button"
        onClick={() => void guardar()}
        disabled={guardando}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#f6a33d] via-[#e06b17] to-[#b5440f] px-5 text-[13px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(224,107,23,0.9)] transition-[filter,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
      >
        {guardando ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" strokeWidth={2.5} />
        )}
        Registrar ingreso
      </button>
    </div>
  )
}
