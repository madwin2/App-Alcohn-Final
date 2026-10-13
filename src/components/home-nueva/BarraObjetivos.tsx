import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useAparecer } from './movimiento'
import { cn } from '@/lib/utils/cn'
import { useOrdersState } from '@/lib/hooks/useOrders'
import { itemCuentaComoVenta } from '@/lib/pedidos/tipoPedido'
import { META_ITEMS_DIA, META_ITEMS_MES } from '@/lib/metas'
import { metaDelDia, type MetaVentasMes } from '@/lib/metas/dinamica'
import { fetchMetaVentasVigente } from '@/lib/supabase/services/metasVentas.service'
import { fetchFeriados } from '@/lib/supabase/services/gastosAuto.service'

/**
 * Barra de objetivos de la Home nueva: sellos de hoy y del mes contra la meta.
 *
 * Mismo cálculo que la Home actual: solo ventas reales (`itemCuentaComoVenta`), contadas por
 * fecha de carga del pedido; la meta del mes es la que publica Economía (`metas_ventas`) y lo de
 * hoy sale de `metaDelDia` (días hábiles). Si no hay meta publicada, usa los objetivos fijos
 * (POL-028).
 */

const EASE = 'duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]'
const GRADIENTE = 'bg-gradient-to-r from-[#94300a] via-[#e06b17] to-[#f6a33d]'

function claveLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function useObjetivos() {
  const { operationalOrders } = useOrdersState()
  const pedidos = useDeferredValue(operationalOrders)
  const hoy = claveLocal(new Date())
  const mes = hoy.slice(0, 7)

  const { vendidosMes, vendidosHoy, sellosPorDia } = useMemo(() => {
    let delMes = 0
    let deHoy = 0
    const porDia = new Map<string, number>()
    for (const order of pedidos) {
      const createdAt = order.createdAt ? new Date(order.createdAt) : null
      const orderDateStr = order.orderDate?.split('T')[0]
      const ref =
        createdAt ??
        (orderDateStr ? new Date(`${orderDateStr}T12:00:00`) : null)
      if (!ref) continue
      const fecha = claveLocal(ref)
      if (fecha.slice(0, 7) !== mes) continue
      for (const item of order.items) {
        if (!itemCuentaComoVenta(order, item)) continue
        delMes += 1
        if (fecha === hoy) deHoy += 1
        const esSello =
          (item.itemType ??
            (item.stampType === 'ABC' ? 'ABECEDARIO' : 'SELLO')) === 'SELLO'
        if (esSello) porDia.set(fecha, (porDia.get(fecha) ?? 0) + 1)
      }
    }
    return {
      vendidosMes: delMes,
      vendidosHoy: deHoy,
      sellosPorDia: [...porDia.entries()].map(([fecha, sellos]) => ({
        fecha,
        sellos,
      })),
    }
  }, [pedidos, mes, hoy])

  const [meta, setMeta] = useState<MetaVentasMes | null>(null)
  const [feriados, setFeriados] = useState<string[]>([])
  useEffect(() => {
    let vivo = true
    void fetchMetaVentasVigente(mes)
      .then(m => vivo && setMeta(m))
      .catch(() => {})
    void fetchFeriados(`${mes.slice(0, 4)}-01-01`, `${mes.slice(0, 4)}-12-31`)
      .then(f => vivo && setFeriados(f))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [mes])

  const delDia = useMemo(
    () =>
      meta ? metaDelDia({ meta, sellosPorDia, mes, hoy, feriados }) : null,
    [meta, sellosPorDia, mes, hoy, feriados]
  )

  if (meta && delDia) {
    return {
      cargando: pedidos.length === 0,
      mes,
      hoy: {
        valor: delDia.vendidosHoy,
        meta: Math.ceil(delDia.necesarioPorDiaObjetivo),
        habil: delDia.hoyEsHabil,
      },
      delMes: {
        valor: delDia.vendidosMes,
        meta: meta.objetivoSellos,
        minimo: meta.equilibrioSellos,
        minimoPorDia: Math.ceil(delDia.necesarioPorDiaEquilibrio),
        zona: delDia.zona,
      },
      metaDeOtroMes: meta.mes !== mes,
      unidad: 'sellos',
    }
  }
  return {
    cargando: pedidos.length === 0,
    mes,
    hoy: { valor: vendidosHoy, meta: META_ITEMS_DIA, habil: true },
    delMes: {
      valor: vendidosMes,
      meta: META_ITEMS_MES,
      minimo: null as number | null,
      minimoPorDia: null as number | null,
      zona: null as 'perdida' | 'aceptable' | 'ideal' | null,
    },
    metaDeOtroMes: false,
    unidad: 'ventas',
  }
}

/** Barra fina con relleno en degradado y, opcional, una marca (mínimo para no perder). */
function Barra({
  valor,
  meta,
  marca,
}: {
  valor: number
  meta: number
  marca?: number | null
}) {
  // Crece desde cero al aparecer.
  const listo = useAparecer()
  const pct = listo ? Math.min(100, (valor / Math.max(1, meta)) * 100) : 0
  const completo = valor >= meta && meta > 0
  return (
    <div className="relative h-1.5 w-full overflow-visible rounded-full bg-white/[0.08]">
      <div
        className={cn(
          GRADIENTE,
          'absolute inset-y-0 left-0 rounded-full transition-[width]',
          EASE,
          completo && 'shadow-[0_0_12px_rgba(246,163,61,0.7)]'
        )}
        style={{ width: `${pct}%` }}
      />
      {marca != null && marca > 0 && marca < meta ? (
        <div
          className="absolute -inset-y-1 w-px bg-white/60"
          style={{ left: `${(marca / meta) * 100}%` }}
          title={`Mínimo para no perder: ${marca}`}
        />
      ) : null}
    </div>
  )
}

const ZONA: Record<
  'perdida' | 'aceptable' | 'ideal',
  { texto: string; punto: string }
> = {
  perdida: { texto: 'Debajo del mínimo', punto: 'bg-white/35' },
  aceptable: { texto: 'Arriba del mínimo', punto: 'bg-[#e06b17]' },
  ideal: {
    texto: 'Objetivo cumplido',
    punto: 'bg-[#f6a33d] shadow-[0_0_8px_rgba(246,163,61,0.9)]',
  },
}

export function BarraObjetivos({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  const o = useObjetivos()
  const nombreMes = new Date(`${o.mes}-15T12:00:00`).toLocaleDateString(
    'es-AR',
    { month: 'long' }
  )
  const zona = o.delMes.zona ? ZONA[o.delMes.zona] : null
  const faltanHoy = Math.max(0, o.hoy.meta - o.hoy.valor)

  return (
    <div
      className={cn(
        // Mismo material que la barra lateral: bg-card, borde fino, radio 2xl, sombra.
        'flex h-[60px] items-center gap-7 rounded-2xl border bg-card/95 px-7 text-white shadow-2xl',
        // Mientras carga queda apenas apagada (sin titilar); las barras crecen al llegar los datos.
        'transition-opacity duration-500',
        o.cargando && 'opacity-70',
        className
      )}
      style={style}
    >
      {/* Hoy */}
      <div
        className="flex w-[210px] flex-col gap-2"
        title={
          o.hoy.habil ? `Faltan ${faltanHoy} para la meta de hoy` : undefined
        }
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-white/55">Hoy</span>
          {o.hoy.habil ? (
            <span className="text-[13px] tabular-nums text-white/45">
              <span className="text-[15px] font-semibold text-white">
                {o.hoy.valor}
              </span>{' '}
              / {o.hoy.meta}
            </span>
          ) : (
            <span className="text-[13px] text-white/45">No es día hábil</span>
          )}
        </div>
        <Barra
          valor={o.hoy.habil ? o.hoy.valor : 0}
          meta={o.hoy.habil ? o.hoy.meta : 1}
        />
      </div>

      <span aria-hidden className="h-7 w-px bg-white/[0.08]" />

      {/* Mes */}
      <div
        className="flex w-[260px] flex-col gap-2"
        title={
          o.delMes.minimo != null
            ? `Mínimo para no perder: ${o.delMes.minimo} en el mes (${o.delMes.minimoPorDia} por día hábil)${o.metaDeOtroMes ? ' · meta del mes anterior hasta que se actualice' : ''}`
            : undefined
        }
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-white/55 first-letter:uppercase">
            {nombreMes}
          </span>
          <span className="text-[13px] tabular-nums text-white/45">
            <span className="text-[15px] font-semibold text-white">
              {o.delMes.valor.toLocaleString('es-AR')}
            </span>{' '}
            / {o.delMes.meta.toLocaleString('es-AR')} {o.unidad}
          </span>
        </div>
        <Barra
          valor={o.delMes.valor}
          meta={o.delMes.meta}
          marca={o.delMes.minimo}
        />
      </div>

      {zona ? (
        <>
          <span aria-hidden className="h-7 w-px bg-white/[0.08]" />
          <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-white/70">
            <span className={cn('size-1.5 rounded-full', zona.punto)} />
            {zona.texto}
          </span>
        </>
      ) : null}
    </div>
  )
}
