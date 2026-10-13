import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronRight,
  Flame,
  Plus,
  Search,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { getPrograms } from '@/lib/supabase/services/programs.service'
import {
  crearIdeaCorcho,
  getIdeasCorcho,
  marcarIdeaCorchoVista,
  setVotoIdeaCorcho,
  type IdeaCorcho,
} from '@/lib/supabase/services/equipoCorcho.service'
import type { ValorVotoCorcho } from '@/lib/equipo/corcho'
import { useOrdersActions, useOrdersState } from '@/lib/hooks/useOrders'
import { useToast } from '@/components/ui/use-toast'
import { NewOrderDialog } from '@/components/pedidos/NewOrder/NewOrderDialog'
import { ClienteProfileDialog } from '@/components/pedidos/ClienteProfile/ClienteProfileDialog'
import {
  getMiFeedback,
  type FeedbackEquipo,
} from '@/lib/supabase/services/equipoFeedback.service'
import {
  getMisNumerosSnapshot,
  type MisNumerosSnapshot,
} from '@/lib/supabase/services/equipoNumeros.service'
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service'
import { useGastosAuto } from '@/lib/hooks/useGastosAuto'
import {
  CATEGORIA_LABEL,
  PROVEEDOR_LABEL,
  type GastoAutoCategoria,
} from '@/lib/gastos/gastosAuto'
import { emojiTipoFeedback, labelTipoFeedback } from '@/lib/equipo/feedback'
import type { FabricationState, Order, Program, SaleState } from '@/lib/types'
import { Cargando, claveDia, hace, nombreCliente, pesos } from '../area/areaUi'
import {
  ETAPAS_ENVIO,
  ETAPAS_FABRICACION,
  DESVIOS_FABRICACION,
  TRANSPORTE,
  useEnvios,
  usePedidos,
  type EtapaEnvio,
} from '../area/datos'
import { BarrasH, Columnas, Flujo } from '../area/graficos'
import { ColaFabricacion, MaquinasDeHoy } from '../area/AreaProduccion'
import { PedidosPorDia, ResumenMes } from '../area/AreaAdministracion'
import { PorCobrar } from '../area/AreaVentas'
import {
  BotonAccion,
  ENVIO,
  FABRICACION,
  MenuEstado,
  Plegable,
  VENTA,
  useCambiarEstado,
} from './acciones'

/**
 * Versiones mini de las pantallas, para las ventanas del modo escritorio de la Home nueva.
 * Cada una es una vista resumida y a medida (no la pantalla completa), pero se puede trabajar:
 * cargar un pedido, cambiar estados de los sellos, proponer y votar ideas. Las acciones usan lo
 * mismo que las pantallas reales (ver `acciones.tsx`); lo que no está, "Abrir completo".
 */

/* ------------------------------ Piezas ------------------------------ */

function Chips<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: Array<{ clave: T; texto: string; n?: number }>
  valor: T
  onCambio: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(o => (
        <button
          key={o.clave}
          type="button"
          onClick={() => onCambio(o.clave)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96]',
            valor === o.clave
              ? 'bg-white text-black'
              : 'bg-white/[0.06] text-white/65 hover:bg-white/[0.1]'
          )}
        >
          {o.texto}
          {o.n != null ? (
            <span
              className={cn(
                'tabular-nums',
                valor === o.clave ? 'text-black/50' : 'text-white/35'
              )}
            >
              {o.n}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function Buscador({
  valor,
  onCambio,
  placeholder,
}: {
  valor: string
  onCambio: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-full bg-white/[0.06] px-3.5 text-[13px] focus-within:ring-2 focus-within:ring-[#e06b17]/50">
      <Search className="size-3.5 text-white/40" />
      <input
        value={valor}
        onChange={e => onCambio(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/30"
      />
    </label>
  )
}

function Seccion({
  titulo,
  children,
  className,
}: {
  titulo?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl bg-white/[0.03] p-4', className)}>
      {titulo ? (
        <p className="mb-3 text-[12.5px] text-white/50">{titulo}</p>
      ) : null}
      {children}
    </section>
  )
}

const VENTA_TEXTO: Record<SaleState, string> = {
  SEÑADO: 'Señado',
  FOTO_ENVIADA: 'Foto enviada',
  TRANSFERIDO: 'Transferido',
  DEUDOR: 'Deudor',
}

const FABRICACION_TEXTO: Record<FabricationState, string> = {
  SIN_HACER: 'Sin hacer',
  PROGRAMADO: 'Programado',
  HACIENDO: 'Haciendo',
  VERIFICAR: 'Verificar',
  RETOCAR: 'Retocar',
  REHACER: 'Rehacer',
  HECHO: 'Hecho',
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/* ------------------------------ Pedidos ------------------------------ */

type FiltroPedidos = 'todos' | 'hoy' | 'prioritarios' | 'esperando' | 'deudores'

export function MiniPedidos() {
  const pedidos = usePedidos()
  const { operationalOrders } = useOrdersState()
  const { createOrder, addStampToOrder, fetchOrders } = useOrdersActions()
  const navigate = useNavigate()
  const { cambiar, dialogo } = useCambiarEstado()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<FiltroPedidos>('todos')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [cliente, setCliente] = useState<Order | null>(null)
  const hoy = claveDia(new Date())

  const conteo = useMemo(() => {
    const f = (fn: (o: Order) => boolean) => pedidos.filter(fn)
    return {
      todos: pedidos,
      hoy: f(
        o => Boolean(o.createdAt) && claveDia(new Date(o.createdAt!)) === hoy
      ),
      prioritarios: f(
        o =>
          o.items.some(it => it.isPriority) &&
          o.items.some(it => it.shippingState !== 'SEGUIMIENTO_ENVIADO')
      ),
      esperando: f(o =>
        o.items.some(
          it =>
            it.fabricationState === 'HECHO' && it.saleState === 'FOTO_ENVIADA'
        )
      ),
      deudores: f(o => o.items.some(it => it.saleState === 'DEUDOR')),
    } satisfies Record<FiltroPedidos, Order[]>
  }, [pedidos, hoy])

  const lista = useMemo(() => {
    const base = conteo[filtro]
    const n = normalizar(q.trim())
    const filtrada = n
      ? base.filter(o =>
          normalizar(
            `${nombreCliente(o.customer)} ${o.items.map(i => i.designName).join(' ')}`
          ).includes(n)
        )
      : base
    return [...filtrada]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 80)
  }, [conteo, filtro, q])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Buscador
            valor={q}
            onCambio={setQ}
            placeholder="Buscar cliente o diseño…"
          />
        </div>
        <BotonAccion
          onClick={() => setNuevo(true)}
          icono={<Plus className="size-4" />}
        >
          Nuevo pedido
        </BotonAccion>
      </div>
      <Chips
        valor={filtro}
        onCambio={setFiltro}
        opciones={[
          { clave: 'todos', texto: 'Todos' },
          { clave: 'hoy', texto: 'Hoy', n: conteo.hoy.length },
          {
            clave: 'prioritarios',
            texto: 'Prioritarios',
            n: conteo.prioritarios.length,
          },
          {
            clave: 'esperando',
            texto: 'Esperando pago',
            n: conteo.esperando.length,
          },
          { clave: 'deudores', texto: 'Deudores', n: conteo.deudores.length },
        ]}
      />
      <ul
        key={filtro}
        className="entrada-lista -mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]"
      >
        {lista.length === 0 ? (
          <li className="py-8 text-center text-[13px] text-white/35">
            No hay pedidos.
          </li>
        ) : null}
        {lista.map(o => {
          const hechos = o.items.filter(
            i => i.fabricationState === 'HECHO'
          ).length
          const venta = o.saleStateOrder ?? o.items[0]?.saleState
          const prio = o.items.some(i => i.isPriority)
          const esAbierto = abierto === o.id
          return (
            <li
              key={o.id}
              className={cn(
                'rounded-xl transition-colors',
                esAbierto ? 'bg-white/[0.045]' : ''
              )}
            >
              <button
                type="button"
                onClick={() => setAbierto(esAbierto ? null : o.id)}
                aria-expanded={esAbierto}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
              >
                <ChevronRight
                  className={cn(
                    'size-3.5 shrink-0 text-white/30 transition-[transform,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                    esAbierto && 'rotate-90 text-white/60'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13px]">
                    <span className="truncate">
                      {nombreCliente(o.customer)}
                    </span>
                    {prio ? (
                      <Flame className="size-3 shrink-0 text-[#e06b17]" />
                    ) : null}
                  </p>
                  <p className="truncate text-[11.5px] text-white/40">
                    {o.items
                      .map(i => i.designName)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(', ') || 'Sin diseño'}
                    {o.items.length > 2 ? ` y ${o.items.length - 2} más` : ''} ·{' '}
                    {hace(o.createdAt)}
                  </p>
                </div>
                {/* Avance de fabricación del pedido */}
                <div
                  className="hidden w-16 shrink-0 sm:block"
                  title={`${hechos} de ${o.items.length} hechos`}
                >
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#94300a] via-[#e06b17] to-[#f6a33d]"
                      style={{
                        width: `${(100 * hechos) / Math.max(1, o.items.length)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-center text-[10px] tabular-nums text-white/35">
                    {hechos}/{o.items.length}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px]',
                    venta === 'DEUDOR'
                      ? 'bg-[#f6a33d]/15 text-[#f6a33d]'
                      : 'bg-white/[0.06] text-white/60'
                  )}
                >
                  {venta ? VENTA_TEXTO[venta] : '—'}
                </span>
                <span className="w-[86px] shrink-0 text-right text-[12.5px] tabular-nums text-white/85">
                  {o.international ? 'Internac.' : pesos(o.totalValue ?? 0)}
                </span>
              </button>

              {/* Detalle: cada sello con sus estados (se cambian como en Pedidos) */}
              <Plegable abierto={esAbierto}>
                <div className="px-2.5 pb-3 pl-8">
                  <ul className="space-y-1.5">
                    {o.items.map(it => (
                      <li
                        key={it.id}
                        className="flex items-center gap-2.5 rounded-lg bg-black/20 p-2"
                      >
                        <Miniatura
                          url={
                            it.files?.vectorPreviewUrl ||
                            it.files?.baseUrl ||
                            null
                          }
                          claro={Boolean(it.files?.vectorPreviewUrl)}
                        />
                        <p className="min-w-0 flex-1 truncate text-[12.5px]">
                          {it.designName || 'Sin nombre'}
                          {it.isPriority ? (
                            <Flame className="ml-1 inline size-3 text-[#e06b17]" />
                          ) : null}
                        </p>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <MenuEstado
                            opciones={FABRICACION}
                            valor={it.fabricationState}
                            onElegir={v =>
                              void cambiar(o, 'fabricationState', v, [it.id])
                            }
                          />
                          <MenuEstado
                            opciones={VENTA}
                            valor={it.saleState}
                            alerta={it.saleState === 'DEUDOR'}
                            onElegir={v =>
                              void cambiar(o, 'saleState', v, [it.id])
                            }
                          />
                          <MenuEstado
                            opciones={ENVIO}
                            valor={it.shippingState}
                            alerta={it.shippingState === 'ERROR_ETIQUETA'}
                            onElegir={v =>
                              void cambiar(o, 'shippingState', v, [it.id])
                            }
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2.5 flex items-center gap-2">
                    <BotonAccion
                      tipo="secundario"
                      onClick={() => setCliente(o)}
                      icono={<UserRound className="size-3.5" />}
                    >
                      Perfil del cliente
                    </BotonAccion>
                    <BotonAccion
                      tipo="secundario"
                      onClick={() => navigate('/pedidos')}
                      icono={<ArrowUpRight className="size-3.5" />}
                    >
                      Ver en Pedidos
                    </BotonAccion>
                    {o.deadlineAt ? (
                      <span className="ml-auto text-[11.5px] tabular-nums text-white/45">
                        Límite{' '}
                        {new Date(o.deadlineAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Plegable>
            </li>
          )
        })}
      </ul>

      {/* Los mismos diálogos que la pantalla de Pedidos */}
      <NewOrderDialog
        open={nuevo}
        onOpenChange={setNuevo}
        createOrder={createOrder}
        addStampToOrder={async (orderId, item, files, options) => {
          await addStampToOrder(orderId, item, files, options)
        }}
        fetchOrders={fetchOrders}
        orders={operationalOrders}
      />
      <ClienteProfileDialog
        open={cliente !== null}
        onOpenChange={open => {
          if (!open) setCliente(null)
        }}
        clienteId={cliente?.customer.id ?? null}
        fallbackName={
          cliente
            ? [cliente.customer.firstName, cliente.customer.lastName]
                .filter(Boolean)
                .join(' ')
                .trim()
            : undefined
        }
      />
      {dialogo}
    </div>
  )
}

function Miniatura({ url, claro }: { url: string | null; claro?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md',
        claro ? 'bg-[#F5F5F3]' : 'bg-white/[0.06]'
      )}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="size-full object-contain p-0.5"
        />
      ) : null}
    </div>
  )
}

/* ------------------------------ Envíos ------------------------------ */

export function MiniEnvios() {
  const { porEtapa } = useEnvios()
  const { cambiar, dialogo } = useCambiarEstado()
  const [etapa, setEtapa] = useState<EtapaEnvio>('enviar')
  const lista = porEtapa.get(etapa) ?? []
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Flujo
        compacto
        etapas={ETAPAS_ENVIO.map(e => ({
          texto: e.texto,
          n: porEtapa.get(e.clave)?.length ?? 0,
          alerta: e.clave === 'ERROR_ETIQUETA',
        }))}
      />
      <Chips
        valor={etapa}
        onCambio={setEtapa}
        opciones={ETAPAS_ENVIO.map(e => ({
          clave: e.clave,
          texto: e.texto,
          n: porEtapa.get(e.clave)?.length ?? 0,
        }))}
      />
      <ul
        key={etapa}
        className="entrada-lista -mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]"
      >
        {lista.length === 0 ? (
          <li className="py-8 text-center text-[13px] text-white/35">
            No hay pedidos en esta etapa.
          </li>
        ) : null}
        {lista.map(o => (
          <li
            key={o.id}
            className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.05]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">
                {nombreCliente(o.customer)}
              </p>
              <p className="truncate text-[11.5px] text-white/40">
                {etapa === 'ERROR_ETIQUETA'
                  ? o.labelErrorMessage ||
                    o.shippingLabelError ||
                    'Error al generar la etiqueta'
                  : o.shipping?.trackingNumber
                    ? `Seguimiento ${o.shipping.trackingNumber}`
                    : `${o.items.length} ${o.items.length === 1 ? 'ítem' : 'ítems'} · ${hace(o.createdAt) ?? ''}`}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-white/45">
              {TRANSPORTE[o.shipping?.carrier ?? 'SIN']}
            </span>
            {/* Estado de envío del pedido (todos sus sellos, como la fila del pedido en Pedidos) */}
            <MenuEstado
              opciones={ENVIO}
              valor={estadoEnvioDe(o)}
              etiqueta={estadoEnvioDe(o) ? undefined : 'Varios'}
              alerta={etapa === 'ERROR_ETIQUETA'}
              onElegir={v => void cambiar(o, 'shippingState', v)}
            />
          </li>
        ))}
      </ul>
      {dialogo}
    </div>
  )
}

/** Estado de envío del pedido si todos sus sellos están igual (si no, null). */
function estadoEnvioDe(o: Order) {
  const s = new Set(o.items.map(i => i.shippingState))
  return s.size === 1 ? o.items[0].shippingState : null
}

/* ---------------------------- Producción ---------------------------- */

export function MiniProduccion() {
  const pedidos = usePedidos()
  const { cambiar, dialogo } = useCambiarEstado()
  const [estado, setEstado] = useState<FabricationState>('SIN_HACER')
  const estados = [...ETAPAS_FABRICACION, ...DESVIOS_FABRICACION]
  const sellos = useMemo(() => {
    const out: Array<{
      id: string
      pedido: Order
      diseno: string
      cliente: string
      prio: boolean
      limite: string | null
      thumb: string | null
      vector: boolean
    }> = []
    for (const o of pedidos)
      for (const it of o.items) {
        if (it.fabricationState !== estado) continue
        if (
          it.shippingState === 'DESPACHADO' ||
          it.shippingState === 'SEGUIMIENTO_ENVIADO'
        )
          continue
        out.push({
          id: it.id,
          pedido: o,
          diseno: it.designName || 'Sin nombre',
          cliente: nombreCliente(o.customer),
          prio: it.isPriority,
          limite: o.deadlineAt ? o.deadlineAt.slice(0, 10) : null,
          thumb: it.files?.vectorPreviewUrl || it.files?.baseUrl || null,
          vector: Boolean(it.files?.vectorPreviewUrl),
        })
      }
    return out.sort(
      (a, b) =>
        Number(b.prio) - Number(a.prio) ||
        (a.limite ?? '9').localeCompare(b.limite ?? '9')
    )
  }, [pedidos, estado])
  const hoy = claveDia(new Date())
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ColaFabricacion compacto />
      <Chips
        valor={estado}
        onCambio={setEstado}
        opciones={estados.map(e => ({ clave: e.clave, texto: e.texto }))}
      />
      <ul
        key={estado}
        className="entrada-lista -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-1 [scrollbar-width:thin]"
      >
        {sellos.length === 0 ? (
          <li className="col-span-2 py-8 text-center text-[13px] text-white/35">
            No hay sellos en {FABRICACION_TEXTO[estado].toLowerCase()}.
          </li>
        ) : null}
        {sellos.map(s => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5"
          >
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg',
                s.vector ? 'bg-[#F5F5F3]' : 'bg-white/[0.06]'
              )}
            >
              {s.thumb ? (
                <img
                  src={s.thumb}
                  alt=""
                  loading="lazy"
                  className="size-full object-contain p-1"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-[12.5px]">
                <span className="truncate">{s.diseno}</span>
                {s.prio ? (
                  <Flame className="size-3 shrink-0 text-[#e06b17]" />
                ) : null}
              </p>
              <p className="truncate text-[11px] text-white/40">{s.cliente}</p>
              {s.limite ? (
                <p
                  className={cn(
                    'text-[10.5px] tabular-nums',
                    s.limite <= hoy
                      ? 'font-semibold text-[#f6a33d]'
                      : 'text-white/45'
                  )}
                >
                  Límite{' '}
                  {new Date(`${s.limite}T12:00:00`).toLocaleDateString(
                    'es-AR',
                    { day: 'numeric', month: 'short' }
                  )}
                </p>
              ) : null}
            </div>
            {/* Pasar el sello al siguiente estado (sale de esta lista y entra en la otra) */}
            <MenuEstado
              opciones={FABRICACION}
              valor={estado}
              onElegir={v =>
                void cambiar(s.pedido, 'fabricationState', v, [s.id])
              }
              className="self-start"
            />
          </li>
        ))}
      </ul>
      {dialogo}
    </div>
  )
}

/* ---------------------------- Programas ----------------------------- */

const ESTADO_PROGRAMA: Record<string, string> = {
  BORRADOR: 'Borrador',
  LISTO: 'Listo',
  BLOQUEADO: 'Bloqueado',
  EN_FABRICACION: 'En fabricación',
  FINALIZADO: 'Finalizado',
}

export function MiniProgramas() {
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
  const recientes = useMemo(
    () =>
      [...(programas ?? [])]
        .sort((a, b) =>
          (b.productionDate ?? '').localeCompare(a.productionDate ?? '')
        )
        .slice(0, 30),
    [programas]
  )
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <MaquinasDeHoy compacto />
      <p className="text-[12.5px] text-white/50">Últimos programas</p>
      {programas === null ? (
        <Cargando />
      ) : (
        <ul className="entrada-lista -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto px-1 [scrollbar-width:thin]">
          {recientes.map(p => (
            <li
              key={p.id}
              className="flex gap-3 rounded-xl bg-white/[0.03] p-2.5"
            >
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06] text-[13px] font-semibold text-white/70">
                {p.previewUrl ? (
                  <img
                    src={p.previewUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  p.machine
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px]">{p.name}</p>
                <p className="truncate text-[11px] text-white/40">
                  {p.machine} · {p.stampCount} sellos ·{' '}
                  {p.productionDate
                    ? new Date(
                        `${p.productionDate.slice(0, 10)}T12:00:00`
                      ).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                      })
                    : ''}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-[11px]',
                    p.estadoPrograma === 'EN_FABRICACION'
                      ? 'font-semibold text-[#f6a33d]'
                      : 'text-white/55'
                  )}
                >
                  {ESTADO_PROGRAMA[p.estadoPrograma] ?? p.estadoPrograma}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------ Corcho ------------------------------ */

export function MiniCorcho({ perfil }: { perfil: PerfilEquipo | null }) {
  const { toast } = useToast()
  const yo = perfil?.userId ?? null
  const [ideas, setIdeas] = useState<IdeaCorcho[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    void getIdeasCorcho()
      .then(i => vivo && setIdeas(i.filter(x => x.estado !== 'descartada')))
      .catch(() => vivo && setIdeas([]))
    return () => {
      vivo = false
    }
  }, [])

  // Las que no viste, primero; después las más nuevas.
  const orden = useMemo(
    () =>
      [...(ideas ?? [])].sort(
        (a, b) =>
          Number(a.vistaPorMi) - Number(b.vistaPorMi) ||
          b.createdAt.localeCompare(a.createdAt)
      ),
    [ideas]
  )

  const cambiarIdea = (id: string, fn: (i: IdeaCorcho) => IdeaCorcho) =>
    setIdeas(l => (l ?? []).map(i => (i.id === id ? fn(i) : i)))

  const publicar = async () => {
    if (!titulo.trim() || guardando) return
    setGuardando(true)
    try {
      const idea = await crearIdeaCorcho({ titulo, descripcion })
      setIdeas(l => [idea, ...(l ?? [])])
      setTitulo('')
      setDescripcion('')
      toast({ title: 'Idea publicada en el corcho' })
    } catch (error) {
      toast({
        title: 'No se pudo publicar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setGuardando(false)
    }
  }

  const votar = async (idea: IdeaCorcho, valor: ValorVotoCorcho) => {
    if (!yo) return
    const actual = idea.votos.find(v => v.userId === yo)?.valor ?? null
    const nuevo = actual === valor ? null : valor
    const antes = idea.votos
    cambiarIdea(idea.id, i => ({
      ...i,
      votos: [
        ...i.votos.filter(v => v.userId !== yo),
        ...(nuevo ? [{ userId: yo, valor: nuevo }] : []),
      ],
    }))
    try {
      await setVotoIdeaCorcho(idea.id, nuevo)
    } catch {
      cambiarIdea(idea.id, i => ({ ...i, votos: antes }))
      toast({ title: 'No se pudo guardar el voto', variant: 'destructive' })
    }
  }

  const abrir = (idea: IdeaCorcho) => {
    setAbierta(a => (a === idea.id ? null : idea.id))
    if (!idea.vistaPorMi) {
      cambiarIdea(idea.id, i => ({ ...i, vistaPorMi: true }))
      void marcarIdeaCorchoVista(idea.id).catch(() => undefined)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Proponer una idea (igual que en el Corcho) */}
      <div className="rounded-2xl bg-white/[0.04] p-2">
        <div className="flex items-center gap-2">
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void publicar()
            }}
            placeholder="Proponé una idea…"
            maxLength={200}
            className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[13px] text-white outline-none placeholder:text-white/30"
          />
          <BotonAccion
            onClick={() => void publicar()}
            disabled={!titulo.trim() || guardando}
            icono={<Plus className="size-4" />}
          >
            Publicar
          </BotonAccion>
        </div>
        <Plegable abierto={titulo.trim().length > 0}>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Contá un poco más (opcional)"
            rows={2}
            className="mt-1 w-full resize-none rounded-xl bg-black/20 px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-white/30"
          />
        </Plegable>
      </div>

      {ideas === null ? (
        <Cargando />
      ) : orden.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-white/35">
          No hay ideas activas.
        </p>
      ) : (
        <ul className="entrada-lista -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 [scrollbar-width:thin]">
          {orden.map(i => {
            const mio = yo
              ? (i.votos.find(v => v.userId === yo)?.valor ?? null)
              : null
            const a = i.votos.filter(v => v.valor > 0).length
            const e = i.votos.filter(v => v.valor < 0).length
            return (
              <li
                key={i.id}
                className={cn(
                  'rounded-xl transition-colors',
                  i.vistaPorMi ? 'bg-white/[0.03]' : 'bg-[#f6a33d]/[0.08]'
                )}
              >
                <button
                  type="button"
                  onClick={() => abrir(i)}
                  className="flex w-full items-start gap-2 px-3 pt-2.5 text-left"
                >
                  {!i.vistaPorMi ? (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#f6a33d] shadow-[0_0_8px_rgba(246,163,61,0.9)]" />
                  ) : null}
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">
                    {i.titulo}
                  </span>
                </button>
                <Plegable abierto={abierta === i.id}>
                  <p className="whitespace-pre-line px-3 pt-1.5 text-[12px] leading-relaxed text-white/60">
                    {i.descripcion || 'Sin descripción.'}
                  </p>
                </Plegable>
                <div className="flex items-center gap-3 px-3 pb-2 pt-1.5 text-[11px] text-white/45">
                  <span>{ESTADO_IDEA[i.estado] ?? i.estado}</span>
                  <span>{hace(i.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-1 tabular-nums">
                    <BotonVoto
                      activo={mio === 1}
                      onClick={() => void votar(i, 1)}
                      deshabilitado={!yo}
                      titulo="A favor"
                    >
                      <ThumbsUp className="size-3" /> {a}
                    </BotonVoto>
                    <BotonVoto
                      activo={mio === -1}
                      onClick={() => void votar(i, -1)}
                      deshabilitado={!yo}
                      titulo="En contra"
                    >
                      <ThumbsDown className="size-3" /> {e}
                    </BotonVoto>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const ESTADO_IDEA: Record<string, string> = {
  propuesta: 'Propuesta',
  aprobada: 'Aprobada',
  descartada: 'Descartada',
}

function BotonVoto({
  activo,
  onClick,
  deshabilitado,
  titulo,
  children,
}: {
  activo: boolean
  onClick: () => void
  deshabilitado?: boolean
  titulo: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      title={titulo}
      aria-pressed={activo}
      className={cn(
        'flex h-6 items-center gap-1 rounded-full px-2 transition-colors disabled:opacity-50',
        activo
          ? 'bg-[#e06b17]/25 text-[#f6a33d]'
          : 'hover:bg-white/[0.08] hover:text-white'
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------ Perfil ------------------------------ */

export function MiniPerfil({ perfil }: { perfil: PerfilEquipo | null }) {
  const [numeros, setNumeros] = useState<MisNumerosSnapshot | null | undefined>(
    undefined
  )
  const [feedback, setFeedback] = useState<FeedbackEquipo[] | null>(null)
  useEffect(() => {
    if (!perfil) return
    let vivo = true
    void getMisNumerosSnapshot({
      userId: perfil.userId,
      areaPrincipal: perfil.areaPrincipal,
      periodo: 'mes',
    })
      .then(s => vivo && setNumeros(s))
      .catch(() => vivo && setNumeros(null))
    void getMiFeedback()
      .then(f => vivo && setFeedback(f))
      .catch(() => vivo && setFeedback([]))
    return () => {
      vivo = false
    }
  }, [perfil])

  if (!perfil)
    return (
      <p className="py-8 text-center text-[13px] text-white/35">
        Tu usuario no tiene perfil en el equipo.
      </p>
    )
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
      <Seccion
        titulo={
          <>
            Mis números
            {numeros?.labelPeriodo ? ` · ${numeros.labelPeriodo}` : ''}
          </>
        }
        className="flex min-h-0 flex-col"
      >
        {numeros === undefined ? (
          <Cargando />
        ) : numeros === null ? (
          <p className="text-[12px] text-white/35">No se pudieron leer.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {numeros.metricas.slice(0, 4).map(m => (
                <div key={m.key} className="min-w-0">
                  <p className="text-[24px] font-semibold leading-none tabular-nums">
                    {m.valor.toLocaleString('es-AR')}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] text-white/50">
                    {m.titulo}
                  </p>
                  <p className="truncate text-[10.5px] text-white/30">
                    {m.comparacion}
                  </p>
                </div>
              ))}
            </div>
            <p className="mb-2 mt-4 text-[11.5px] text-white/45">
              {numeros.serieTitulo}
            </p>
            <div className="min-h-[110px] flex-1">
              <Columnas
                datos={numeros.serie6Meses.map((d, i, arr) => ({
                  clave: d.key,
                  etiqueta: d.label,
                  valor: d.value,
                  destacado: i === arr.length - 1,
                  tip: `${d.label}: ${d.value}`,
                }))}
              />
            </div>
          </>
        )}
      </Seccion>
      <Seccion titulo="Feedback recibido" className="flex min-h-0 flex-col">
        {feedback === null ? (
          <Cargando />
        ) : feedback.length === 0 ? (
          <p className="text-[12px] text-white/35">
            Todavía no recibiste feedback.
          </p>
        ) : (
          <ul className="entrada-lista -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 [scrollbar-width:thin]">
            {feedback.slice(0, 12).map(f => (
              <li
                key={f.id}
                className={cn(
                  'rounded-xl px-3 py-2.5',
                  f.leidoAt ? 'bg-white/[0.03]' : 'bg-[#f6a33d]/[0.08]'
                )}
              >
                <p className="flex items-center gap-1.5 text-[11.5px] text-white/50">
                  <span>{emojiTipoFeedback(f.tipo)}</span>
                  {labelTipoFeedback(f.tipo)} · {hace(f.createdAt)}
                </p>
                <p className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-white/85">
                  {f.titulo || f.texto}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  )
}

/* ----------------------------- Economía ----------------------------- */

export function MiniEconomia() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Seccion>
        <ResumenMes />
      </Seccion>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
        <Seccion
          titulo="Pedidos por día · últimos 14 días"
          className="flex min-h-0 flex-col"
        >
          <div className="min-h-[120px] flex-1">
            <PedidosPorDia />
          </div>
        </Seccion>
        <Seccion titulo="Por cobrar" className="min-h-0 overflow-y-auto">
          <PorCobrar compacto />
        </Seccion>
      </div>
    </div>
  )
}

/* ------------------------------ Gastos ------------------------------ */

export function MiniGastos() {
  const gastos = useGastosAuto(true)
  const mes = claveDia(new Date()).slice(0, 7)
  const val = gastos.porMes[mes]
  if (gastos.loading && !gastos.data) return <Cargando />
  if (!val)
    return (
      <p className="py-8 text-center text-[13px] text-white/35">
        Sin gastos registrados este mes.
      </p>
    )
  const categorias = (Object.keys(val.porCategoria) as GastoAutoCategoria[])
    .map(c => ({
      texto: CATEGORIA_LABEL[c],
      valor: Math.round(val.porCategoria[c]),
    }))
    .filter(c => c.valor > 0)
  const conceptos = [...val.conceptos]
    .sort((a, b) => b.ars - a.ars)
    .slice(0, 8)
    .map(c => ({
      texto: `${PROVEEDOR_LABEL[c.proveedor] ?? c.proveedor} · ${c.concepto}`,
      valor: Math.round(c.ars),
    }))
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-3">
      <Seccion titulo="Este mes, con IVA" className="flex min-h-0 flex-col">
        <p className="text-[30px] font-semibold leading-none tabular-nums">
          {pesos(val.total)}
        </p>
        <p className="mt-1.5 text-[11.5px] text-white/40">
          {val.usdPendiente > 0
            ? `US$ ${Math.round(val.usdPendiente).toLocaleString('es-AR')} pendientes de pagar`
            : 'Dólares del mes pagados'}
        </p>
        <div className="mt-5">
          <BarrasH items={categorias} formato={pesos} />
        </div>
      </Seccion>
      <Seccion
        titulo="Conceptos más grandes"
        className="min-h-0 overflow-y-auto"
      >
        <BarrasH items={conceptos} formato={pesos} />
      </Seccion>
    </div>
  )
}
